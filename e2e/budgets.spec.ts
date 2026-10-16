import { gzipSync } from 'node:zlib'
import { expect, test, type Page } from '@playwright/test'
import { openAddForm, defaultCommunitySlug, dismissLocationPrompt, largestCategory, ready } from './helpers'

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

  // The measured load must be this browser's first. These tests used to find
  // the community by opening "/" in the same page, and that visit registered
  // the service worker. Its install sometimes finished halfway through the
  // load measured here, and on taking control it fetched every script again,
  // after the preloads already had: every script counted twice, so the phone
  // home read 653 KB instead of 326, intermittently and more often under load.
  // That visit's late prefetches landed in the count as well. Find the community
  // with defaultCommunitySlug(request), never by navigating.
  expect(page.url(), 'load() must be the first navigation in this context').toBe('about:blank')

  // Only what the page needs for itself, not what its links prefetch. A
  // prefetched route's data names its client code, and the browser fetches
  // that code on arrival: the phone home read 464 KB in full runs and 312 KB
  // alone (Oct 16), the difference being the shuls page's code, prefetched
  // through a desktop card's link drawn for a moment before the phone has
  // measured itself. Whether it comes at all depends on whether the server
  // has the target's prefetch ready, which is whatever the tests before
  // this one happened to visit. So the router's prefetches are refused
  // here; a real addition to the page's own bundle still counts in full.
  await page.route(
    (url) => url.searchParams.has('_rsc'),
    (route) => (route.request().headers()['next-router-prefetch'] ? route.abort() : route.fallback()),
  )

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
  test('initial JavaScript stays under its ceiling', async ({ page, request }, testInfo) => {
    const community = await defaultCommunitySlug(request)
    const loaded = await load(page, `/${community}`)

    const js = sum(loaded.filter(isScript))
    console.log(`[budget:${testInfo.project.name}] home js=${kb(js)}KB`)

    // ~344 KB gzipped when this was written, with PostHog already deferred.
    // The ceiling leaves room for ordinary growth but not for a dependency
    // landing in the initial bundle unnoticed — which is how PostHog (~90 KB)
    // and Sentry (~74 KB) got there.
    expect(kb(js), 'initial JavaScript, gzipped').toBeLessThan(400)
  })

  // You (Oct 14) asks saved searches again with the home's own search
  // (useHomeSearch), so it carries the home's search code: held to the
  // home's ceiling, not one of its own.
  test('the You page’s initial JavaScript stays under the home’s ceiling', async ({ page, request }, testInfo) => {
    const community = await defaultCommunitySlug(request)
    const loaded = await load(page, `/${community}/you`)

    const js = sum(loaded.filter(isScript))
    console.log(`[budget:${testInfo.project.name}] you js=${kb(js)}KB`)
    expect(kb(js), 'initial JavaScript, gzipped').toBeLessThan(400)
  })

  // A phone's first render is the computer layout, until it has measured
  // itself, and the computer cards' links prefetched on it: every phone home
  // fetched the shuls page's data and ~150 KB of its code, for a card it
  // never shows (Oct 16). load() refuses prefetches, so this watches them.
  test('a phone prefetches nothing from the computer-only cards; a computer does', async ({ page, request, isMobile }) => {
    const community = await defaultCommunitySlug(request)
    const prefetched: string[] = []
    page.on('request', (r) => {
      if (r.headers()['next-router-prefetch']) prefetched.push(decodeURIComponent(r.url()))
    })
    await page.goto(`/${community}`)
    await dismissLocationPrompt(page)
    await ready(page)
    const fromCards = () => prefetched.filter((u) => u.includes('davening=1'))

    if (isMobile) {
      // The page itself prefetches its own route; that's the sign this sees
      // prefetches at all, and the cards' would have come with it.
      await expect.poll(() => prefetched.length, 'any prefetch at all').toBeGreaterThan(0)
      await page.waitForTimeout(1_500)
      expect(fromCards(), 'the "View Times" card’s link, on a phone').toEqual([])
    } else {
      // The positive control: on a computer the card is real, and its link
      // prefetches once it's on screen.
      await page.getByRole('link', { name: 'View Times' }).scrollIntoViewIfNeeded()
      await expect.poll(() => fromCards().length, 'the "View Times" card’s link, on a computer').toBeGreaterThan(0)
    }
  })

  test('images stay light: none over 150 KB, and the total under 600 KB', async ({ page, request }, testInfo) => {
    const community = await defaultCommunitySlug(request)
    const images = (await load(page, `/${community}`)).filter(isImage)

    console.log(`[budget:${testInfo.project.name}] home images=${images.length} (${kb(sum(images))}KB)`)

    // Chosen with the ten home tiles at ~15 KB each (the 384px step); the total moves with
    // how many lazy images the browser decides to fetch (290-415 KB observed), so this
    // leaves headroom without letting a 6000x4000 original (1.6 MB) back in.
    const heaviest = [...images].sort((a, b) => b.bytes - a.bytes)[0]
    expect(kb(heaviest?.bytes ?? 0), `largest image: ${heaviest?.url}`).toBeLessThan(150)
    expect(kb(sum(images)), 'total image bytes').toBeLessThan(600)
  })

  test('preloads no more than one row of tiles plus the hero', async ({ page, request }) => {
    const community = await defaultCommunitySlug(request)
    await page.goto(`/${community}`)
    await ready(page)

    // 4 tiles (the first row of the first section) + the media-conditioned hero.
    // Every section used to mark its own first four, so this was 11.
    const preloads = await page.locator('head link[rel="preload"][as="image"]').count()
    expect(preloads).toBeLessThanOrEqual(6)
  })

  test('the desktop hero photo is fetched on desktop and never on a phone', async ({ page, request, isMobile }) => {
    const community = await defaultCommunitySlug(request)
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
    const community = await defaultCommunitySlug(request)
    const { category, count } = await largestCategory(request, community)
    const loaded = await load(page, `/${community}/${category.id}`)

    const doc = loaded.find((r) => r.type === 'document' && r.url.includes(`/${category.id}`))
    console.log(`[budget:${testInfo.project.name}] ${category.id} (${count} listings) html=${kb(doc?.bytes ?? 0)}KB`)

    // ~40 KB for 72 listings when this was written.
    expect(doc, 'the category document').toBeTruthy()
    expect(kb(doc!.bytes)).toBeLessThan(100)
  })

  // The map beside the list is desktop only. A phone downloads neither its
  // code nor Google's script: the component isn't drawn there, and React's
  // lazy() only fetches it when it is (next/dynamic fetched it anyway). The
  // desktop project is the positive control, so this can't pass because the
  // map is simply broken.
  test('a phone loads nothing from Google Maps on a category page; a desktop loads the map beside the list', async ({ page, request, isMobile }) => {
    const community = await defaultCommunitySlug(request)
    const { category } = await largestCategory(request, community)

    const hosts: string[] = []
    page.on('request', (r) => void hosts.push(new URL(r.url()).host))
    await load(page, `/${community}/${category.id}`)

    const google = hosts.filter((h) => h === 'maps.googleapis.com' || h === 'maps.gstatic.com')
    if (isMobile) expect(google, 'a phone browsing a category page').toHaveLength(0)
    else expect(google.length, 'a desktop draws the map beside the list').toBeGreaterThan(0)
  })

  test('browsing loads nothing from Turnstile, which only an Add/Edit form needs', async ({ page, request }) => {
    test.skip(
      !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
      'no Turnstile site key at build time, so the widget renders nothing and this could not fail',
    )
    const community = await defaultCommunitySlug(request)
    const { category } = await largestCategory(request, community)

    const hosts: string[] = []
    page.on('request', (r) => void hosts.push(new URL(r.url()).host))

    await load(page, `/${community}/${category.id}`)
    expect(hosts.filter((h) => h === TURNSTILE_HOST), 'while only browsing').toHaveLength(0)

    // The positive control: opening the form does load it. Without this, the
    // assertion above passes just as happily when the widget is simply broken.
    await openAddForm(page)
    await expect.poll(() => hosts.includes(TURNSTILE_HOST), { timeout: 15_000 }).toBe(true)
  })
})
