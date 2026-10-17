import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { categoryWithListings, categoryWithMapPoints, defaultCommunity, defaultCommunitySlug, largestCategory } from './helpers'

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

// Saving (Pin until Oct 14) is entirely client-side (localStorage — see
// src/lib/pinned.ts, whose key keeps the old name), no database, no accounts.
// These check: the bookmark at the top of a listing saves it, with Undo; a
// save survives a reload the same as a real visitor's would; and it reaches
// the map screen's "Saved" chip rather than just sitting in storage unread.
//
// Nothing here writes to the database — see the suite-wide rule in
// AGENTS.md. localStorage is scoped to Playwright's own browser context, so
// nothing here persists beyond the test either.
//
// The map tests below don't save from the map itself: every path to a place
// there goes through Google's own marker/selection handling, which this
// suite's build can't exercise: this build runs on localhost:3210 (see
// playwright.config.ts), which isn't in the Google Maps API key's allowed
// referrers, so the map fails outright — reproducibly, with zero
// interaction, straight off a plain `/map` load ("The map couldn't load.
// Check that the Google Maps API key is configured…"), independent of
// anything these tests do. Real, correctly-allowlisted domains never hit
// this. So rather than drive the (locally unusable) UI path to the pin
// control, these seed `jpc:pinned-listings` directly — same shape
// `togglePinned` itself produces (see pinned.test.ts for that function's own
// coverage) — and check that a save already in storage is read back after a
// reload, and that it reaches the map screen's Saved chip. The bookmark
// itself is driven for real on a listing's own page, which needs no map.
// The Saved chip counts only pinned places the map can show (see
// ResourceMapView's mappablePinnedCount), so the pinned listing has to have
// coordinates. These tests used to pin the first listing of whichever
// category came first, alphabetically, with any listings at all — on the
// test project a fixture category whose one listing has no geo, and on the
// real site Cemetery, which collects no address — so the chip never
// appeared and both tests failed on every run, written off for a long time
// as local noise.
async function mappableListing(request: APIRequestContext, community: string): Promise<{ id: string; category: string }> {
  const { category } = await categoryWithMapPoints(request, community)
  const res = await request.get(`/api/resources?category=${category.id}&community=${community}`)
  const resources = (await res.json()).resources as { id: string; geo?: unknown }[]
  const listing = resources.find((r) => r.geo)
  if (!listing) throw new Error(`categoryWithMapPoints returned ${category.id}, but none of its listings has geo`)
  return { id: listing.id, category: category.id }
}

async function seedPinned(page: Page, listing: { id: string; categoryId: string }): Promise<void> {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    ['jpc:pinned-listings', JSON.stringify([listing])],
  )
}

test.describe('saved places', () => {
  // The bookmark beside the thumbs-up (canvas page "you", board YouSave):
  // filled once saved, "Saved to You · Undo", still saved after a reload;
  // tapping again takes it off, and Undo puts it back.
  test('the bookmark at the top of a listing saves it, with Undo', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)
    const res = await request.get(`/api/resources?category=${category.id}&community=${community}`)
    const item = ((await res.json()).resources as { id: string; name: string }[])[0]

    await page.goto(`/${community}/${category.id}/${item.id}`)
    await dismissLocationPromptIfItAppears(page)

    const save = page.getByRole('button', { name: `Save ${item.name}`, exact: true }).and(page.locator(':visible'))
    await expect(save).toHaveAttribute('aria-pressed', 'false')
    await save.click()
    await expect(save).toHaveAttribute('aria-pressed', 'true')
    const toast = page.getByTestId('undo-toast')
    await expect(toast).toContainText('Saved to You')

    await page.reload()
    await dismissLocationPromptIfItAppears(page)
    await expect(save).toHaveAttribute('aria-pressed', 'true')

    await save.click()
    await expect(save).toHaveAttribute('aria-pressed', 'false')
    await expect(toast).toContainText('Removed from You')
    await toast.getByRole('button', { name: 'Undo' }).click()
    await expect(save).toHaveAttribute('aria-pressed', 'true')
  })

  test('a save already in storage survives a reload', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const listing = await mappableListing(request, community)

    await seedPinned(page, { id: listing.id, categoryId: listing.category })

    await page.goto(`/${community}/map`)
    const searchInput = page.getByPlaceholder(/Search name, address/)
    await searchInput.waitFor({ state: 'visible' })
    await dismissLocationPromptIfItAppears(page)

    // The count is its own text node right after "Saved" with no space in
    // between (see the chip's own JSX) — matching on the accessible name via
    // the role locator itself, rather than toContainText's raw textContent,
    // is what actually tolerates that.
    const pinnedChip = page.getByRole('button', { name: /^Saved\s*1$/ }).and(page.locator(':visible'))
    await expect(pinnedChip).toBeVisible()

    await page.reload()
    await searchInput.waitFor({ state: 'visible' })
    await dismissLocationPromptIfItAppears(page)

    // Still there after a reload, same as a real visitor's localStorage would be.
    await expect(pinnedChip).toBeVisible()
  })

  test('reaches the map screen\'s Saved chip', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const listing = await mappableListing(request, community)

    // Nothing saved yet — the chip shouldn't exist at all (see the
    // mappablePinnedCount > 0 gate on it in ResourceMapView).
    await page.goto(`/${community}/map`)
    const searchInput = page.getByPlaceholder(/Search name, address/)
    await searchInput.waitFor({ state: 'visible' })
    await dismissLocationPromptIfItAppears(page)
    await expect(page.getByRole('button', { name: /^Saved\s*\d+$/ })).toHaveCount(0)

    await seedPinned(page, { id: listing.id, categoryId: listing.category })
    await page.reload()
    await searchInput.waitFor({ state: 'visible' })
    await dismissLocationPromptIfItAppears(page)

    const pinnedChip = page.getByRole('button', { name: /^Saved\s*1$/ }).and(page.locator(':visible'))
    await expect(pinnedChip).toBeVisible()
  })

  // A search saved from a home line is on You, saying what it finds now,
  // and opens its page with the words in the box and the bookmark filled.
  test('a search saved from a home line is on You, and opens its page', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    // The largest kind of place: its name is a search, never one place's
    // name (a test fixture's category can be both, and its place line leads).
    const { category } = await largestCategory(request, community)

    await page.goto(`/${community}`)
    await dismissLocationPromptIfItAppears(page)
    await page.getByRole('textbox', { name: 'Search resources' }).fill(category.pluralLabel)
    const save = page.getByRole('button', { name: new RegExp(`^Save “.+” in ${category.pluralLabel}$`) }).first()
    await save.click()
    await expect(save).toHaveAttribute('aria-pressed', 'true')

    await page.goto(`/${community}/you`)
    await dismissLocationPromptIfItAppears(page)
    const searches = page.getByTestId('you-searches')
    await expect(searches).toContainText(category.pluralLabel)
    await searches.getByRole('link').first().click()
    await expect(page).toHaveURL(new RegExp(`/${community}/${category.id}`))
  })

  test('the old Pinned page goes to You', async ({ request }) => {
    const community = await defaultCommunitySlug(request)
    const res = await request.get(`/${community}/pinned`, { maxRedirects: 0 })
    expect(res.status()).toBe(308)
    expect(res.headers()['location']).toBe(`/${community}/you`)
  })
})
