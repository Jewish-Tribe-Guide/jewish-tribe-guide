import { gzipSync } from 'node:zlib'
import { expect, test, type Page } from '@playwright/test'
import { categoryAddButton, defaultCommunity, dismissLocationPrompt, largestCategory, ready } from './helpers'

// ─────────────────────────────────────────────────────────────────────────────
// What a page actually downloads.
//
// Every one of these budgets exists because the thing it guards happened here
// and nothing else noticed: it passed tsc, lint, every unit test and a look in
// the browser.
//
//  - A phone downloaded the desktop-only hero photo, then hid it. The image was
//    `priority`, which preloads from <head> with no media condition.
//  - Every category page loaded Cloudflare's Turnstile script and ran a
//    challenge, for a form almost nobody opened.
//  - The home grid marked ~10 tiles as top priority (per section, not per
//    page), most below the fold and hidden on desktop.
//  - A hardcoded 1.6 MB, 6000x4000 photo sat on the desktop home screen.
//
// So this counts requests and bytes, deliberately not timings: timing
// assertions on a shared CI runner are what make a suite flaky, and a suite
// that cries wolf gets ignored. Request counts and encoded byte sizes are
// deterministic.
//
// Each test gets a fresh browser context, which matters: Chrome doesn't defer a
// `loading="lazy"` image whose bytes are already in the memory cache, so a warm
// context makes lazy loading look broken (or, worse, look fine).
// ─────────────────────────────────────────────────────────────────────────────

type Loaded = { url: string; type: string; bytes: number }

/** Loads `path` and returns every request that finished, once the page has gone
 *  quiet (no new request for a second, or 8s at most — well inside the config's
 *  test timeout). Not `networkidle`: the map, zmanim and geolocation keep
 *  connections open, so it never settles. */
async function load(page: Page, path: string): Promise<Loaded[]> {
  const done: Loaded[] = []
  const sizing: Promise<void>[] = []
  let lastRequestAt = Date.now()

  page.on('request', () => {
    lastRequestAt = Date.now()
  })
  page.on('response', (response) => {
    sizing.push(
      response
        .body()
        .then((body) => {
          const type = response.request().resourceType()
          // Text is measured as gzip would send it. Playwright's own
          // request.sizes() reports -1/0 for a chunked response, which is what
          // a streamed page and its chunks are, so it can't be used here;
          // images are already compressed, so their length is what they cost.
          const compressible = type === 'script' || type === 'stylesheet' || type === 'document'
          done.push({
            url: response.url(),
            type,
            bytes: compressible ? gzipSync(body, { level: 6 }).length : body.length,
          })
        })
        // A redirect or an aborted request has no body to measure.
        .catch(() => {}),
    )
  })

  await page.goto(path)
  await dismissLocationPrompt(page)
  await ready(page)

  const deadline = Date.now() + 8_000
  while (Date.now() - lastRequestAt < 1_000 && Date.now() < deadline) await page.waitForTimeout(200)
  // Bounded: a response that never finishes (a stream, a long poll) would
  // otherwise make body() wait until the page closes and burn the whole test
  // budget. Whatever hasn't been sized by now isn't part of the page load.
  await Promise.race([Promise.allSettled(sizing), page.waitForTimeout(3_000)])
  return done
}

const kb = (n: number) => Math.round(n / 1024)
const isImage = (r: Loaded) => r.type === 'image' || r.url.includes('/_next/image')
const isScript = (r: Loaded) => r.type === 'script'
const sum = (rs: Loaded[]) => rs.reduce((a, r) => a + r.bytes, 0)

const TURNSTILE_HOST = 'challenges.cloudflare.com'

/** The desktop hero photo's URL, or null when this community has none set. */
async function heroUrl(page: Page, community: string): Promise<string | null> {
  const res = await page.request.get(`/api/site-settings?community=${community}`)
  const body = (await res.json()) as { ok: boolean; settings?: { desktopHeroImage?: { url: string } | null } }
  return body.ok ? (body.settings?.desktopHeroImage?.url ?? null) : null
}

/** Whether a request was for `assetUrl`, however it was fetched — directly, or
 *  through /_next/image with the original URL in its query string. */
function requestedAsset(loaded: Loaded[], assetUrl: string): boolean {
  const file = assetUrl.split('/').pop()!.split('?')[0]!
  return loaded.some((r) => decodeURIComponent(r.url).includes(file))
}

test.describe('home screen weight', () => {
  test('initial JavaScript stays under its ceiling', async ({ page }, testInfo) => {
    const community = await defaultCommunity(page)
    const loaded = await load(page, `/${community}`)

    const js = sum(loaded.filter(isScript))
    console.log(`[budget:${testInfo.project.name}] home js=${kb(js)}KB`)

    // ~344 KB gzipped when this was written, with PostHog already deferred.
    // The ceiling leaves room for ordinary growth but not for a dependency
    // landing in the initial bundle unnoticed — which is how PostHog (~90 KB)
    // and Sentry (~74 KB) got there.
    expect(kb(js), 'initial JavaScript, gzipped').toBeLessThan(400)
  })

  test('images stay light: none over 150 KB, and the total under 600 KB', async ({ page }, testInfo) => {
    const community = await defaultCommunity(page)
    const images = (await load(page, `/${community}`)).filter(isImage)

    console.log(`[budget:${testInfo.project.name}] home images=${images.length} (${kb(sum(images))}KB)`)

    // Chosen with the ten home tiles at ~15 KB each (the 384px step); the total moves with
    // how many lazy images the browser decides to fetch (290-415 KB observed), so this
    // leaves headroom without letting a 6000x4000 original (1.6 MB) back in.
    const heaviest = [...images].sort((a, b) => b.bytes - a.bytes)[0]
    expect(kb(heaviest?.bytes ?? 0), `largest image: ${heaviest?.url}`).toBeLessThan(150)
    expect(kb(sum(images)), 'total image bytes').toBeLessThan(600)
  })

  test('preloads no more than one row of tiles plus the hero', async ({ page }) => {
    const community = await defaultCommunity(page)
    await page.goto(`/${community}`)
    await ready(page)

    // 4 tiles (the first row of the first section) + the media-conditioned hero.
    // Every section used to mark its own first four, so this was 11.
    const preloads = await page.locator('head link[rel="preload"][as="image"]').count()
    expect(preloads).toBeLessThanOrEqual(6)
  })

  test('the desktop hero photo is fetched on desktop and never on a phone', async ({ page, isMobile }) => {
    const community = await defaultCommunity(page)
    const hero = await heroUrl(page, community)
    test.skip(!hero, 'this community has no desktop hero image set')

    const loaded = await load(page, `/${community}`)

    if (isMobile) {
      // It sits in a `hidden` subtree below the desktop breakpoint. A `priority`
      // image is preloaded from <head> regardless, so every phone downloaded a
      // photo it never showed.
      expect(requestedAsset(loaded, hero!), 'phones must not fetch the desktop hero').toBe(false)
    } else {
      // The positive control: without it, "not fetched" on mobile could just
      // mean this test can't see the request at all.
      expect(requestedAsset(loaded, hero!), 'desktop should fetch the hero').toBe(true)
    }
  })
})

test.describe('category page weight', () => {
  test('the server-rendered page stays under 100 KB gzipped, even for the largest category', async ({ page, request }, testInfo) => {
    const community = await defaultCommunity(page)
    const { category, count } = await largestCategory(request, community)
    const loaded = await load(page, `/${community}/${category.id}`)

    const doc = loaded.find((r) => r.type === 'document' && r.url.includes(`/${category.id}`))
    console.log(`[budget:${testInfo.project.name}] ${category.id} (${count} listings) html=${kb(doc?.bytes ?? 0)}KB`)

    // ~40 KB for 72 listings when this was written.
    expect(doc, 'the category document').toBeTruthy()
    expect(kb(doc!.bytes)).toBeLessThan(100)
  })

  test('browsing loads nothing from Turnstile, which only an Add/Edit form needs', async ({ page, request }) => {
    test.skip(
      !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
      'no Turnstile site key at build time, so the widget renders nothing and this could not fail',
    )
    const community = await defaultCommunity(page)
    const { category } = await largestCategory(request, community)

    const hosts: string[] = []
    page.on('request', (r) => void hosts.push(new URL(r.url()).host))

    await load(page, `/${community}/${category.id}`)
    expect(hosts.filter((h) => h === TURNSTILE_HOST), 'while only browsing').toHaveLength(0)

    // The positive control: opening the form does load it. Without this, the
    // assertion above passes just as happily when the widget is simply broken.
    await categoryAddButton(page).click()
    await expect.poll(() => hosts.includes(TURNSTILE_HOST), { timeout: 15_000 }).toBe(true)
  })
})
