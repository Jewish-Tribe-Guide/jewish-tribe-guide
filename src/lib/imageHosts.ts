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

/** Hosts worth routing through the optimizer, as next/image remotePatterns.
 *  Takes the Supabase URL rather than reading env directly so next.config.ts
 *  and the browser bundle can both call it. */
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
 *  has to render with `unoptimized`, or next/image throws. */
export function isOptimizableImage(src: string): boolean {
  const patterns = optimizedImagePatterns(process.env.NEXT_PUBLIC_SUPABASE_URL)
  try {
    const url = new URL(src)
    if (url.protocol !== 'https:') return false
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
