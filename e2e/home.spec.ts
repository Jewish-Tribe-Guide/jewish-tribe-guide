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
// Whether this card is full-width or paired half-width with a neighbor
// (DaveningTimesCard) in a 2-up grid is an admin's own per-community choice
// (see homeSections.ts's own `width` doc) — this used to assume "always
// full-width now" and hardcode "always the long label," which broke the
// moment a real community was (legitimately) configured half-width: at
// that width its content box sits well under the ~470px breakpoint, so the
// short label is the CORRECT rendered state there, not a bug. Derives the
// expectation from the card's own actual measured content box instead
// (border box minus its own `p-7`, 56px total — see ContributeButton's own
// doc on why border-box alone is the wrong measurement here), so this holds
// regardless of whatever width the running community happens to be
// configured at.
test.describe('home — Update Listings button labels', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop-only card')

  test('whichever label the container query picks, it renders fully — not clipped, not overlapping its neighbor', async ({ page }) => {
    const community = await defaultCommunity(page)

    await page.goto(`/${community}`)
    await dismissLocationPrompt(page)
    await ready(page)

    // NOT "assert the long label is always visible" (what this used to do)
    // and NOT "recompute the same ~470px breakpoint ContributeButton itself
    // hardcodes, then assert visibility matches that" (what a first attempt
    // at fixing this did instead) — a fair objection to that version: it
    // mostly just re-derives the implementation's own constant and checks
    // it against itself, not an independent requirement. Whether this card
    // renders full-width or paired half-width with a neighbor is a
    // legitimate per-community admin choice (homeSections.ts's own `width`
    // doc), not something this test should assume OR re-predict from a
    // magic number. What actually has to hold regardless of that choice:
    // whichever of the two labels the browser's own container query picks,
    // it has to render as a complete, non-overlapping button — not clipped
    // by the card edge, not overlapping the next button over. That's
    // independent of which width the admin picked and independent of the
    // exact breakpoint value.
    for (const width of [640, 900, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      const addBtn = page.getByRole('button', { name: 'Add' })
      const editBtn = page.getByRole('button', { name: 'Edit' })
      await expect(addBtn).toBeVisible()

      // Both labels are always in the DOM (see ContributeButton's own doc)
      // — one hidden by CSS, not conditionally rendered — so this has to
      // check which one is actually VISIBLE, not just present in
      // textContent (Playwright's text matchers don't filter on CSS
      // visibility, so `toContainText` would pass either way here). Exactly
      // one of the two should be showing; the toggle being stuck with both
      // (or neither) visible is its own bug the rest of this test can't
      // catch, since it looks at whichever ONE label it finds visible.
      const long = addBtn.getByText('Add a place')
      const short = addBtn.getByText('Add', { exact: true })
      const [longVisible, shortVisible] = await Promise.all([long.isVisible(), short.isVisible()])
      expect(longVisible !== shortVisible, `at ${width}px, expected exactly one of the long/short labels visible, got long=${longVisible} short=${shortVisible}`).toBe(true)
      const visibleLabel = longVisible ? long : short

      const [labelBox, addBox, editBox] = await Promise.all([visibleLabel.boundingBox(), addBtn.boundingBox(), editBtn.boundingBox()])
      expect(labelBox && addBox && editBox, `a box was missing at ${width}px`).toBeTruthy()
      // Not clipped: the label's own box has to fit entirely inside its
      // button's box, not spill past its right edge (the tell-tale sign of
      // a container query firing before there's actually room — the exact
      // bug the OTHER test below this one guards, at a wider range of
      // widths this one doesn't sweep).
      expect(labelBox!.x + labelBox!.width, `label clipped by its own button's right edge at ${width}px`).toBeLessThanOrEqual(addBox!.x + addBox!.width + 1)
      // Not overlapping: Add's button box ends before Edit's begins.
      expect(addBox!.x + addBox!.width, `Add's button overlaps Edit's at ${width}px`).toBeLessThanOrEqual(editBox!.x + 1)
    }
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
    // card isn't visible at all. Whether it renders full-width or paired
    // half-width with a neighbor is a per-community admin choice
    // (homeSections.ts's own `width` doc) this test doesn't assume either
    // way — these are the SHORT labels (aria-label, always present
    // regardless of which span is CSS-visible — see ContributeButton's own
    // doc), so what's being swept here is purely "do three short words ever
    // wrap," which a half-width card has just as much room for as a
    // full-width one; 800 is comfortably past the `desktop:` gate either
    // way, not a boundary this test is trying to sit right on.
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
