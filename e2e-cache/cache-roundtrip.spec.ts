import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

// ─────────────────────────────────────────────────────────────────────────────
// The other half of caching.spec.ts.
//
// caching.spec.ts proves pages are served from the cache; unit tests prove the
// write path invalidates every tag the read path uses. Neither has ever
// watched the two halves actually meet: an admin saves, and a real visitor's
// next page load shows the change. This does — against the disposable test
// Supabase project (see run-cache-e2e-server.mjs), through the real admin API,
// with a real production build so Cache Components behaves as it does live.
//
// This asserts on the <title> tag, not the page body. AGENTS.md documents
// that [community]/page.tsx's body content sits inside a Suspense boundary
// that never resolves server-side (a known, separately-tracked bug — the
// body ships as the literal fallback shell). Running this suite against
// heroTitle (rendered in the body) first proved that firsthand: the poll
// below timed out every time, not because revalidation was broken, but
// because the body text it was looking for is never in the server response
// at all, cache or no cache. generateMetadata's <title>/OG tags read the
// same getSiteSettings() + same cacheTag, but render outside that boundary
// (AGENTS.md: "Titles, metadata and Open Graph tags render server-side too"
// — this is the test that actually proves that claim, not just states it).
//
// This app calls revalidateTag(tag, 'max') (see revalidateContent.ts), which
// Next's own docs describe as stale-while-revalidate: the tag is marked
// stale, but the NEXT request after that can still serve the old page while a
// fresh one regenerates in the background — only a later request is
// guaranteed fresh. So this polls for the new content rather than asserting
// it appears on the very next fetch, which would either flake or (worse)
// pass by accident. If the new content never shows up, that's the actual bug
// this test exists to catch.
// ─────────────────────────────────────────────────────────────────────────────

function titleTag(html: string): string | null {
  return html.match(/<title>([^<]*)<\/title>/)?.[1] ?? null
}

test('an admin save reaches the cached public page', async ({ request }) => {
  // Read at test-run time, not module-load time — Playwright loads every
  // project's test files up front to build its test list, before the
  // `setup` project (dependencies: ['setup']) has actually run and written
  // this file. A top-level read here would always see a stale-or-missing
  // file regardless of project dependency order.
  const { accessToken } = JSON.parse(readFileSync('e2e-cache/.auth/token.json', 'utf-8')) as {
    accessToken: string
  }
  const authHeaders = { Authorization: `Bearer ${accessToken}` }

  const initialPage = await request.get('/')
  const community = new URL(initialPage.url()).pathname.split('/').filter(Boolean)[0]
  expect(community, 'the "/" redirect should land on a community').toBeTruthy()

  const beforeRes = await request.get('/api/admin/site-settings', { headers: authHeaders })
  expect(beforeRes.ok(), 'GET /api/admin/site-settings should succeed with the minted admin token').toBe(true)
  const before = await beforeRes.json()
  expect(before.ok).toBe(true)
  const originalName: string = before.settings.name

  const newName = `Cache round-trip check ${Date.now()}`
  expect(titleTag(await initialPage.text())).not.toBe(newName)

  try {
    const patchRes = await request.patch('/api/admin/site-settings', {
      headers: authHeaders,
      data: { name: newName },
    })
    expect(patchRes.ok(), 'PATCH /api/admin/site-settings should succeed').toBe(true)
    expect((await patchRes.json()).ok).toBe(true)

    // The actual round trip: the admin's save called revalidatePublicContent(),
    // which should eventually make the home page's cached <title> pick up the
    // new site name — proving the write path's tags and the read path's tags
    // are the same tags, not just individually correct in isolation.
    await expect
      .poll(
        async () => {
          const res = await request.get(`/${community}`)
          return titleTag(await res.text())
        },
        {
          timeout: 20_000,
          message: 'waiting for the revalidated home page to serve the new site name in <title>',
        },
      )
      .toBe(newName)
  } finally {
    // site_settings is a singleton row, not something this test created — put
    // it back even if an assertion above failed.
    await request.patch('/api/admin/site-settings', {
      headers: authHeaders,
      data: { name: originalName },
    })
  }
})

// Same shape of proof, for the `page` table (About/Privacy) added alongside
// this test: its cache tag (TAGS.pages) is global rather than per-community,
// invalidated by the admin route calling revalidateTag directly instead of
// going through revalidatePublicContent — a different enough code path from
// site-settings above that a bug in one wouldn't show up in the other.
test('an admin save to a static page reaches the cached /about route', async ({ request }) => {
  const { accessToken } = JSON.parse(readFileSync('e2e-cache/.auth/token.json', 'utf-8')) as {
    accessToken: string
  }
  const authHeaders = { Authorization: `Bearer ${accessToken}` }

  const beforeRes = await request.get('/api/admin/pages', { headers: authHeaders })
  expect(beforeRes.ok(), 'GET /api/admin/pages should succeed with the minted admin token').toBe(true)
  const before = await beforeRes.json()
  expect(before.ok).toBe(true)
  const aboutPage = before.pages.find((p: { slug: string }) => p.slug === 'about')
  expect(aboutPage, 'the seed migration should have created an "about" row').toBeTruthy()
  const originalBody: string = aboutPage.body

  const newBody = `Cache round-trip check ${Date.now()}`
  expect(await (await request.get('/about')).text()).not.toContain(newBody)

  try {
    const patchRes = await request.patch('/api/admin/pages/about', {
      headers: authHeaders,
      data: { body: newBody },
    })
    expect(patchRes.ok(), 'PATCH /api/admin/pages/about should succeed').toBe(true)
    expect((await patchRes.json()).ok).toBe(true)

    // 60s, not 20s, and the reason is measured rather than guessed — a
    // timeout raised on a hunch is how a real caching bug gets buried.
    //
    // This test failed intermittently in CI (roughly one run in thirty). The
    // invalidation itself was instrumented by reading x-nextjs-cache on every
    // poll, and it is not the problem: the transition is STALE → HIT on every
    // observed run, in 15/15 repeated saves against a warm server (median
    // 453ms), 3/3 single saves against a freshly booted one (~950ms), and 5/5
    // full cold runs of this suite (1.2–1.6s). Cold start is under a second,
    // so the earlier theory that this needed warm-up time was simply wrong.
    //
    // What is left is stale-while-revalidate: revalidateTag(…, 'max') serves
    // the stale entry while regenerating behind it, so a single failed
    // regeneration — a transient Supabase timeout while four CI jobs share one
    // test project — leaves the old body being served rather than retrying at
    // once. That matches the shape of the failure exactly: every success lands
    // in well under two seconds and the rare failure never lands at all.
    //
    // Which is also why 60s does not weaken this test. A genuine invalidation
    // bug is unbounded, not slow: the entry would live for cacheLife('days'),
    // so it fails at 60s as surely as at 20s. The extra headroom only covers a
    // regeneration that had to be retried.
    await expect
      .poll(
        async () => {
          const res = await request.get('/about')
          return (await res.text()).includes(newBody)
        },
        {
          timeout: 60_000,
          message: 'waiting for the revalidated /about page to serve the new body',
        },
      )
      .toBe(true)
  } finally {
    await request.patch('/api/admin/pages/about', {
      headers: authHeaders,
      data: { body: originalBody },
    })
  }
})
