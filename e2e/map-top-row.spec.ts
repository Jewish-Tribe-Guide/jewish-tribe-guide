import { expect, test } from '@playwright/test'
import { defaultCommunity, dismissLocationPrompt } from './helpers'

// The desktop Map page's top row (the user, Oct 15): Google Maps' sizes —
// chips 32px tall with 14px words, a 48px search box, 40px round buttons —
// and the chips ending a clear gap before Set location, which sits just
// left of the ✕ on the same line. They were 24px chips with 12px words that
// ran to within 12px of the ✕, Set location on a line of its own under it.
// Sizes and positions, so a real browser: jsdom lays nothing out.

test('desktop map: Google Maps’ sizes, and the chips, Set location and ✕ on one line with room', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop map’s top row')
  const community = await defaultCommunity(page)
  await page.goto(`/${community}/map`)
  await dismissLocationPrompt(page)

  const all = page.getByRole('button', { name: 'All', exact: true }).filter({ visible: true })
  await expect(all).toBeVisible()
  const search = page.getByPlaceholder('Search name, address…').locator('xpath=ancestor::form[1]')
  const setLocation = page.getByTestId('map-location-control')
  const close = page.getByRole('button', { name: 'Close map' })
  const chips = page.getByTestId('map-top-chips')

  const box = async (l: typeof all) => (await l.boundingBox())!
  const [a, s, loc, x, row] = await Promise.all([box(all), box(search), box(setLocation), box(close), box(chips)])

  expect(Math.round(a.height), 'a chip is 32px tall').toBe(32)
  expect(await all.evaluate((el) => getComputedStyle(el).fontSize), 'its words are 14px').toBe('14px')
  expect(Math.round(s.height), 'the search box is 48px tall').toBe(48)
  expect(Math.round(x.height), 'the ✕ is 40px').toBe(40)

  // One line, centred on the search box.
  const middle = (b: { y: number; height: number }) => b.y + b.height / 2
  for (const [name, b] of [['a chip', a], ['Set location', loc], ['the ✕', x]] as const) {
    expect(Math.abs(middle(b) - middle(s)), `${name} is centred on the search box`).toBeLessThanOrEqual(2)
  }
  // Set location just left of the ✕; the chips end a gap before it.
  expect(x.x - (loc.x + loc.width), 'Set location sits just left of the ✕').toBeLessThanOrEqual(12)
  expect(loc.x - (row.x + row.width), 'the chips end a clear gap before Set location').toBeGreaterThanOrEqual(16)
})
