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
// This test is RUNNING again, and it is the experiment for a fix.
//
// What the instrumentation below established, so nobody re-derives it:
//   • The stored row holds the new body (asserted before the poll), so the
//     write and the sanitizer are innocent.
//   • Every failing poll is HIT/old — 62 in CI, 61 locally. A healthy run
//     reads STALE/old → HIT/new. The failure never reaches STALE at all, so
//     the page's cached entry was never marked. That rules out
//     stale-while-revalidate, which this file blamed for months.
//   • Not reproducible on demand. Warm server 15/15 and 12/12 clean, cold
//     build with the dist dir deleted 5/5 clean, the suite itself 5/5 clean
//     across warm and cold. It was also wrongly called CI-only after several
//     clean local runs, then reproduced locally within the hour.
//
// The mechanism was never confirmed, but the symptom was precise — this
// path's cache entry was never marked stale — so the PATCH route now calls
// revalidatePath(`/${slug}`) alongside revalidateTag. That closed it: this
// test (conditionally test.fail()'d on CI while the fix was unproven) has
// come back an unexpected PASS in CI, which is Playwright's own signal that
// the marker is stale and needs to come off, not that anything is newly
// broken — see AGENTS.md's "…and /about had a second problem underneath it"
// section for the full history. If /about ever regresses with the same
// HIT/old signature, revalidatePath isn't reaching that entry either and the
// next suspect is the build-time prerender, not the tag — but that's a new
// investigation to reopen, not a reason to keep this marker pre-emptively.
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
    // Read the row back through the UNCACHED admin route first. This splits
    // the failure in two, and the split is the whole point: if the row does
    // not hold the new body, the write or the sanitizer is at fault and the
    // cache is innocent; only if it does is this a caching question at all.
    //
    // Worth its own assertion because the sanitizer rewrites what it stores
    // (see the PATCH route), so "what I sent" and "what was saved" are not the
    // same claim.
    const savedRes = await request.get('/api/admin/pages', { headers: authHeaders })
    const saved = (await savedRes.json()).pages.find((p: { slug: string }) => p.slug === 'about')
    expect(
      saved?.body,
      'the PATCH reported success, so the stored row must hold the new body — if it does not, ' +
        'this is a write/sanitizer failure and nothing to do with the cache',
    ).toContain(newBody)

    // Every poll's cache header and outcome, kept for the failure message.
    // This test has been misdiagnosed twice, both times because the failure
    // said only "the predicate never came true" — which cannot distinguish an
    // invalidation that never arrived (HIT, forever, with the old body) from a
    // regeneration that keeps failing behind a stale entry (STALE, forever).
    // Those need opposite fixes, so the failure has to name which one it is.
    const seen: string[] = []
    await expect
      .poll(
        async () => {
          const res = await request.get('/about')
          const body = await res.text()
          const hit = body.includes(newBody)
          seen.push(`${res.headers()['x-nextjs-cache'] ?? 'no-header'}${hit ? '/new' : '/old'}`)
          return hit
        },
        {
          timeout: 60_000,
          message:
            'waiting for the revalidated /about page to serve the new body. ' +
            'The row already holds it (asserted above), so this is the cache. ' +
            'x-nextjs-cache per poll follows — all HIT/old means the invalidation ' +
            'never reached this server; STALE/old means it did and the regeneration ' +
            'behind it is failing',
        },
      )
      .toBe(true)
      .catch((err: Error) => {
        // Re-thrown with the observed sequence attached, since Playwright's own
        // poll failure does not carry it.
        const tail = seen.slice(-12).join(' ')
        throw new Error(`${err.message}\n\nlast ${Math.min(seen.length, 12)} of ${seen.length} polls: ${tail}`)
      })
  } finally {
    await request.patch('/api/admin/pages/about', {
      headers: authHeaders,
      data: { body: originalBody },
    })
  }
})

// The client-side half of the same story, and a different failure mode from
// the two tests above.
//
// Those prove the SERVER stops serving stale content after an admin saves.
// This proves a BROWSER THAT IS ALREADY OPEN eventually sees it. Those are
// not the same thing here, and the gap between them was a real bug:
// [community]/layout.tsx loads categories, site settings, home sections,
// forms and hospitals once and hands them to ContentProvider, and an App
// Router layout does not re-render on client-side navigation between the
// screens under it (that layout's own comment calls this out as a feature —
// it replaced five post-hydration fetches). So all five were pinned to
// whatever they were when the tab first loaded, for as long as the tab
// stayed open, no matter how thoroughly the server had been revalidated.
// Only a full document load picked up an admin's edit.
//
// That matters most in the case this app is actually used in: an installed
// PWA on a phone that gets backgrounded rather than closed, or a desktop tab
// left open for days. RefreshContentOnFocus fixes it by asking the server
// again when the tab is next looked at — the same trigger, and the same
// reasoning, useNow.ts already uses to resync the clock.
//
// Measured, not guessed: the server converges 2–4s after the admin save (the
// probe that established this watched x-nextjs-cache go STALE → HIT), so
// anything still stale well after that is the client holding onto it.
test('an already-open tab picks up an admin edit when it regains focus', async ({ page, request }) => {
  // Deliberately generous. The bulk is one unavoidable wait: the refresh is
  // throttled (see RefreshContentOnFocus) so that rapid alt-tabbing doesn't
  // fire a request per switch, and this has to sit out that window to
  // exercise the real thing rather than a version of it weakened for the test.
  test.setTimeout(90_000)

  const { accessToken } = JSON.parse(readFileSync('e2e-cache/.auth/token.json', 'utf-8')) as {
    accessToken: string
  }
  const authHeaders = { Authorization: `Bearer ${accessToken}` }

  const initialPage = await request.get('/')
  const community = new URL(initialPage.url()).pathname.split('/').filter(Boolean)[0]
  expect(community, 'the "/" redirect should land on a community').toBeTruthy()

  const catsRes = await request.get(`/api/categories?community=${community}`)
  expect(catsRes.ok(), 'GET /api/categories should succeed').toBe(true)
  const { categories } = await catsRes.json()

  // A narrow (mobile-width) viewport rather than the default desktop one:
  // desktop's home screen embeds a live Google Map, and a test origin isn't
  // an authorized referer for the Maps key, which takes the whole page down
  // to its error boundary. Below the `desktop:` breakpoint (globals.css —
  // width or height under 640px), the map band never mounts (it's gated on
  // an IntersectionObserver over a `display:none` element, which never
  // intersects) and the full grouped category grid renders inline instead —
  // this used to navigate to the standalone All Categories page for the same
  // reason, which is gone now that "Browse everything" replaced it.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/${community}`)
  // The location prompt overlays everything and swallows clicks (AGENTS.md
  // says the same about the mobile suite).
  const notNow = page.getByRole('button', { name: 'Not now' })
  await notNow.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
  await notNow.click().catch(() => {})
  await page.locator('header').first().waitFor({ state: 'visible' })

  // A dedicated fixture (scripts/run-test-project-server.mjs), not borrowed
  // from whatever else happens to be visible on /all right now. This used to
  // scan the page for any real listing category and rename that instead —
  // but integration, cache-roundtrip, form-roundtrip and admin-write all
  // write to and delete from this same disposable project, often in
  // parallel, so another job renaming/hiding/deleting the borrowed category
  // out from under this one made it fail intermittently with "at least one
  // listing category should be visible on /all to borrow". Nothing else
  // touches this category, so nothing else can race it. Restored in
  // `finally` regardless (a rename is still a rename).
  const target = (categories as { id: string; pluralLabel: string; kind: string }[]).find(
    (c) => c.id === 'cache-roundtrip-seed',
  )
  expect(target, 'the cache-roundtrip fixture category should exist — see run-test-project-server.mjs').toBeTruthy()
  const slug = target!.id
  const originalLabel = target!.pluralLabel
  const newLabel = `${originalLabel} (focus refresh ${Date.now() % 100000})`

  try {
    const patchRes = await request.patch(`/api/admin/categories/${slug}?community=${community}`, {
      headers: authHeaders,
      data: { label: newLabel, pluralLabel: newLabel },
    })
    expect(patchRes.ok(), 'renaming the borrowed category should succeed').toBe(true)

    // Wait out the server side explicitly, so a failure below can only mean
    // the client held onto stale content — never that the server hadn't
    // caught up yet. This is the distinction an earlier version of this
    // investigation got wrong.
    await expect
      .poll(async () => (await (await request.get(`/${community}/${slug}`)).text()).includes(newLabel), {
        timeout: 30_000,
        message: 'waiting for the server itself to serve the renamed category',
      })
      .toBe(true)

    // The tab has not reloaded, so its layout content is still the pre-rename
    // set. Confirm that first — without it, a passing test below could just
    // mean the rename was visible all along.
    await page.getByText(originalLabel, { exact: true }).first().click()
    await page.waitForURL(new RegExp(`/${slug}$`))
    await page.locator('header').first().waitFor({ state: 'visible' })
    await expect(
      page.getByRole('heading', { level: 1 }).and(page.locator(':visible')),
      'before refocusing, an open tab should still be showing the pre-rename name',
    ).toHaveText(originalLabel)

    // Sit out the refresh throttle (see this test's own timeout note).
    await page.waitForTimeout(11_000)

    // Dispatched rather than driven by really backgrounding the tab, and the
    // reason is measured: Playwright's bringToFront() fires NOTHING in
    // headless Chromium. Instrumenting the page to record every
    // visibilitychange/focus/blur it saw across a full
    // newPage -> bringToFront -> bringToFront cycle recorded an empty array,
    // and the content correctly did not refresh, because nothing had
    // happened. So that version of this test would have passed for the wrong
    // reason forever — it proved only that an event which never arrived
    // changed nothing.
    //
    // What this does and does not cover is worth being exact about. It covers
    // our own wiring: that when these events arrive, the layout's content is
    // re-fetched and what is on screen updates. It does not cover Chromium
    // firing them on a real tab switch — that is web-platform behaviour, not
    // something this app can get wrong, and not something a change here could
    // regress.
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // router.refresh() is asynchronous, so this polls rather than asserting on
    // the next tick.
    await expect(
      page.getByRole('heading', { level: 1 }).and(page.locator(':visible')),
      'after refocusing, the open tab should have picked up the rename',
    ).toHaveText(newLabel, { timeout: 15_000 })
  } finally {
    await request
      .patch(`/api/admin/categories/${slug}?community=${community}`, {
        headers: authHeaders,
        data: { label: originalLabel, pluralLabel: originalLabel },
      })
      .catch(() => {})
  }
})
