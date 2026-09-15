import { expect, test } from '@playwright/test'
import { categories, defaultCommunity, dismissLocationPrompt, ready } from './helpers'

// "Browse everything" (CategoryTileRow, desktop only — see the desktop
// mockup rework, docs/desktop-mockup-plan.md Phase 5, revised twice after
// user review: first to a horizontal-scroll row, then to this) is a single
// non-scrolling, non-wrapping row by default — the first 9 cards plus a
// trailing "More" tile when there are more. The header row's own "View
// all" link is gone; "More" is the only way to expand, "Show fewer
// categories" (shown only once expanded) the only way back. Deriving the
// expected count from the real, admin-configured category list (via
// `categories()` below) rather than hardcoding a number: this app hosts
// more than one community's worth of fixture data.
test.describe('home — Browse everything grid', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop-only feature (hidden below the desktop breakpoint)')

  test('caps at 9 tiles with a trailing "More" tile; "More" expands to a wrapped grid with no cap', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const cats = await categories(request, community)
    await page.goto(`/${community}`)
    await dismissLocationPrompt(page)
    await ready(page)

    const card = page.getByTestId('browse-everything-card')
    await expect(card).toBeVisible()
    const tiles = card.locator('a')
    const more = card.getByRole('button', { name: /More/ })

    // This community's own category (+ built-in entry card) count decides
    // whether there's a "More" tile to test at all (9 or fewer hides it
    // entirely — see Landing.tsx's own doc) — skip rather than fail if
    // there isn't, since the point is the mechanism, not this fixture data
    // forcing it.
    if ((await more.count()) === 0) {
      test.skip(cats.length < 9, "this community doesn't have enough categories for the \"More\" tile to show")
    }

    expect(await tiles.count()).toBe(9)
    // A single row: no wrapping, no horizontal overflow to scroll through
    // either — exactly 9 tiles plus "More" share the row's width.
    const row = tiles.first().locator('..')
    const [rowBox, rowScrollWidth] = await Promise.all([row.boundingBox(), row.evaluate((el) => el.scrollWidth)])
    expect(rowBox && rowScrollWidth <= rowBox.width + 1, 'expected the collapsed row to fit with no overflow').toBeTruthy()

    await more.click()
    await expect(page.getByRole('button', { name: 'Show fewer categories' })).toBeVisible()
    await expect(more).not.toBeVisible()
    const expandedCount = await tiles.count()
    expect(expandedCount).toBeGreaterThan(9)
    // Expanded: the same tiles, now in a wrapped grid.
    const grid = card.locator('.grid').first()
    await expect(grid).toBeVisible()

    await page.getByRole('button', { name: 'Show fewer categories' }).click()
    expect(await tiles.count()).toBe(9)
    await expect(more).toBeVisible()
  })
})

// The "Kept by the Community" (now Update Listings) card's Add/Edit/Report
// buttons — and the container-query short/long label swap this suite used
// to cover — are gone entirely (Phase 6c, docs/desktop-mockup-plan.md): that
// action moved to the new, dedicated Suggest a Listing card beside this one
// in the community row (see Landing.tsx's own doc), and UpdateListingsCard
// went back to being a short statement with a single "Learn More" link. The
// UI these two tests exercised no longer exists.
