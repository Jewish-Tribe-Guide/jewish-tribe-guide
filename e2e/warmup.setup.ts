import { test as setup, expect } from '@playwright/test'
import { defaultCommunity } from './helpers'

// ─────────────────────────────────────────────────────────────────────────────
// Warm the content caches before any test runs.
//
// Every public content read is `use cache` with `cacheLife('days')` (see
// categoryStore/siteSettingsStore/…), so it costs one real Supabase round trip
// on a cold server and microseconds after that. `next start` in CI is always
// cold, and the suite is fullyParallel across three workers — so a dozen tests
// reach for /api/categories at the same instant and every one of them waits
// behind the same in-flight miss. One slow round trip there is charged to
// whichever test happened to run out of its 30s budget first, while its
// siblings pass on the now-warm cache.
//
// That is exactly the shape of the CI failure this exists to prevent: a single
// `pins.spec.ts` test timing out inside `categoryWithListings`, with the call
// log showing the request still in flight and no response, while the other
// test in the same file calling the same helper passed.
//
// Not a retry — nothing here re-runs a failed assertion. It moves the one
// unavoidable cold read out of a test's own timeout and into a step whose job
// is to pay it, once, with room to spare.
// ─────────────────────────────────────────────────────────────────────────────
setup('warm the content caches', async ({ page, request }) => {
  // Generous: this step exists precisely because the first read can be slow,
  // and failing it on the same 30s the tests use would just move the problem.
  setup.setTimeout(120_000)

  // Also warms the server-rendered page path (and the "/" redirect) for free.
  const community = await defaultCommunity(page)

  // categories/resources/site-settings/communities were the original set;
  // home-sections/forms/hospitals were missing — loadCommunityContent (the
  // community layout's own server-side read, backing every page including
  // the home screen) calls all seven of these underlying stores, so leaving
  // the last three cold left them exposed to the exact race this file's own
  // comment describes. Reported live: home.spec.ts assertions on content
  // that should already be on the page ("What are you looking for?", the
  // Update Listings card's Add button) failing with "element(s) not found"
  // — not a rendering bug, a dozen parallel tests all racing the same
  // in-flight miss on one of these three. campaign-banners joined
  // loadCommunityContent later and gets the same treatment up front rather
  // than waiting to reproduce the same bug a fourth time.
  const responses = await Promise.all([
    request.get(`/api/categories?community=${community}`),
    request.get(`/api/resources?community=${community}`),
    request.get(`/api/site-settings?community=${community}`),
    request.get('/api/communities'),
    request.get(`/api/home-sections?community=${community}`),
    request.get(`/api/forms?community=${community}`),
    request.get(`/api/hospitals?community=${community}`),
    request.get(`/api/campaign-banners?community=${community}`),
  ])

  // A content read that's outright broken should say so here, once, rather
  // than as a confusing assertion failure in whichever test hit it first.
  for (const res of responses) {
    expect(res.ok(), `${res.url()} returned ${res.status()}`).toBe(true)
  }
})
