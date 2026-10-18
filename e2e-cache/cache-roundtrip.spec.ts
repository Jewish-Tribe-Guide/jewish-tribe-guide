import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { previewSettings } from '../e2e/helpers'
import { IN_FLIGHT_RENDER_GRACE_MS } from '../src/lib/inFlightRenderGrace'

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
//
// This test's old intermittent failure — every poll HIT/old while the row held
// the new body — was a race, found 2026-10-17: the site-settings test's
// restore leaves /about stale, so this test's first GET started a
// regeneration just before its PATCH, and Next stored that regeneration (built
// from the old row) as newer than the save's invalidation. The test below this
// one sets that race up on purpose; the fix is the PATCH route's delayed
// second invalidation (revalidateAfterInFlightRenders.ts). See AGENTS.md's
// "…and /about had a second problem underneath it".
test('an admin save to a static page reaches the cached /about route', async ({ request }) => {
  const { accessToken } = JSON.parse(readFileSync('e2e-cache/.auth/token.json', 'utf-8')) as {
    accessToken: string
  }
  const authHeaders = { Authorization: `Bearer ${accessToken}` }

  // /about moved under /[community] (for the header/footer that comes with
  // living there — see AboutPage's own doc) — same "/" redirect trick the
  // site-settings test above uses to find which community this project's
  // seed data actually uses.
  const initialPage = await request.get('/')
  const community = new URL(initialPage.url()).pathname.split('/').filter(Boolean)[0]
  expect(community, 'the "/" redirect should land on a community').toBeTruthy()

  const beforeRes = await request.get('/api/admin/pages', { headers: authHeaders })
  expect(beforeRes.ok(), 'GET /api/admin/pages should succeed with the minted admin token').toBe(true)
  const before = await beforeRes.json()
  expect(before.ok).toBe(true)
  const aboutPage = before.pages.find((p: { slug: string }) => p.slug === 'about')
  expect(aboutPage, 'the seed migration should have created an "about" row').toBeTruthy()
  const originalBody: string = aboutPage.body

  const newBody = `Cache round-trip check ${Date.now()}`
  expect(await (await request.get(`/${community}/about`)).text()).not.toContain(newBody)

  try {
    const patchRes = await request.patch('/api/admin/pages/about', {
      headers: authHeaders,
      data: { body: newBody },
    })
    expect(patchRes.ok(), 'PATCH /api/admin/pages/about should succeed').toBe(true)
    expect((await patchRes.json()).ok).toBe(true)

    // 60s, and it does not weaken this test. A healthy save converges in
    // 1-2s; one that lands mid-regeneration (this test's usual case — see the
    // note above it) converges once the route's delayed second invalidation
    // runs, IN_FLIGHT_RENDER_GRACE_MS (5s) after the save. A genuine
    // invalidation bug is unbounded, not slow: the entry would live for
    // cacheLife('days'), so it fails at 60s as surely as at 20s.
    //
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
          const res = await request.get(`/${community}/about`)
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

// The race behind the /about test's old HIT/old failure, set up on purpose
// instead of waiting for CI to stumble into it.
//
// Next stamps a route's cached page with the time it was WRITTEN. A
// regeneration that starts before the admin's save — reading the old row —
// and finishes after the save's invalidation is therefore stored as newer
// than the invalidation, and served as a fresh HIT for days. The test above
// only met this by accident: the site-settings test's restore leaves /about
// stale, so its first GET started a regeneration right before its PATCH.
//
// Each round here does that deliberately: settle /about, mark it stale through
// a community tag it carries, GET it once (STALE — a regeneration is now in
// flight), and save straight away. Against the route without its second,
// delayed invalidation (revalidateAfterInFlightRenders.ts) a round loses the
// save about three times in four — 6 of 8 in the probe that pinned this — so
// three rounds make a pass on the broken code a ~1-in-60 event. With it, each
// round lands once the second pass runs, IN_FLIGHT_RENDER_GRACE_MS after the
// save.
test('an admin save lands even when /about is mid-regeneration', async ({ request }) => {
  test.setTimeout(150_000)
  const { accessToken } = JSON.parse(readFileSync('e2e-cache/.auth/token.json', 'utf-8')) as {
    accessToken: string
  }
  const authHeaders = { Authorization: `Bearer ${accessToken}` }

  const community = new URL((await request.get('/')).url()).pathname.split('/').filter(Boolean)[0]
  expect(community, 'the "/" redirect should land on a community').toBeTruthy()

  const pagesRes = await request.get('/api/admin/pages', { headers: authHeaders })
  expect(pagesRes.ok()).toBe(true)
  const originalBody: string = (await pagesRes.json()).pages.find((p: { slug: string }) => p.slug === 'about').body
  const settingsRes = await request.get('/api/admin/site-settings', { headers: authHeaders })
  expect(settingsRes.ok()).toBe(true)
  // Re-saved unchanged: the point is the invalidation the save performs, not
  // the value, so there is nothing to restore.
  const siteName: string = (await settingsRes.json()).settings.name

  const aboutUrl = `/${community}/about`
  const header = (res: { headers(): Record<string, string> }) => res.headers()['x-nextjs-cache'] ?? 'no-header'

  try {
    for (let round = 1; round <= 3; round++) {
      // Sit out the previous save's delayed second invalidation, so it cannot
      // land in the middle of this round's setup and turn the STALE below
      // into a MISS. Every save in this suite schedules one.
      await new Promise((resolve) => setTimeout(resolve, IN_FLIGHT_RENDER_GRACE_MS + 1_000))

      // Settle: a fresh entry that the next step can mark stale.
      await expect
        .poll(async () => header(await request.get(aboutUrl)), {
          timeout: 15_000,
          message: `round ${round}: /about should settle to a cached HIT before the race is set up`,
        })
        .toBe('HIT')

      const settingsPatch = await request.patch('/api/admin/site-settings', {
        headers: authHeaders,
        data: { name: siteName },
      })
      expect(settingsPatch.ok(), 'PATCH /api/admin/site-settings should succeed').toBe(true)

      // The visitor whose request starts the regeneration. STALE is the proof
      // that one is now running in the background, reading the current row.
      const visitor = await request.get(aboutUrl)
      expect(
        header(visitor),
        `round ${round}: /about should be STALE here, with a regeneration started behind it — ` +
          'anything else means this round did not set up the race it exists to test',
      ).toBe('STALE')

      const marker = `Mid-regeneration check ${Date.now()} round ${round}`
      const patchRes = await request.patch('/api/admin/pages/about', {
        headers: authHeaders,
        data: { body: marker },
      })
      expect(patchRes.ok(), 'PATCH /api/admin/pages/about should succeed').toBe(true)

      const seen: string[] = []
      await expect
        .poll(
          async () => {
            const res = await request.get(aboutUrl)
            const hit = (await res.text()).includes(marker)
            seen.push(`${header(res)}${hit ? '/new' : '/old'}`)
            return hit
          },
          {
            timeout: 20_000,
            message:
              `round ${round}: the save landed while /about was regenerating from the old row. ` +
              'HIT/old to the end means that regeneration was stored as fresh over the save — the ' +
              'delayed second invalidation (revalidateAfterInFlightRenders.ts) did not run or did not reach it',
          },
        )
        .toBe(true)
        .catch((err: Error) => {
          throw new Error(`${err.message}\n\nlast ${Math.min(seen.length, 12)} of ${seen.length} polls: ${seen.slice(-12).join(' ')}`)
        })
    }
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
  // The classic home, whose phone grid has every category: asked for the way
  // the admin's Preview does it (writes nothing), so this doesn't depend on
  // which home the admin has chosen. The Today home has no grid on a phone.
  await previewSettings(page, community, { homeStyle: 'classic' })
  await page.goto(`/${community}?preview=1`)
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
