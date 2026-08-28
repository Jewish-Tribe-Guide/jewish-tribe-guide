import sharp from 'sharp'
import { cacheLife, cacheTag } from 'next/cache'
import { getSiteSettings } from '@/lib/siteSettingsStore'
import { getDefaultCommunity } from '@/lib/communityStore'
import { TAGS } from '@/lib/cacheTags'

// ─────────────────────────────────────────────────────────────────────────────
// App icons, generated from the logo the admin uploaded.
//
// Adding the site to a phone's home screen showed the Next.js starter logo,
// because src/app/favicon.ico was never replaced (it still has the template's
// June 4th timestamp) and the manifest pointed its only icon at it. So the one
// place the app looks most like a real app — an icon on someone's home screen
// — was advertising the framework.
//
// Generated rather than committed as static files because the logo is
// admin-editable and per-community: uploading a new one in /admin should
// change the home-screen icon too, without anyone regenerating and committing
// a set of PNGs. The source is already square (1254×1254), so this is a
// straight downscale.
//
// Cached with the same tag as the rest of the site settings, so it re-renders
// when — and only when — an admin changes the logo.
// ─────────────────────────────────────────────────────────────────────────────

/** The sizes referenced by the manifest and the metadata tags. Anything else
 *  404s rather than letting a URL trigger arbitrary resizing work. */
const ALLOWED_SIZES = [32, 180, 192, 512]

/** How much of a home-screen icon the artwork should occupy.
 *
 *  A logo that fills its tile edge to edge looks oversized on a home screen —
 *  next to Waze, Maps or Roku, which all sit around 60-70%, it reads as
 *  shouting. iOS masks the corners but never scales artwork down, so the
 *  breathing room has to be in the image.
 *
 *  Done here rather than by asking for a pre-padded upload, because the same
 *  logo is also the site header's mark, where a tight crop is exactly right at
 *  36px. One upload, and each place insets it to suit itself.
 *
 *  0.72 for maskable rather than 0.70: Android crops it to the launcher's
 *  shape and only the middle ~80% survives, so this still clears that, and the
 *  extra couple of percent offsets how much the crop visually shrinks it.
 *
 *  The browser tab favicon is excluded entirely — at 32px, padding spends
 *  pixels there is no room for, and a favicon filling its frame is normal. */
const ARTWORK_FRACTION = { plain: 0.7, maskable: 0.72 }
const FAVICON_SIZE = 32

/** The logo's own background colour, read from its top-left pixel.
 *
 *  A logo is conventionally drawn on a flat backdrop with the artwork inset,
 *  so the corner is a reliable sample. Falls back to transparent if it can't
 *  be read — better to show the launcher's own background than to guess a
 *  colour and paint a mismatched border around the artwork. */
async function backgroundOf(source: Buffer): Promise<{ r: number; g: number; b: number; alpha: number }> {
  try {
    const { data, info } = await sharp(source).raw().toBuffer({ resolveWithObject: true })
    const [r, g, b] = data
    // A transparent corner means the logo is meant to float, so keep it that way.
    const alpha = info.channels === 4 ? data[3] / 255 : 1
    return { r, g, b, alpha }
  } catch {
    return { r: 255, g: 255, b: 255, alpha: 0 }
  }
}

async function renderIcon(size: number, maskable: boolean): Promise<ArrayBuffer | null> {
  'use cache'
  cacheTag(TAGS.siteSettings((await getDefaultCommunity()).slug))
  cacheLife('days')

  const settings = await getSiteSettings((await getDefaultCommunity()).slug).catch(() => null)
  const logoUrl = settings?.logoUrl?.trim()
  if (!logoUrl) return null

  try {
    const res = await fetch(logoUrl)
    if (!res.ok) return null
    const source = Buffer.from(await res.arrayBuffer())

    // Android crops a maskable icon to whatever shape the launcher uses — a
    // circle, a squircle, a rounded square — and only the middle ~80% is
    // guaranteed to survive, which is why it gets its own fraction above.
    //
    // The uploaded file's own whitespace is removed first, so the result
    // depends on the artwork rather than on how the logo happened to be
    // exported. Without this a fixed inset gives a different final size for
    // every upload — a tightly-cropped logo comes out large, a generously
    // padded one comes out tiny. Verified against three very differently
    // padded versions of this logo: all three land at 70%. `trim` is a no-op
    // on an image with no uniform border, which degrades to the old behaviour.
    const artwork = size === FAVICON_SIZE ? source : await sharp(source).trim().toBuffer().catch(() => source)

    const fraction = size === FAVICON_SIZE ? 1 : maskable ? ARTWORK_FRACTION.maskable : ARTWORK_FRACTION.plain
    // Padding is derived first and the inner size from it, so the result is
    // exactly `size` on both axes. Rounding the inner size instead produced a
    // 513×513 icon for a manifest entry that declares 512×512.
    const pad = Math.round((size * (1 - fraction)) / 2)
    const inner = size - pad * 2

    // Match the padding to the logo's own background rather than assuming
    // white. This one is rgb(253,253,253), and padding it with pure white left
    // a visible square seam around the artwork. Sampling the corner also means
    // it adapts to whatever an admin uploads next, including a transparent or
    // coloured background.
    const backdrop = await backgroundOf(source)

    const png = await sharp(artwork)
      // `contain` rather than `cover`: a logo cropped to fill a square loses
      // its edges, and these are usually wordmarks or emblems where that's the
      // whole design. Padding keeps it intact.
      .resize(inner, inner, { fit: 'contain', background: backdrop })
      .extend({
        top: pad,
        bottom: pad,
        left: pad,
        right: pad,
        // A maskable icon is cropped to the launcher's shape and the fill
        // shows through the corners, so it can't be transparent there.
        background: maskable ? { ...backdrop, alpha: 1 } : backdrop,
      })
      .png()
      .toBuffer()

    // Copied into a plain ArrayBuffer — a Node Buffer isn't a serializable
    // return value for a cached function.
    const out = new ArrayBuffer(png.byteLength)
    new Uint8Array(out).set(png)
    return out
  } catch (err) {
    console.error(`[icons] could not render ${size}px icon:`, err)
    return null
  }
}

export async function GET(request: Request, ctx: RouteContext<'/icons/[size]'>) {
  const { size: raw } = await ctx.params
  const size = Number(raw)
  if (!ALLOWED_SIZES.includes(size)) {
    return new Response('Not found', { status: 404 })
  }

  // ?maskable=1 — see renderIcon. Only the manifest asks for this.
  const maskable = new URL(request.url).searchParams.get('maskable') === '1'
  const png = await renderIcon(size, maskable)
  // No logo set, or it couldn't be fetched. A 404 is right: the manifest and
  // the metadata only reference these when a logo exists, so this is the
  // "someone requested it anyway" path.
  if (!png) return new Response('Not found', { status: 404 })

  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      // Long, because the URL is stable and an admin logo change invalidates
      // the cache tag above rather than the URL.
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
