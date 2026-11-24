// ─────────────────────────────────────────────────────────────────────────────
// Which image hosts next/image is allowed to optimize.
//
// Card photos and the logo are admin-supplied URLs, and an admin can paste
// anything — in practice that's a Supabase Storage upload or a stock photo
// pasted from Unsplash. next/image refuses to render a host it hasn't been
// told about, and that refusal is a thrown error, not a broken image: one
// pasted URL from an unlisted host would take down the whole home screen.
//
// So this list is the set we optimize, and anything else renders `unoptimized`
// (see optimizableImageHost below) — still lazy-loaded and still laid out
// correctly, just served as-is rather than resized. That way an admin can
// never break the page by pasting a link, which is the actual requirement.
//
// The list is deliberately narrow rather than a wildcard. The image optimizer
// fetches whatever URL it's given, server-side, and caches the result — a
// wildcard turns it into an open proxy and a bandwidth amplifier for anyone
// who can set a category image.
// ─────────────────────────────────────────────────────────────────────────────

/** Where uploaded files are served from: the database's own project, unless
 *  NEXT_PUBLIC_SUPABASE_STORAGE_URL says otherwise. Only CI sets it: its
 *  database is a local one loaded from the committed seed, whose uploads
 *  still live in the dev project's storage (Nov 23). The live site and
 *  previews leave it unset. */
export function storageUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_STORAGE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
}

/** Hosts worth routing through the optimizer, as next/image remotePatterns.
 *  Takes the storage URL (storageUrl()) rather than reading env directly so
 *  next.config.ts and the browser bundle can both call it. */
export function optimizedImagePatterns(supabaseUrl: string | undefined) {
  const patterns: { protocol: 'https'; hostname: string; pathname: string }[] = []

  // Uploads we host ourselves — arbitrary sizes, so the most worth resizing.
  if (supabaseUrl) {
    try {
      patterns.push({
        protocol: 'https',
        hostname: new URL(supabaseUrl).hostname,
        pathname: '/storage/v1/object/public/**',
      })
    } catch {
      // A malformed SUPABASE_URL shouldn't take the build down over images.
    }
  }

  // Unsplash, which is where the current card photos came from. Their URLs
  // already carry sizing params, but going through the optimizer still buys
  // AVIF/WebP and a size matched to the tile.
  patterns.push(
    { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
    { protocol: 'https', hostname: 'plus.unsplash.com', pathname: '/**' },
  )

  return patterns
}

/** True when `src` is on a host the optimizer is configured for. Anything else
 *  has to render with `unoptimized`, or next/image throws.
 *
 *  Two kill switches for Vercel's Image Optimization usage, both meant as an
 *  emergency lever if usage is about to run out for the month (Vercel has no
 *  built-in "auto-downgrade near the cap" feature — these are the manual
 *  substitute, flipped in response to Vercel's own usage-threshold emails),
 *  not a permanent setting; flip back off once the billing period resets.
 *  Both are env vars → Vercel env vars → redeploy to apply, since
 *  NEXT_PUBLIC_ vars are inlined at build time:
 *
 *  - NEXT_PUBLIC_IMAGES_UNOPTIMIZED=1 — everything, every host. The blunt,
 *    total kill switch.
 *  - NEXT_PUBLIC_UPLOADED_IMAGES_UNOPTIMIZED=1 — Supabase Storage only
 *    (admin/community-uploaded listing photos), leaving Unsplash category-
 *    tile photos optimized. Supabase Storage is the dominant volume driver
 *    (138 of 154 approved listings have an uploaded photo, each rendered at
 *    several fixed sizes across the map list/card/detail/chip — see
 *    CategoryIcon.tsx) against Unsplash's much smaller ~11 category tiles,
 *    which are also the ones most visible on every single home-screen visit
 *    — worth keeping crisp if only one has to give. Prefer this one first;
 *    reach for the total switch above only if it isn't enough on its own. */
export function isOptimizableImage(src: string): boolean {
  if (process.env.NEXT_PUBLIC_IMAGES_UNOPTIMIZED === '1') return false
  const supabaseUrl = storageUrl()
  try {
    const url = new URL(src)
    if (url.protocol !== 'https:') return false
    if (process.env.NEXT_PUBLIC_UPLOADED_IMAGES_UNOPTIMIZED === '1' && supabaseUrl) {
      try {
        if (url.hostname === new URL(supabaseUrl).hostname) return false
      } catch {
        // A malformed SUPABASE_URL shouldn't take this check down — fall
        // through to the normal patterns match below.
      }
    }
    const patterns = optimizedImagePatterns(supabaseUrl)
    return patterns.some((p) => {
      if (p.hostname !== url.hostname) return false
      // Only the two shapes actually used: an exact prefix, or "/**".
      const prefix = p.pathname.replace(/\*\*$/, '')
      return url.pathname.startsWith(prefix)
    })
  } catch {
    return false
  }
}

/** A small, cropped copy of a Supabase Storage photo, made by Storage's own
 *  image transformation — or null when `src` isn't one (or thumbnails are
 *  switched off), meaning "use the original".
 *
 *  Why this exists: a listing's photo is stored once, at up to 640px, and
 *  shown as a 40px avatar in every row of every list. With the Vercel
 *  optimizer turned off for uploads (UPLOADED_IMAGES_UNOPTIMIZED, above) each
 *  row downloaded the whole original — 14-50 KB for a picture the size of a
 *  thumbnail, ~2 MB across a long list. Measured on a real one: 13.5 KB
 *  original, 1.5 KB at 96px. Storage does the resize on its side and caches
 *  it, so this costs no Vercel optimizer quota at all, and needs no second
 *  copy at upload time and no backfill of existing photos.
 *
 *  `px` is the size the image is DISPLAYED at; it is doubled here so a
 *  2x-density screen is still sharp. The result is served directly, so render
 *  it `unoptimized` — and keep the original as a fallback, because Storage
 *  transformations are a plan feature (a project without them answers 400).
 *
 *  NEXT_PUBLIC_STORAGE_THUMBNAILS_DISABLED=1 turns this off everywhere (e.g.
 *  if Supabase's image-transformation usage ever needs cutting). */
export function storageThumbnailUrl(src: string, px: number): string | null {
  if (process.env.NEXT_PUBLIC_STORAGE_THUMBNAILS_DISABLED === '1') return null
  try {
    const url = new URL(src)
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) return null
    const from = '/storage/v1/object/public/'
    if (!url.pathname.startsWith(from)) return null

    const size = Math.min(512, Math.max(16, Math.round(px * 2)))
    url.pathname = url.pathname.replace(from, '/storage/v1/render/image/public/')
    url.search = ''
    url.searchParams.set('width', String(size))
    url.searchParams.set('height', String(size))
    url.searchParams.set('resize', 'cover')
    url.searchParams.set('quality', '70')
    return url.toString()
  } catch {
    return null
  }
}

/** The width a host-resized copy is asked for, at most: the largest of
 *  next.config.ts's deviceSizes. A 3840 request for a hero would be bytes no
 *  screen here shows. */
const LARGEST_COPY = 1920

/** Unsplash serves through imgix, which resizes on its own CDN: `w` sets the
 *  width (height follows the photo's shape, so a pasted `h` is dropped) and
 *  `auto=format` picks WebP or AVIF for the browser. */
function unsplashCopy({ src, width, quality }: { src: string; width: number; quality?: number }): string {
  const url = new URL(src)
  url.searchParams.delete('h')
  url.searchParams.set('w', String(Math.min(width, LARGEST_COPY)))
  url.searchParams.set('q', String(quality ?? 60))
  url.searchParams.set('auto', 'format')
  return url.toString()
}

/** Supabase Storage's own resize (the render endpoint storageThumbnailUrl
 *  uses), by width alone so the photo keeps its shape. */
function storageCopy({ src, width, quality }: { src: string; width: number; quality?: number }): string {
  const url = new URL(src)
  url.pathname = url.pathname.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
  url.search = ''
  url.searchParams.set('width', String(Math.min(width, LARGEST_COPY)))
  url.searchParams.set('quality', String(quality ?? 70))
  return url.toString()
}

const UNSPLASH_HOSTS = new Set(['images.unsplash.com', 'plus.unsplash.com'])

/** How next/image should fetch `src`, as props to spread onto it.
 *
 *  A photo whose own host resizes (Unsplash, our Storage) gets a `loader`
 *  that asks that host for each width in the srcset: the browser fetches a
 *  copy the size it draws, and Vercel's optimizer, metered and sometimes
 *  switched off (above), is never involved. Until Nov 20 these went through
 *  the optimizer or, with it off, whole: a 2070px Unsplash photo for a 108px
 *  home tile, 159 KB, on the live site's phone home.
 *
 *  Storage photos go to the optimizer while it's on, and to Storage's own
 *  copies (honouring STORAGE_THUMBNAILS_DISABLED) while it's off. Anything
 *  else is as before: the optimizer for a listed host, the original for the
 *  rest. */
export function photoProps(src: string): { loader?: (p: { src: string; width: number; quality?: number }) => string; unoptimized?: boolean } {
  try {
    const url = new URL(src)
    if (url.protocol === 'https:') {
      if (UNSPLASH_HOSTS.has(url.hostname)) return { loader: unsplashCopy }
      const supabase = storageUrl()
      // Storage only stands in for the optimizer when it's off: its WebP is
      // heavier than the optimizer's copy (the desktop home's map photo,
      // 1280px: 207 KB against under 150), though far lighter than the
      // original (475 KB).
      if (
        !isOptimizableImage(src) &&
        process.env.NEXT_PUBLIC_STORAGE_THUMBNAILS_DISABLED !== '1' &&
        supabase &&
        url.hostname === new URL(supabase).hostname &&
        url.pathname.startsWith('/storage/v1/object/public/')
      ) {
        return { loader: storageCopy }
      }
    }
  } catch {
    // Not a URL: next/image is handed it as it is, unoptimized, below.
  }
  return { unoptimized: !isOptimizableImage(src) }
}
