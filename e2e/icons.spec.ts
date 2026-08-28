import sharp from 'sharp'
import { expect, test } from '@playwright/test'

// The home-screen icon was the Next.js logo for the life of the project,
// because favicon.ico was never replaced and nothing pointed anywhere else.
// It's the kind of thing nobody looks at twice, so it needs a test.

test.describe('app icons', () => {
  test('the framework’s starter assets are gone', async ({ request }) => {
    for (const path of ['/favicon.ico', '/vercel.svg', '/next.svg']) {
      const res = await request.get(path)
      expect(res.status(), `${path} should not be served`).toBe(404)
    }
  })

  test('iOS gets an apple-touch-icon', async ({ request }) => {
    // iOS reads this, not the manifest, for "Add to Home Screen" — the manifest
    // alone left iPhones falling back to the favicon.
    const html = await (await request.get('/')).text()
    // The ?v= is part of the contract, not incidental: iOS caches this icon
    // hard once the site is on a home screen, so a logo change has to change
    // the URL or the phone keeps the old picture forever. See iconVersion.
    expect(html).toMatch(/<link rel="apple-touch-icon"[^>]*href="\/icons\/180\?v=[^"]+"/)
  })

  test('the browser tab icon points at the generated set', async ({ request }) => {
    const html = await (await request.get('/')).text()
    expect(html).toMatch(/<link rel="icon"[^>]*href="\/icons\/32\?v=[^"]+"/)
  })

  test('the manifest advertises real icon sizes', async ({ request }) => {
    const manifest = await (await request.get('/manifest.webmanifest')).json()

    expect(manifest.icons.length).toBeGreaterThan(0)
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true)
    // Same reason as the apple-touch-icon above — an unversioned icon URL is
    // one a CDN and a launcher will both keep serving after a logo change.
    for (const icon of manifest.icons as { src: string }[]) {
      expect(icon.src, icon.src).toMatch(/[?&]v=/)
    }
  })

  test('every icon the manifest and metadata reference actually resolves', async ({ request }) => {
    const manifest = await (await request.get('/manifest.webmanifest')).json()
    const srcs: string[] = manifest.icons.map((i: { src: string }) => i.src)

    for (const src of [...srcs, '/icons/32', '/icons/180']) {
      const res = await request.get(src)
      expect(res.status(), `${src} should resolve`).toBe(200)
      expect(res.headers()['content-type'], `${src} should be a PNG`).toContain('image/png')
    }
  })

  test('icons are the size they claim to be', async ({ request }) => {
    const manifest = await (await request.get('/manifest.webmanifest')).json()

    for (const icon of manifest.icons as { src: string; sizes: string }[]) {
      const body = await (await request.get(icon.src)).body()
      // PNG header: width and height are two big-endian uint32s at byte 16.
      const width = body.readUInt32BE(16)
      const height = body.readUInt32BE(20)
      const [declared] = icon.sizes.split('x').map(Number)

      // A padded maskable icon came out 513×513 for a 512×512 declaration,
      // because the padding was rounded after the inner size rather than before.
      expect(`${width}x${height}`, `${icon.src} declares ${icon.sizes}`).toBe(
        `${declared}x${declared}`,
      )
    }
  })

  test('an unlisted icon size is refused', async ({ request }) => {
    // The route resizes on demand, so the allowed set is bounded deliberately.
    const res = await request.get('/icons/9999')
    expect(res.status()).toBe(404)
  })

  // The home-screen icons inset the logo; the favicon does not. Both halves
  // matter: an icon that fills its tile looms next to real apps on a home
  // screen, and a favicon that doesn't fill its tile wastes pixels it hasn't
  // got at 32px. Measured as "how much of the tile is not background", which
  // is coarse but enough to catch the inset being dropped or applied to the
  // wrong sizes.
  test('home-screen icons leave breathing room, the favicon does not', async ({ request }) => {
    const coverage = async (path: string) => {
      const buf = Buffer.from(await (await request.get(path)).body())
      const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const { width, height, channels } = info
      let top = height
      let bottom = 0
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * channels
          if (data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200) {
            if (y < top) top = y
            if (y > bottom) bottom = y
            break
          }
        }
      }
      return bottom < top ? 0 : (bottom - top + 1) / height
    }

    expect(await coverage('/icons/192'), 'home-screen icon should be inset').toBeLessThan(0.8)
    expect(await coverage('/icons/192'), 'but still be the dominant thing on the tile').toBeGreaterThan(0.55)
    expect(await coverage('/icons/32'), 'favicon should fill its frame').toBeGreaterThan(0.8)
  })
})