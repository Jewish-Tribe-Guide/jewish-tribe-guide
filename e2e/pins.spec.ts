import { expect, test, type Page } from '@playwright/test'
import { categoryWithListings, defaultCommunity, ready } from './helpers'

// A more patient version of helpers.ts' dismissLocationPrompt: that one is a
// single point-in-time check (`isVisible()`, no retry), which assumes the
// prompt — if it's going to show at all — has already rendered by the time
// it's called. It hadn't, reliably, on this spec's pages: LiveLocationPrompt
// only becomes visible once useLiveLocation's own mount effects resolve,
// which lands after `ready()`'s header-visible signal (part of the static
// shell, painted before hydration finishes). Missing the dismiss here isn't
// cosmetic like it is elsewhere — the prompt is a full-screen overlay, and
// every following interaction in these tests is a click, which its overlay
// blocks outright rather than just failing a visibility assertion. This
// polls briefly instead of checking once.
async function dismissLocationPromptIfItAppears(page: Page): Promise<void> {
  const notNow = page.getByRole('button', { name: 'Not now' })
  const appeared = await notNow
    .waitFor({ state: 'visible', timeout: 3000 })
    .then(() => true)
    .catch(() => false)
  if (!appeared) return
  await notNow.click()
  await notNow.waitFor({ state: 'hidden' })
}

// Pinning is entirely client-side (localStorage — see src/lib/pinned.ts), no
// database, no accounts. These check the two things that matter for that: a
// pin survives a reload the same as a real visitor's would, and it actually
// reaches the map screen's "Pinned" filter chip rather than just sitting in
// storage unread.
//
// Nothing here writes to the database — see the suite-wide rule in
// AGENTS.md. localStorage is scoped to Playwright's own browser context, so
// nothing here persists beyond the test either.
//
// Deliberately doesn't click the Pinned chip to verify it narrows the map's
// markers — confirmed by hand that doing so crashes in THIS environment
// specifically: this suite's build runs on localhost:3210 (see
// playwright.config.ts), which isn't in the Google Maps API key's allowed
// referrers, so Maps starts in an auth-failed state; any interaction that
// causes ResourceMap to rebuild its markers after that (toggling ANY filter
// chip, not just this one — reproduced the identical crash with a plain
// category chip) throws inside Google's own SDK and takes down the whole
// map screen. Real, correctly-allowlisted domains never hit the first
// failure this cascades from. The filter predicate itself
// (`!pinnedOnly || p.pinned` in ResourceMapView) is a one-line, obviously-
// correct condition — the actual thing worth regression-testing here is
// that the pin data reaches the map at all, which the chip's count proves
// without needing to click it.
//
// `:visible` on every PinButton locator: the map keeps both the desktop
// sidebar's NearbyList and the mobile bottom sheet's copy mounted at once
// (the sheet only hides itself with `sm:hidden`, not a JS isMobile check —
// see MobileNearbySheet), so on a desktop-width run there can be two
// matching buttons for the same listing in the DOM at once. Only one is
// ever actually on screen.
//
// Every assertion targets a specific listing BY NAME (read off the button's
// own accessible name before acting), not "whichever pin button is first" —
// the directory's own sort can reorder rows once the visitor's location
// resolves (see the untouched-default effect in GenericDirectory), and a
// position-based locator re-resolved to a different row out from under a
// same-test click during exactly this development.

test.describe('pinning a listing', () => {
  test('survives a reload', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)

    await page.goto(`/${community}/${category.id}`)
    await ready(page)
    await dismissLocationPromptIfItAppears(page)

    const firstPin = page.getByRole('button', { name: /^Pin / }).and(page.locator(':visible')).first()
    await expect(firstPin).toBeVisible()
    const label = await firstPin.getAttribute('aria-label')
    const listingName = label!.replace(/^Pin /, '')

    await firstPin.click()
    // exact: true — the listing's own directory ROW is also role="button"
    // (tapping it expands the card) and its accessible name concatenates
    // every visible descendant's text, including this pin button's own
    // aria-label — so a substring match resolves to both and Playwright
    // refuses to pick one (strict mode).
    const pinnedButton = page
      .getByRole('button', { name: `Unpin ${listingName}`, exact: true })
      .and(page.locator(':visible'))
    await expect(pinnedButton).toBeVisible()

    await page.reload()
    await ready(page)
    await dismissLocationPromptIfItAppears(page)

    // Restored from localStorage rather than starting fresh like page state
    // normally would.
    await expect(pinnedButton).toBeVisible()
  })

  test('a pin reaches the map screen\'s Pinned filter chip', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)

    await page.goto(`/${community}/${category.id}`)
    await ready(page)
    await dismissLocationPromptIfItAppears(page)

    // Nothing pinned yet — the chip shouldn't exist at all (see the
    // pinned.length > 0 gate on it in ResourceMapView).
    await page.goto(`/${community}/map`)
    await page.getByPlaceholder(/Search name, address/).waitFor({ state: 'visible' })
    await dismissLocationPromptIfItAppears(page)
    await expect(page.getByRole('button', { name: /^Pinned \d+$/ })).toHaveCount(0)

    await page.goto(`/${community}/${category.id}`)
    await ready(page)
    await dismissLocationPromptIfItAppears(page)
    await page.getByRole('button', { name: /^Pin / }).and(page.locator(':visible')).first().click()

    await page.goto(`/${community}/map`)
    await page.getByPlaceholder(/Search name, address/).waitFor({ state: 'visible' })
    await dismissLocationPromptIfItAppears(page)

    const pinnedChip = page.getByRole('button', { name: /^Pinned \d+$/ }).and(page.locator(':visible'))
    await expect(pinnedChip).toBeVisible()
    await expect(pinnedChip).toContainText('Pinned 1')
  })
})
