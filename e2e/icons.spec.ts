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
    expect(html).toMatch(/<link rel="apple-touch-icon"[^>]*href="\/icons\/180"/)
  })

  test('the browser tab icon points at the generated set', async ({ request }) => {
    const html = await (await request.get('/')).text()
    expect(html).toMatch(/<link rel="icon"[^>]*href="\/icons\/32"/)
  })

  test('the manifest advertises real icon sizes', async ({ request }) => {
    const manifest = await (await request.get('/manifest.webmanifest')).json()

    expect(manifest.icons.length).toBeGreaterThan(0)
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true)
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
})
