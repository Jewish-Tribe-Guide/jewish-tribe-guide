import { expect, test } from '@playwright/test'
import { categoryWithListings, defaultCommunity, dismissLocationPrompt, ready } from './helpers'

// ─────────────────────────────────────────────────────────────────────────────
// The service worker.
//
// Until now this was verified by hand exactly once, by stopping the server —
// which is a fine way to check it works today and no way at all to notice when
// it stops. The motivating case is someone in a hospital basement with one bar
// who wants to know where the nearest kosher grocery is.
//
// Two things are checked here, and the second matters more than the first:
//
//   1. The directory survives losing signal.
//   2. Nothing under /admin or /inbox is ever written to disk. Those pages hold
//      the names and phone numbers of people asking for help, on whatever
//      device happened to open them. A caching bug there is a privacy incident,
//      not a performance regression — and it would be completely invisible in
//      normal use, because caching something extra never looks like a failure.
//
// Runs on desktop only: the worker isn't viewport-dependent, and installing one
// twice against the same server doubles the slowest tests in the suite for no
// extra signal.
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.skip(({ browserName }) => browserName !== 'chromium', 'service workers need Chromium')
test.skip(({ isMobile }) => !!isMobile, 'the worker is not viewport-dependent')

/** Waits for the worker to be not just registered but *controlling* the page —
 *  a registered worker that hasn't taken over yet caches nothing, so asserting
 *  on registration alone would pass while offline support was broken.
 *
 *  Done in two steps rather than one wait on `controller`, which was flaky
 *  under a parallel run. ServiceWorker.tsx registers on `window.load`, and the
 *  worker then has to install (which fetches /offline over the network),
 *  activate, and claim before it controls anything. Waiting on the end of that
 *  chain means waiting on a race. Waiting for activation and then reloading if
 *  the page still isn't controlled makes it deterministic: a page loaded after
 *  a worker is active is always controlled by it. */
async function serviceWorkerReady(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(
    async () => {
      const reg = await navigator.serviceWorker?.getRegistration()
      return !!reg?.active
    },
    null,
    { timeout: 30_000 },
  )

  if (await page.evaluate(() => navigator.serviceWorker.controller == null)) {
    await page.reload()
    await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, {
      timeout: 30_000,
    })
  }
}

/** Every URL the worker has written to any of its caches. */
async function cachedUrls(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(async () => {
    const names = await caches.keys()
    const urls: string[] = []
    for (const name of names) {
      const cache = await caches.open(name)
      for (const request of await cache.keys()) urls.push(request.url)
    }
    return urls
  })
}

test.describe('service worker', () => {
  test('registers and takes control of the page', async ({ page }) => {
    const community = await defaultCommunity(page)
    await ready(page)
    await serviceWorkerReady(page)

    const scope = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      return reg?.scope ?? null
    })
    // Scoped to the origin root, so it covers every community, not just this one.
    expect(scope).toBe(new URL('/', page.url()).href)
    expect(community).toBeTruthy()
  })

  test('pre-caches the offline page during install', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    await serviceWorkerReady(page)

    // Pre-caching happens in the install handler, which may still be running.
    await expect
      .poll(async () => (await cachedUrls(page)).some((u) => new URL(u).pathname === '/offline'), {
        timeout: 10_000,
      })
      .toBe(true)
  })

  test('shows the directory again after losing signal', async ({ page, request, context }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)

    await page.goto(`/${community}/${category.id}`)
    await ready(page)
    await dismissLocationPrompt(page)
    await serviceWorkerReady(page)

    // The visit that populates the cache. A worker that only took control on
    // this load wouldn't have seen the first one.
    await page.reload()
    await ready(page)

    // Waited for, not snapshotted: the content is client-rendered, so <main> is
    // briefly an empty fallback even once `ready()` has seen the header.
    await expect(page.locator('main')).toContainText(category.pluralLabel)
    const online = await page.locator('main').innerText()

    await context.setOffline(true)
    try {
      const response = await page.reload()
      expect(response?.status(), 'the cached page should be served, not an error').toBe(200)
      await ready(page)
      await dismissLocationPrompt(page)

      // The listing names are the whole point — a shell with empty content
      // would technically load and be useless.
      await expect(page.locator('main')).toContainText(category.pluralLabel)
      const offlineText = await page.locator('main').innerText()
      expect(offlineText.length).toBeGreaterThan(0)
      expect(online.length).toBeGreaterThan(0)
    } finally {
      await context.setOffline(false)
    }
  })

  test('falls back to the offline page for somewhere never visited', async ({ page, context }) => {
    const community = await defaultCommunity(page)
    await ready(page)
    await serviceWorkerReady(page)
    await expect
      .poll(async () => (await cachedUrls(page)).some((u) => new URL(u).pathname === '/offline'), {
        timeout: 10_000,
      })
      .toBe(true)

    await context.setOffline(true)
    try {
      // A category that cannot be in the cache, because it doesn't exist.
      const response = await page.goto(`/${community}/never-visited-${Date.now()}`)
      expect(response?.status(), 'the browser error page would be a 0/failed navigation').toBe(200)
      // Rather than the browser's dinosaur.
      await expect(page.locator('body')).toContainText(/offline|connection|no signal/i)
    } finally {
      await context.setOffline(false)
    }
  })

  test('serves a content API from cache when the network is gone', async ({ page, context }) => {
    const community = await defaultCommunity(page)
    await ready(page)
    await serviceWorkerReady(page)

    const url = `/api/categories?community=${community}`
    // Prime it through the page, so the worker (not Playwright) makes the request.
    await page.evaluate((u) => fetch(u).then((r) => r.json()), url)
    await expect
      .poll(async () => (await cachedUrls(page)).some((u) => u.includes('/api/categories')), { timeout: 10_000 })
      .toBe(true)

    await context.setOffline(true)
    try {
      const body = await page.evaluate(
        (u) => fetch(u).then((r) => r.json()).catch(() => null),
        url,
      )
      expect(body?.ok, 'the cached category list should still answer offline').toBe(true)
      expect(Array.isArray(body.categories)).toBe(true)
    } finally {
      await context.setOffline(false)
    }
  })
})

test.describe('the service worker never caches personal data', () => {
  // These pages carry submitted names, phone numbers and hospital rooms. The
  // rule is in isCacheable() in public/sw.js; this proves the rule is actually
  // reached, which reading the function cannot.
  for (const path of ['/admin', '/inbox']) {
    test(`nothing from ${path} is written to disk`, async ({ page }) => {
      await page.goto('/')
      await ready(page)
      await serviceWorkerReady(page)

      await page.goto(path)
      await page.waitForLoadState('domcontentloaded')
      // Give the worker a chance to do the wrong thing before asserting it didn't.
      await page.waitForTimeout(1_000)

      const paths = (await cachedUrls(page)).map((u) => new URL(u).pathname)
      expect(paths.filter((p) => p.startsWith(path))).toEqual([])
      expect(paths.filter((p) => p.startsWith(`/api${path}`))).toEqual([])
    })
  }

  test('write endpoints are never replayed from cache', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    await serviceWorkerReady(page)

    // A GET to a write endpoint is the only thing the worker could cache — a
    // POST it ignores outright. Either way nothing should be stored.
    for (const path of ['/api/submissions', '/api/requests', '/api/votes', '/api/search-miss']) {
      await page.evaluate((p) => fetch(p).catch(() => null), path)
    }
    await page.waitForTimeout(500)

    const paths = (await cachedUrls(page)).map((u) => new URL(u).pathname)
    for (const path of ['/api/submissions', '/api/requests', '/api/votes', '/api/search-miss']) {
      expect(paths, path).not.toContain(path)
    }
  })
})
