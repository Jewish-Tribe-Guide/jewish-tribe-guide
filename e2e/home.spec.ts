import { expect, test } from '@playwright/test'
import { categories, defaultCommunity, dismissLocationPrompt, ready } from './helpers'

// "Browse everything" (CategoryTileRow, desktop only — see the desktop
// mockup rework, docs/desktop-mockup-plan.md Phase 5, revised after review
// from an 8-tile collapse to a scroll row) is a horizontal-scroll "quick
// view" row by default — every tile is in the DOM, scrolling reaches the
// rest — and "View all" (in the card's own header row, not under the grid)
// expands it into a full wrapped grid with no scrolling. Deriving the
// expected count from the real, admin-configured category list (via
// `categories()` below) rather than hardcoding a number: this app hosts
// more than one community's worth of fixture data.
test.describe('home — Browse everything grid', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop-only feature (hidden below the desktop breakpoint)')

  test('every tile is present in both states; "View all" swaps a scroll row for a wrapped grid', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const cats = await categories(request, community)
    await page.goto(`/${community}`)
    await dismissLocationPrompt(page)
    await ready(page)

    const card = page.getByTestId('browse-everything-card')
    await expect(card).toBeVisible()
    const tiles = card.locator('a')

    const toggle = page.getByRole('button', { name: /View all|Show fewer categories/ })
    // This community's own category (+ built-in entry card) count decides
    // whether there's a toggle to test at all (8 or fewer hides it
    // entirely — see Landing.tsx's own doc) — skip rather than fail if
    // there isn't, since the point is the mechanism, not this fixture data
    // forcing it.
    if ((await toggle.count()) === 0) {
      test.skip(cats.length < 8, "this community doesn't have enough categories for the toggle to show")
    }

    const collapsedCount = await tiles.count()
    expect(collapsedCount).toBeGreaterThan(8)
    expect(await toggle.getAttribute('aria-expanded')).toBe('false')
    // Collapsed: a horizontal-scroll row, not a wrapped grid — real content
    // overflows its own width rather than every tile fitting on screen.
    const scrollRow = card.locator('.overflow-x-auto').first()
    await expect(scrollRow).toBeVisible()
    const [rowBox, scrollWidth] = await Promise.all([scrollRow.boundingBox(), scrollRow.evaluate((el) => el.scrollWidth)])
    expect(rowBox && scrollWidth > rowBox.width, 'expected the collapsed row to actually overflow, not just fit').toBeTruthy()

    await toggle.click()
    await expect(page.getByRole('button', { name: 'Show fewer categories' })).toBeVisible()
    expect(await tiles.count()).toBe(collapsedCount)
    // Expanded: the same tiles, now in a wrapped grid — no horizontal
    // overflow left to scroll through.
    const grid = card.locator('.grid').first()
    await expect(grid).toBeVisible()
    const [gridBox, gridScrollWidth] = await Promise.all([grid.boundingBox(), grid.evaluate((el) => el.scrollWidth)])
    expect(gridBox && gridScrollWidth <= gridBox.width + 1, 'expected the expanded grid to wrap, not overflow').toBeTruthy()

    await toggle.click()
    expect(await tiles.count()).toBe(collapsedCount)
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
