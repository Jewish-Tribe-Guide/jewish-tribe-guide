import { expect, test } from '@playwright/test'
import { defaultCommunity, dismissLocationPrompt, previewSettings, ready } from './helpers'

// "Explore by Category" (CategoryTileRow, desktop only): photo tiles, five
// across (boards H1 and G5b, Nov 11) — the first 14 cards and an "All categories" tile
// that expands to every card; "Show fewer categories" (shown only once
// expanded) goes back. Whether there's an "All categories" tile at all is
// read from the page rather than hardcoded: admins add and remove
// categories.
test.describe('home — Browse everything grid', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop-only feature (hidden below the desktop breakpoint)')

  test('caps at 14 photo tiles, five across, with "All categories" last; it expands to every tile', async ({ page }) => {
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

    // 14 tiles or fewer hides "All categories" (Landing.tsx). Counted from
    // the tiles, not the category list, which also holds the Map, the
    // Zmanim page and hidden categories: Philly had 14 tiles (Zmanim among
    // them) on Nov 15, no button, and the old count-based skip failed.
    if ((await more.count()) === 0) {
      expect(await tiles.count()).toBeLessThanOrEqual(14)
      test.skip(true, '14 tiles or fewer, so there is no "All categories" tile to test')
    }

    expect(await tiles.count()).toBe(14)
    // Three rows of five: the first five tiles share a top, the sixth starts
    // the second row under the first, the eleventh the third, and "All
    // categories" ends that row under the fifth. Layout, so only a real browser can say.
    const boxes = await tiles.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect))
    const moreBox = (await more.boundingBox())!
    expect(new Set(boxes.slice(0, 5).map((b) => Math.round(b.top))).size).toBe(1)
    expect(boxes[5]!.top).toBeGreaterThan(boxes[0]!.bottom)
    expect(Math.round(boxes[5]!.left)).toBe(Math.round(boxes[0]!.left))
    expect(boxes[10]!.top).toBeGreaterThan(boxes[5]!.bottom)
    expect(Math.round(boxes[10]!.left)).toBe(Math.round(boxes[0]!.left))
    expect(Math.round(moreBox.y)).toBe(Math.round(boxes[10]!.top))
    expect(Math.abs(moreBox.x - boxes[4]!.left)).toBeLessThan(2)

    await more.click()
    await expect(page.getByRole('button', { name: 'Show fewer categories' })).toBeVisible()
    await expect(more).not.toBeVisible()
    const expandedCount = await tiles.count()
    expect(expandedCount).toBeGreaterThan(14)
    // Expanded: every tile, in the same grid.
    const grid = card.locator('.grid').first()
    await expect(grid).toBeVisible()

    await page.getByRole('button', { name: 'Show fewer categories' }).click()
    expect(await tiles.count()).toBe(14)
    await expect(more).toBeVisible()
  })
})

// The "Kept by the Community" card is gone (Nov 11): the computer home says
// how it stays right in the trust band under the photo instead (TrustBand's
// DesktopTrustBand; Landing.test covers it).
