import { expect, test } from '@playwright/test'
import { categoryWithListings, defaultCommunity, dismissLocationPrompt, ready } from './helpers'

// Coming back to the guide from another app, then tapping a category, took
// seconds on a phone (the user, Oct 18), while scrolling stayed smooth.
//
// The cause: coming back used to call router.refresh() every time
// (RefreshContentOnReturn), re-rendering the whole page on the server. A tap
// made while that was out is a navigation, and React holds every running
// transition until all of them finish, so the new screen waited for the
// refresh — on a phone whose network was just waking, seconds.
//
// This stands in for a slow refresh by holding back the current page's own
// server render (the request a refresh makes; a tap's navigation asks for a
// different page) and times a tap made right after coming back. The events
// are dispatched rather than caused: Playwright's bringToFront() fires none
// in headless Chromium (see cache-roundtrip.spec.ts).

const HELD_MS = 6_000

test('a tap right after coming back to the app isn’t held up by a refresh', async ({ page, request, isMobile }) => {
  test.skip(!isMobile, 'the phone, where it was seen')
  const community = await defaultCommunity(page)
  const { category } = await categoryWithListings(request, community)

  await page.route(
    (url) => url.pathname === `/${community}` && url.searchParams.has('_rsc'),
    async (route) => {
      await new Promise((r) => setTimeout(r, HELD_MS))
      await route.continue().catch(() => {})
    },
  )
  await page.goto(`/${community}`)
  await ready(page)
  await dismissLocationPrompt(page)
  const tile = page.locator(`main a[href="/${community}/${category.id}"]`).filter({ visible: true }).first()
  await expect(tile).toBeVisible()

  // Past RefreshContentOnReturn's ten-second throttle, which counts from
  // when the page loaded.
  await page.waitForTimeout(11_000)
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
  })

  const tapped = Date.now()
  await tile.click()
  await expect(page.getByRole('heading', { level: 1 }).filter({ visible: true })).toHaveText(category.pluralLabel, { timeout: HELD_MS + 4_000 })
  expect(Date.now() - tapped, 'the category page should open without waiting for a refresh').toBeLessThan(2_500)
})
