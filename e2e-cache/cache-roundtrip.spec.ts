import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { serverMarkup } from '../e2e/helpers'

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
// This app calls revalidateTag(tag, 'max') (see revalidateContent.ts), which
// Next's own docs describe as stale-while-revalidate: the tag is marked
// stale, but the NEXT request after that can still serve the old page while a
// fresh one regenerates in the background — only a later request is
// guaranteed fresh. So this polls for the new content rather than asserting
// it appears on the very next fetch, which would either flake or (worse)
// pass by accident. If the new content never shows up, that's the actual bug
// this test exists to catch.
// ─────────────────────────────────────────────────────────────────────────────

const { accessToken } = JSON.parse(readFileSync('e2e-cache/.auth/token.json', 'utf-8')) as {
  accessToken: string
}
const authHeaders = { Authorization: `Bearer ${accessToken}` }

test('an admin save reaches the cached public page', async ({ request }) => {
  const initialPage = await request.get('/')
  const community = new URL(initialPage.url()).pathname.split('/').filter(Boolean)[0]
  expect(community, 'the "/" redirect should land on a community').toBeTruthy()

  const beforeRes = await request.get('/api/admin/site-settings', { headers: authHeaders })
  expect(beforeRes.ok(), 'GET /api/admin/site-settings should succeed with the minted admin token').toBe(true)
  const before = await beforeRes.json()
  expect(before.ok).toBe(true)
  const originalHeroTitle: string = before.settings.heroTitle

  const newHeroTitle = `Cache round-trip check ${Date.now()}`
  expect(serverMarkup(await initialPage.text())).not.toContain(newHeroTitle)

  try {
    const patchRes = await request.patch('/api/admin/site-settings', {
      headers: authHeaders,
      data: { heroTitle: newHeroTitle },
    })
    expect(patchRes.ok(), 'PATCH /api/admin/site-settings should succeed').toBe(true)
    expect((await patchRes.json()).ok).toBe(true)

    // The actual round trip: the admin's save called revalidatePublicContent(),
    // which should eventually make the home page's cached render pick up the
    // new heroTitle — proving the write path's tags and the read path's tags
    // are the same tags, not just individually correct in isolation.
    await expect
      .poll(
        async () => {
          const res = await request.get(`/${community}`)
          return serverMarkup(await res.text())
        },
        {
          timeout: 20_000,
          message: 'waiting for the revalidated home page to serve the new heroTitle',
        },
      )
      .toContain(newHeroTitle)
  } finally {
    // site_settings is a singleton row, not something this test created — put
    // it back even if an assertion above failed.
    await request.patch('/api/admin/site-settings', {
      headers: authHeaders,
      data: { heroTitle: originalHeroTitle },
    })
  }
})
