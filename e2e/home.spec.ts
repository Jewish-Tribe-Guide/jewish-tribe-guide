import { expect, test } from '@playwright/test'
import { categories, defaultCommunity, dismissLocationPrompt, ready } from './helpers'

// "Browse everything" (CategoryTileRow, desktop only — see the desktop
// mockup rework, docs/desktop-mockup-plan.md Phase 5) collapses to the
// first 8 tiles by default; "Browse all categories" (in the card's own
// header row, not under the grid) reveals every tile. Deriving the expected
// counts from the real, admin-configured category list (via `categories()`
// below) rather than hardcoding a number: a fixture with fewer categories
// than 8 would make a hardcoded expectation lie, and this app hosts more
// than one community's worth of fixture data.
test.describe('home — Browse everything grid', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop-only feature (hidden below the desktop breakpoint)')

  test('collapses to 8 tiles by default, and "Browse all categories" reveals the rest', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const cats = await categories(request, community)
    await page.goto(`/${community}`)
    await dismissLocationPrompt(page)
    await ready(page)

    const card = page.getByTestId('browse-everything-card')
    await expect(card).toBeVisible()
    const tiles = card.locator('.grid a')

    const toggle = page.getByRole('button', { name: /Browse all categories|Show fewer categories/ })
    // This community's own category (+ built-in entry card) count decides
    // whether there's anything to collapse at all — skip rather than fail
    // if there isn't, since the point is the mechanism, not this fixture
    // data forcing it. The rendered grid also includes the built-in
    // Support/Volunteer entry cards alongside real categories, so this only
    // asserts a lower bound, not an exact expected total.
    if ((await toggle.count()) === 0) {
      test.skip(cats.length < 8, "this community doesn't have enough categories to trigger the collapse")
    }

    await expect(tiles).toHaveCount(8)
    expect(await toggle.getAttribute('aria-expanded')).toBe('false')

    await toggle.click()
    const expandedCount = await tiles.count()
    expect(expandedCount).toBeGreaterThan(8)
    expect(await toggle.getAttribute('aria-expanded')).toBe('true')
    await expect(page.getByRole('button', { name: 'Show fewer categories' })).toBeVisible()

    await toggle.click()
    await expect(tiles).toHaveCount(8)
    expect(await toggle.getAttribute('aria-expanded')).toBe('false')
  })
})

// The "Kept by the Community" (now Update Listings) card's Add/Edit/Report
// buttons — and the container-query short/long label swap this suite used
// to cover — are gone entirely (Phase 6c, docs/desktop-mockup-plan.md): that
// action moved to the new, dedicated Suggest a Listing card beside this one
// in the community row (see Landing.tsx's own doc), and UpdateListingsCard
// went back to being a short statement with a single "Learn More" link. The
// UI these two tests exercised no longer exists.
