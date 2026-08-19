import { expect, test } from '@playwright/test'
import { categoryWithHoursField, defaultCommunity, dismissLocationPrompt, largestCategory } from './helpers'

// The mobile tab bar and the inline card grid only exist below the `sm`
// breakpoint, so the desktop project can't cover them at all. Mobile is also
// the primary way this site is used — someone standing in a hospital with a
// phone — which makes it the worse place to have no coverage.
test.describe('mobile', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile viewport only')

  test('the tab bar is present and navigates', async ({ page }) => {
    const community = await defaultCommunity(page)
    await page.goto(`/${community}`)
    await dismissLocationPrompt(page)

    const bar = page.getByRole('navigation', { name: 'Primary' })
    await expect(bar).toBeVisible()

    await bar.getByRole('button', { name: 'Map' }).click()
    await expect(page).toHaveURL(`/${community}/map`)
  })

  test('the active tab reflects the URL', async ({ page }) => {
    const community = await defaultCommunity(page)

    await page.goto(`/${community}/map`)
    await dismissLocationPrompt(page)
    const bar = page.getByRole('navigation', { name: 'Primary' })

    // aria-current is how the bar marks the current screen; it's derived from
    // the path now rather than from a `mode` in state.
    await expect(bar.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-current', 'page')
  })

  test('the tab bar survives navigating between screens', async ({ page }) => {
    const community = await defaultCommunity(page)
    await page.goto(`/${community}`)
    await dismissLocationPrompt(page)

    const bar = page.getByRole('navigation', { name: 'Primary' })
    await bar.getByRole('button', { name: 'Map' }).click()
    await expect(page).toHaveURL(`/${community}/map`)

    // The chrome lives in the layout, so it should persist rather than
    // remount — a bar that disappears mid-navigation is the visible symptom.
    await expect(bar).toBeVisible()
  })

  test('the home screen renders its card grid inline', async ({ page }) => {
    const community = await defaultCommunity(page)
    await page.goto(`/${community}`)
    await dismissLocationPrompt(page)

    // Mobile has no "All categories" page — its home screen IS the index.
    await expect(page.getByRole('button').filter({ hasText: /\w/ }).first()).toBeVisible()
  })

  // Scroll-direction header hiding. This exists because it silently broke:
  // the scroll handler read its "previous Y" variable from inside a
  // setState updater, and React only sometimes runs an updater eagerly —
  // once anything else is queued it defers it to render, by which point the
  // variable had already been reassigned to the CURRENT y. Comparing y to
  // itself fails both direction checks in nextHeaderVisible, so it returned
  // the existing state and the header froze wherever it was. A single slow
  // scroll evaluated eagerly and looked fine, which is what made it so hard
  // to pin down.
  //
  // nextHeaderVisible's own unit tests cover the maths and all passed
  // throughout — the bug was entirely in the wiring, which is why this has
  // to drive a real scroll.
  test('the header hides scrolling down and comes back scrolling up', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    // The BIGGEST category, not just any populated one: the first populated
    // category is routinely 4 entries whose page is shorter than the phone
    // viewport, and a scroll test that scrolls zero pixels proves nothing.
    const { category } = await largestCategory(request, community)

    await page.goto(`/${community}/${category.id}`)
    await dismissLocationPrompt(page)

    const header = page.locator('header').first()
    await expect(header).toBeVisible()

    // Guard the premise, with a POLL rather than a one-shot read. Two jobs:
    // if content ever shrinks to where this page no longer scrolls, every
    // assertion below would still "pass" against a header that simply never
    // had reason to move — and the listings are client-rendered, so a single
    // read right after navigation measures the empty shell and gets 0.
    // Waiting for real height also means React has hydrated, so the scroll
    // listener under test is actually installed by the time we scroll.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight))
      .toBeGreaterThan(1400)

    // Scroll in SMALL steps, the way a finger or trackpad actually does —
    // a browser fires a scroll event about once a frame, so real scrolling
    // arrives as a stream of single-digit-pixel moves. This matters more
    // than it looks: an earlier version of this test moved 1200px in one
    // jump, which sailed past the threshold and passed against a header
    // that was completely broken for every real gesture.
    //
    // scrollBy rather than mouse.wheel: this project emulates a touch
    // device, where a wheel event doesn't scroll the page at all.
    // One step PER FRAME, via rAF inside the page. This is load-bearing: the
    // browser coalesces scroll events to one a frame, so firing eight
    // scrollBy calls back to back produces a single event carrying their
    // whole 48px sum — which clears the threshold and passes even against a
    // header that is broken for every real gesture. Spacing them by a frame
    // is what makes each one arrive as its own small-delta event, the way a
    // finger's does.
    const drag = async (px: number, steps = 8) => {
      await page.evaluate(
        async ({ d, n }) => {
          for (let i = 0; i < n; i++) {
            window.scrollBy(0, d)
            await new Promise((r) => requestAnimationFrame(() => r(null)))
          }
        },
        { d: px, n: steps },
      )
    }

    // Get well down the page first, so scrolling back up lands mid-page
    // rather than at the top — the header always shows at the top, so a test
    // that drifts back to 0 would pass without proving anything.
    await page.evaluate(() => window.scrollTo(0, 2000))

    await drag(6)
    await expect(header).toHaveClass(/-translate-y-full/)

    // Up, but nowhere near the top — the case that regressed.
    await drag(-6)
    await expect(header).not.toHaveClass(/-translate-y-full/)
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(500)

    await drag(6)
    await expect(header).toHaveClass(/-translate-y-full/)
  })

  // The edit form's Hours editor laid out each day as a single non-wrapping
  // row (label + Closed checkbox + two <input type="time">) — real `time`
  // inputs have a fixed minimum width that can't shrink, so on a phone
  // screen the row was wider than the card and the close-time input was
  // silently clipped off the right edge by the wrapping div's
  // overflow-hidden. Caught for real on Sababa Falafel after an admin edit;
  // this asserts the close-time input actually lands inside the viewport
  // rather than trusting a screenshot.
  test("the edit form's hours editor doesn't clip its time inputs off-screen", async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category, item } = await categoryWithHoursField(request, community)

    await page.goto(`/${community}/${category.id}/${item.id}`)
    await dismissLocationPrompt(page)

    await page.getByRole('button', { name: /edit/i }).click()

    const hoursToggle = page.getByRole('button', { name: /^Hours/ })
    await expect(hoursToggle).toBeVisible()
    await hoursToggle.click()

    // Sunday is guaranteed present regardless of this listing's real hours;
    // force it open so both time inputs are on screen no matter what data
    // looks like today. Found via the checkbox's aria-label ("Sunday
    // closed"), not the visible day text — that's abbreviated to "Sun" for
    // layout, but the full name still reaches the accessibility tree.
    const closedCheckbox = page.getByRole('checkbox', { name: 'Sunday closed' })
    if (await closedCheckbox.isChecked()) await closedCheckbox.uncheck()
    const sundayRow = closedCheckbox.locator('..').locator('..')

    const closeTimeInput = sundayRow.locator('input[type="time"]').last()
    await expect(closeTimeInput).toBeVisible()

    const box = await closeTimeInput.boundingBox()
    if (!box) throw new Error('close-time input has no bounding box')
    const viewportWidth = page.viewportSize()!.width
    expect(box.x + box.width).toBeLessThanOrEqual(viewportWidth)

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
    ).toBe(false)
  })
})
