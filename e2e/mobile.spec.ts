import { expect, test } from '@playwright/test'
import { categoryWithListings, defaultCommunity, dismissLocationPrompt, largestCategory } from './helpers'

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

    // scrollBy rather than mouse.wheel: this project emulates a touch
    // device, where a wheel event doesn't scroll the page at all. scrollBy
    // dispatches the same real scroll events a finger would, which is what
    // matters here — the broken version got every scroll POSITION right and
    // only failed at what the header did about it.
    const scrollBy = (px: number) => page.evaluate((d) => window.scrollBy(0, d), px)

    await scrollBy(1200)
    await expect(header).toHaveClass(/-translate-y-full/)

    // Up, but nowhere near the top — the case that regressed.
    await scrollBy(-200)
    await expect(header).not.toHaveClass(/-translate-y-full/)
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

    await scrollBy(600)
    await expect(header).toHaveClass(/-translate-y-full/)
  })
})
