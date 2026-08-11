import { expect, test, type Page } from '@playwright/test'
import { categoryWithListings, defaultCommunity } from './helpers'

// A more patient version of helpers.ts' dismissLocationPrompt: that one is a
// single point-in-time check (`isVisible()`, no retry), which assumes the
// prompt — if it's going to show at all — has already rendered by the time
// it's called. It hadn't, reliably, on this spec's pages: LiveLocationPrompt
// only becomes visible once useLiveLocation's own mount effects resolve,
// which lands after the search box's own visible signal. Missing the dismiss
// here isn't cosmetic like it is elsewhere — the prompt is a full-screen
// overlay, and every following interaction in these tests is a click, which
// its overlay blocks outright rather than just failing a visibility
// assertion. This polls briefly instead of checking once.
async function dismissLocationPromptIfItAppears(page: Page): Promise<void> {
  const notNow = page.getByRole('button', { name: 'Not now' })
  const appeared = await notNow
    .waitFor({ state: 'visible', timeout: 3000 })
    .then(() => true)
    .catch(() => false)
  if (!appeared) return
  await notNow.click()
  await notNow.waitFor({ state: 'hidden' })
}

// Pinning is entirely client-side (localStorage — see src/lib/pinned.ts), no
// database, no accounts. These check the two things that matter for that: a
// pin survives a reload the same as a real visitor's would, and it actually
// reaches the map screen's "Pinned" filter chip rather than just sitting in
// storage unread.
//
// Nothing here writes to the database — see the suite-wide rule in
// AGENTS.md. localStorage is scoped to Playwright's own browser context, so
// nothing here persists beyond the test either.
//
// The pin control itself (see PinButton) only ever renders inside a
// listing's own map detail view now (MapPlaceDetail) — it deliberately isn't
// offered on the category directory rows or the map's nearby list, only once
// you've actually opened a listing on the map. That makes every path to it
// go through Google's own marker/selection handling, which this suite's
// build can't exercise: this build runs on localhost:3210 (see
// playwright.config.ts), which isn't in the Google Maps API key's allowed
// referrers, so the map fails outright — reproducibly, with zero
// interaction, straight off a plain `/map` load ("The map couldn't load.
// Check that the Google Maps API key is configured…"), independent of
// anything these tests do. Real, correctly-allowlisted domains never hit
// this. So rather than drive the (locally unusable) UI path to the pin
// control, these seed `jpc:pinned-listings` directly — same shape
// `togglePinned` itself produces (see pinned.test.ts for that function's own
// coverage) — and check the two things that are actually this suite's job to
// prove: that a pin already in storage is read back after a reload, and that
// it reaches the map screen's Pinned chip. PinButton's own click/toggle
// behavior is exercised elsewhere it doesn't require a live map (it renders
// the same everywhere it's used).
async function seedPinned(page: Page, listing: { id: string; categoryId: string }): Promise<void> {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    ['jpc:pinned-listings', JSON.stringify([listing])],
  )
}

test.describe('pinned listings', () => {
  test('a pin already in storage survives a reload', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)
    const res = await request.get(`/api/resources?category=${category.id}&community=${community}`)
    const body = await res.json()
    const listing = (body.resources as { id: string }[])[0]

    await seedPinned(page, { id: listing.id, categoryId: category.id })

    await page.goto(`/${community}/map`)
    const searchInput = page.getByPlaceholder(/Search name, address/)
    await searchInput.waitFor({ state: 'visible' })
    await dismissLocationPromptIfItAppears(page)

    // The count is its own text node right after "Pinned" with no space in
    // between (see the chip's own JSX) — matching on the accessible name via
    // the role locator itself, rather than toContainText's raw textContent,
    // is what actually tolerates that.
    const pinnedChip = page.getByRole('button', { name: /^Pinned\s*1$/ }).and(page.locator(':visible'))
    await expect(pinnedChip).toBeVisible()

    await page.reload()
    await searchInput.waitFor({ state: 'visible' })
    await dismissLocationPromptIfItAppears(page)

    // Still there after a reload, same as a real visitor's localStorage would be.
    await expect(pinnedChip).toBeVisible()
  })

  test('reaches the map screen\'s Pinned filter chip', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)
    const res = await request.get(`/api/resources?category=${category.id}&community=${community}`)
    const body = await res.json()
    const listing = (body.resources as { id: string }[])[0]

    // Nothing pinned yet — the chip shouldn't exist at all (see the
    // pinned.length > 0 gate on it in ResourceMapView).
    await page.goto(`/${community}/map`)
    const searchInput = page.getByPlaceholder(/Search name, address/)
    await searchInput.waitFor({ state: 'visible' })
    await dismissLocationPromptIfItAppears(page)
    await expect(page.getByRole('button', { name: /^Pinned \d+$/ })).toHaveCount(0)

    await seedPinned(page, { id: listing.id, categoryId: category.id })
    await page.reload()
    await searchInput.waitFor({ state: 'visible' })
    await dismissLocationPromptIfItAppears(page)

    const pinnedChip = page.getByRole('button', { name: /^Pinned\s*1$/ }).and(page.locator(':visible'))
    await expect(pinnedChip).toBeVisible()
  })
})
