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

  test('collapses past four rows at whatever column count this width lays out, and "Show more" reveals the rest', async ({
    page,
    request,
  }) => {
    // Narrow enough to force the grid's 3-column breakpoint, not its
    // widest (4) — the point is that the collapse adapts to the ACTUAL
    // column count, not that four rows happens to hold everything at one
    // particular width.
    await page.setViewportSize({ width: 700, height: 800 })
    const community = await defaultCommunity(page)
    await page.goto(`/${community}`)
    await dismissLocationPrompt(page)
    await ready(page)

    // The card's heading is `settings.heroTitle`, admin-editable — not a
    // hardcoded "Browse Everything" (see Landing.tsx's own comment on why
    // that string is gone). Read it from the real site instead of
    // hardcoding it here too.
    const { settings } = await (await request.get(`/api/site-settings?community=${community}`)).json()
    const heading = page.getByRole('heading', { level: 2, name: settings.heroTitle })
    await expect(heading).toBeVisible()
    const grid = heading.locator('..').locator('.grid').first()
    await expect(grid).toBeVisible()

    // Exact: the embedded map's own chip row (further down this same page)
    // has an unrelated "Show more categories" button once its categories
    // overflow — a substring match on "Show more" would catch both.
    const showMore = page.getByRole('button', { name: 'Show more', exact: true })
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

// The "Kept by the Community" (now Update Listings) card's Add/Edit/Report
// buttons swap to their bare word below a CSS CONTAINER width, not a
// viewport one — a prior viewport-based version got this wrong (see
// ContributeButton's own doc) and was effectively dead code: the long
// phrase always rendered on any normal desktop window regardless of how
// cramped this particular card actually was. jsdom can't compute real
// container queries, so the actual swap only has coverage here.
//
// The card used to be squeezed to roughly half the content column's width
// (a 2-up grid it shared with DaveningTimesCard, inside HomeBreak) — narrow
// enough that a real desktop window (700px) could still push its content
// box under the ~470px breakpoint. It's a full-width standalone card now
// (see homeSections.ts's own doc on why the pair split), so its content box
// at the `desktop:` gate's own floor (640px viewport) measures ~536px —
// still above the breakpoint. Measured directly against a real running
// server: the short-label state is unreachable at any viewport where this
// card is visible at all any more. The mechanism itself is untouched (still
// correct if the layout ever narrows this card again) — only the "and
// sometimes it's the short one" half of this test is gone, since there's
// nothing left to reach it with.
test.describe('home — Update Listings button labels', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop-only card')

  test('shows the long label at every viewport where the card is visible', async ({ page }) => {
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

    // The `desktop:` gate's own floor — the narrowest viewport this card
    // shows at all. Still the long label here.
    await page.setViewportSize({ width: 640, height: 640 })
    const narrowAdd = page.getByRole('button', { name: 'Add' })
    await expect(narrowAdd).toBeVisible()
    await expect(narrowAdd.getByText('Add a place')).toBeVisible()
  })

  // The bug a screenshot caught: the container query that swaps to the long
  // labels used to fire before there was actually room for all three
  // buttons on one row, so "Report a problem" wrapped to its own line while
  // "Add a place"/"Suggest an edit" stayed on the first — a state where the
  // labels ARE the long ones but the row still isn't a single line. Sweeps
  // a range of viewport widths (not one magic number) specifically to catch
  // that in-between zone regardless of exact font metrics in whatever
  // browser runs this. See ContributeButton's own doc for the content-box
  // vs. border-box measurement mismatch that caused it.
  test('never shows the long labels wrapped onto a second row, at any width', async ({ page }) => {
    const community = await defaultCommunity(page)

    await page.goto(`/${community}`)
    await dismissLocationPrompt(page)
    await ready(page)

    const addButton = page.getByRole('button', { name: 'Add' })
    const editButton = page.getByRole('button', { name: 'Edit' })
    const reportButton = page.getByRole('button', { name: 'Report' })

    // Starts at 800, not narrower: below the `desktop:` 640px gate this
    // card isn't visible at all, and the card is full-width now (see
    // homeSections.ts's own doc) rather than squeezed into a 2-up grid, so
    // there's more room at any given viewport than there used to be — 800
    // is comfortably past the gate with margin to spare, not a boundary
    // this test is trying to sit right on.
    for (const width of [800, 850, 900, 950, 1000, 1050, 1100, 1150, 1200, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(addButton).toBeVisible()
      const [addBox, editBox, reportBox] = await Promise.all([
        addButton.boundingBox(),
        editButton.boundingBox(),
        reportButton.boundingBox(),
      ])
      expect(addBox && editBox && reportBox, `buttons not all visible at ${width}px`).toBeTruthy()
      // Same row means the same `y` — a fixed row height (~44px for these
      // buttons) means an actually-wrapped button lands well below, not
      // within a rounding error of, the others' y.
      expect(Math.abs(addBox!.y - editBox!.y), `Edit wrapped at ${width}px`).toBeLessThan(5)
      expect(Math.abs(addBox!.y - reportBox!.y), `Report wrapped at ${width}px`).toBeLessThan(5)
    }
  })
})
