import { expect, test } from '@playwright/test'
import { categories, defaultCommunity, dismissLocationPrompt, previewSettings, ready } from './helpers'

// "Explore by Category" (CategoryTileRow, desktop only): photo tiles, five
// across (board H1, Nov 11) — the first 9 cards and an "All categories" tile
// that expands to every card; "Show fewer categories" (shown only once
// expanded) goes back. Deriving the expected count from the real,
// admin-configured category list (via `categories()` below) rather than
// hardcoding a number: this app hosts more than one community's worth of
// fixture data.
test.describe('home — Browse everything grid', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop-only feature (hidden below the desktop breakpoint)')

  test('caps at 9 photo tiles, five across, with "All categories" last; it expands to every tile', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const cats = await categories(request, community)
    // The classic home's grid, whichever home the admin has chosen.
    await previewSettings(page, community, { homeStyle: 'classic' })
    await page.goto(`/${community}?preview=1`)
    await dismissLocationPrompt(page)
    await ready(page)

    const card = page.getByTestId('browse-everything-card')
    await expect(card).toBeVisible()
    const tiles = card.locator('a')
    const more = card.getByRole('button', { name: 'All categories' })

    // This community's own category (+ built-in entry card) count decides
    // whether there's an "All categories" tile to test at all (9 or fewer hides it
    // entirely — see Landing.tsx's own doc) — skip rather than fail if
    // there isn't, since the point is the mechanism, not this fixture data
    // forcing it.
    if ((await more.count()) === 0) {
      test.skip(cats.length < 9, "this community doesn't have enough categories for the \"All categories\" tile to show")
    }

    expect(await tiles.count()).toBe(9)
    // Two rows of five: the first five tiles share a top, the sixth starts
    // the second row under the first, and "All categories" ends that row
    // under the fifth. Layout, so only a real browser can say.
    const boxes = await tiles.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect))
    const moreBox = (await more.boundingBox())!
    expect(new Set(boxes.slice(0, 5).map((b) => Math.round(b.top))).size).toBe(1)
    expect(boxes[5]!.top).toBeGreaterThan(boxes[0]!.bottom)
    expect(Math.round(boxes[5]!.left)).toBe(Math.round(boxes[0]!.left))
    expect(Math.round(moreBox.y)).toBe(Math.round(boxes[5]!.top))
    expect(Math.abs(moreBox.x - boxes[4]!.left)).toBeLessThan(2)

    await more.click()
    await expect(page.getByRole('button', { name: 'Show fewer categories' })).toBeVisible()
    await expect(more).not.toBeVisible()
    const expandedCount = await tiles.count()
    expect(expandedCount).toBeGreaterThan(9)
    // Expanded: every tile, in the same grid.
    const grid = card.locator('.grid').first()
    await expect(grid).toBeVisible()

    await page.getByRole('button', { name: 'Show fewer categories' }).click()
    expect(await tiles.count()).toBe(9)
    await expect(more).toBeVisible()
  })
})

// The "Kept by the Community" card is gone (Nov 11): the computer home says
// how it stays right in the trust band under the photo instead (TrustBand's
// DesktopTrustBand; Landing.test covers it).
