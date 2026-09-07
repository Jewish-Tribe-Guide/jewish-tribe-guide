import { expect, test } from '@playwright/test'
import { defaultCommunity, dismissLocationPrompt, ready } from './helpers'

// "Browse everything" (CompactCardGrid, desktop only) collapses past four
// rows by measuring each card's real rendered row position and clipping the
// grid's height — not by slicing to a fixed item count, since the grid runs
// 2/3/4 columns depending on viewport width and a fixed count is only ever
// "four rows" at one of those. jsdom can't compute real layout (see that
// component's own test for what IS covered there), so the actual collapse
// only has coverage here, against a real browser.
test.describe('home — Browse everything grid', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop-only feature (hidden below the desktop breakpoint)')

  test('collapses past four rows at whatever column count this width lays out, and "Show more" reveals the rest', async ({ page }) => {
    // Narrow enough to force the grid's 3-column breakpoint, not its
    // widest (4) — the point is that the collapse adapts to the ACTUAL
    // column count, not that four rows happens to hold everything at one
    // particular width.
    await page.setViewportSize({ width: 700, height: 800 })
    const community = await defaultCommunity(page)
    await page.goto(`/${community}`)
    await dismissLocationPrompt(page)
    await ready(page)

    const heading = page.getByRole('heading', { name: 'Browse Everything' })
    await expect(heading).toBeVisible()
    const grid = heading.locator('..').locator('.grid').first()
    await expect(grid).toBeVisible()

    const showMore = page.getByRole('button', { name: 'Show more' })
    // This community's own category count decides whether four rows'
    // worth even needs collapsing at this width — skip rather than fail
    // if it doesn't, since the point is the mechanism, not this fixture
    // data forcing it.
    if ((await showMore.count()) === 0) {
      test.skip(true, "this community doesn't have enough categories at this width to trigger the collapse")
    }

    const collapsedHeight = await grid.evaluate((el) => el.getBoundingClientRect().height)
    const collapsedScrollHeight = await grid.evaluate((el) => el.scrollHeight)
    // Clipped — there's real content below what the visible box shows.
    expect(collapsedScrollHeight).toBeGreaterThan(collapsedHeight + 5)

    await showMore.click()
    await expect(page.getByRole('button', { name: 'Show less' })).toBeVisible()

    const expandedHeight = await grid.evaluate((el) => el.getBoundingClientRect().height)
    expect(expandedHeight).toBeGreaterThan(collapsedHeight)

    await page.getByRole('button', { name: 'Show less' }).click()
    await expect(showMore).toBeVisible()
    const reCollapsedHeight = await grid.evaluate((el) => el.getBoundingClientRect().height)
    expect(reCollapsedHeight).toBeCloseTo(collapsedHeight, 0)
  })
})

// The "Kept by the Community" card's Add/Edit/Report buttons swap to their
// bare word below a CSS CONTAINER width, not a viewport one — this card's
// own width is fixed by the 2-up grid it sits in (HomeBreak), which can be
// far narrower than the viewport at plenty of real window sizes. A prior
// viewport-based version got this wrong (see ContributeButton's own doc)
// and was effectively dead code: the long phrase always rendered on any
// normal desktop window regardless of how cramped this particular card
// actually was. jsdom can't compute real container queries, so the actual
// swap only has coverage here.
test.describe('home — Kept by the Community button labels', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop-only card (HomeBreak)')

  test('shows the long label when the card has room, the short one when it doesn\'t', async ({ page }) => {
    const community = await defaultCommunity(page)

    await page.goto(`/${community}`)
    await dismissLocationPrompt(page)
    await ready(page)

    // Both labels are always in the DOM (see ContributeButton's own doc) —
    // one hidden by CSS, not conditionally rendered — so the assertion has
    // to check which one is actually VISIBLE, not just present in
    // textContent (Playwright's text matchers don't filter on CSS
    // visibility, so `toContainText` would pass either way here).
    const wideAdd = page.getByRole('button', { name: 'Add' })
    await expect(wideAdd).toBeVisible()
    await expect(wideAdd.getByText('Add a place')).toBeVisible()

    // Narrow enough that the 2-up grid squeezes this card well under the
    // ~420px container breakpoint, wide enough to stay past the `desktop:`
    // gate (640px) this whole card is hidden below.
    await page.setViewportSize({ width: 700, height: 900 })
    const narrowAdd = page.getByRole('button', { name: 'Add' })
    await expect(narrowAdd).toBeVisible()
    await expect(narrowAdd.getByText('Add a place')).toBeHidden()
    await expect(narrowAdd.getByText('Add', { exact: true })).toBeVisible()
  })
})
