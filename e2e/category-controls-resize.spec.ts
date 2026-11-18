import { expect, test } from '@playwright/test'
import { categories, ready } from './helpers'

// ─────────────────────────────────────────────────────────────────────────────
// The user, Nov 17: on a category page on a computer, narrowing the window
// to a phone's width and widening it again left the search bar in its
// docked look (white box, border, shadow) on a page that hadn't scrolled.
// Crossing the line remounts the bar's scroll marker (CategoryBandFrame
// wraps the list only on a computer) and the docked check kept watching the
// old, detached one. Positional, so a real browser: jsdom has no layout.
// ─────────────────────────────────────────────────────────────────────────────

test.skip(({ isMobile }) => isMobile, 'a computer window, resized')

const bar = (page: import('@playwright/test').Page) => page.locator('div.lg\\:sticky.lg\\:top-14').first()
const docked = (page: import('@playwright/test').Page) => bar(page).evaluate((el) => getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)')

test('the search bar isn’t docked on an unscrolled page after the window goes to a phone’s width and back', async ({ page, request }) => {
  // A category with no map beside its list: there the bar is sticky.
  const cat = (await categories(request, 'philly')).find((c) => c.hasAddress === false)
  test.skip(!cat, 'no category without a map column')
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`/philly/${cat!.id}`)
  await ready(page)
  await expect(bar(page)).toBeVisible()
  await expect.poll(() => docked(page)).toBe(false)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('category-hero')).toHaveCount(0)
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(page.getByTestId('category-hero')).toBeVisible()

  expect(await page.evaluate(() => scrollY)).toBe(0)
  // The resize resync is debounced (150ms): give it well over that, then
  // require it to stay undocked.
  await page.waitForTimeout(600)
  expect(await docked(page)).toBe(false)

  // And it still docks when the page does scroll. The test project's
  // categories can be too short to scroll, so the page is given room.
  await page.evaluate(() => {
    const room = document.createElement('div')
    room.style.height = '2000px'
    document.querySelector('main')!.append(room)
    scrollTo(0, 600)
  })
  await expect.poll(() => docked(page)).toBe(true)
})
