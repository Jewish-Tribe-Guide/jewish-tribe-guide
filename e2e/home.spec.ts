import { expect, test } from '@playwright/test'
import { defaultCommunity, dismissLocationPrompt, previewSettings, ready } from './helpers'

// "Explore by Category" (CategoryTileRow, desktop only): photo tiles, five
// across in two rows (board W7l, Nov 15) — the first 9 cards and an "All categories" tile
// that expands to every card (only from 11 cards: with 10 all show, Nov 15); "Show fewer categories" (shown only once
// expanded) goes back. Whether there's an "All categories" tile at all is
// read from the page rather than hardcoded: admins add and remove
// categories.
test.describe('home — Browse everything grid', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop-only feature (hidden below the desktop breakpoint)')

  test('caps at 9 photo tiles, five across in two rows, with "All categories" last; it expands to every tile', async ({ page }) => {
    const community = await defaultCommunity(page)
    // The classic home's grid, whichever home the admin has chosen.
    await previewSettings(page, community, { homeStyle: 'classic' })
    await page.goto(`/${community}?preview=1`)
    await dismissLocationPrompt(page)
    await ready(page)

    const card = page.getByTestId('browse-everything-card')
    await expect(card).toBeVisible()
    const tiles = card.locator('a')
    const more = card.getByRole('button', { name: 'All categories' })

    // 10 tiles or fewer hides "All categories" (CategoryTileRow). Counted from
    // the tiles, not the category list, which also holds the Map, the
    // Zmanim page and hidden categories.
    if ((await more.count()) === 0) {
      expect(await tiles.count()).toBeLessThanOrEqual(10)
      test.skip(true, '10 tiles or fewer, so there is no "All categories" tile to test')
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
    expect(expandedCount).toBeGreaterThan(10)
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
