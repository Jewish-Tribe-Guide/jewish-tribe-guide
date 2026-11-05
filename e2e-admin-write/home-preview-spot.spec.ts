import { expect, test } from '@playwright/test'

// The Home page settings light up, in the preview beside them, the part of
// the real page each box changes. Only a real browser lays the page out.
// Writes nothing.

test('hovering a box lights its part of the preview, and Phone shows the phone’s', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 700 })
  await page.goto('/philly/admin/home')
  const frame = page.frameLocator('iframe[title="Preview"]')
  const lit = frame.locator('[data-spot-lit]')

  await page.getByRole('region', { name: 'Top of the page' }).hover({ timeout: 20_000 })
  await expect(lit).toHaveAttribute('data-spot', 'top', { timeout: 20_000 })

  // The preview scrolls to the part; the settings stay under the mouse.
  const cards = page.getByRole('region', { name: 'Cards under the search' })
  await cards.scrollIntoViewIfNeeded()
  const settingsAt = await page.evaluate(() => window.scrollY)
  await cards.hover()
  await expect(lit.first()).toHaveAttribute('data-spot', /\bcards\b/, { timeout: 15_000 })
  expect(await page.evaluate(() => window.scrollY)).toBe(settingsAt)

  // Phone shows the phone's boxes, and the preview as a phone.
  await page.getByRole('group', { name: 'Show the page on' }).getByRole('button', { name: 'Phone' }).click()
  await expect(page.getByRole('region', { name: 'Cards under the search' })).toHaveCount(0)
  await expect.poll(async () => (await page.locator('iframe[title="Preview"]').boundingBox())?.width).toBeLessThan(500)
  await page.getByRole('region', { name: 'Search box' }).hover()
  await expect(lit.first()).toHaveAttribute('data-spot', /\btop\b/, { timeout: 15_000 })
})

test('the computer preview shows the whole page, and opens full size on a click', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto('/philly/admin/home')
  const shown = page.getByRole('button', { name: 'Open the preview' })
  const frame = page.frameLocator('iframe[title="Preview"]')
  await expect(frame.locator('body')).toBeVisible({ timeout: 20_000 })

  // The frame is as tall as the page in it, so nothing is cut off: its own
  // window has nothing left to scroll. One screen of 1,100 is 292px here.
  await expect.poll(async () => (await shown.boundingBox())?.height ?? 0, { timeout: 20_000 }).toBeGreaterThan(300)
  const inside = page.locator('iframe[title="Preview"]')
  await expect
    .poll(() => inside.evaluate((f: HTMLIFrameElement) => f.contentDocument!.documentElement.scrollHeight - f.contentWindow!.innerHeight), { timeout: 20_000 })
    .toBeLessThanOrEqual(1)
  // And it settles once the page has drawn, rather than growing with
  // itself: a whole page, not one stretched by its own frame.
  let last = 0
  await expect
    .poll(async () => {
      const now = (await shown.boundingBox())!.height
      const still = now === last
      last = now
      return still
    }, { timeout: 20_000, intervals: [1000] })
    .toBe(true)
  await page.waitForTimeout(3000)
  expect((await shown.boundingBox())!.height).toBe(last)
  expect(last).toBeLessThan(800)

  const full = page.locator('iframe[title="Site preview"]')
  await shown.click()
  await expect(full).toBeVisible()
  await page.getByRole('button', { name: '← Back to editor' }).click()
  await expect(shown).toBeVisible()

  // Browser Back and Forward close and open it, and Back goes no further
  // than the settings (the user, Nov 4).
  await page.goForward()
  await expect(full).toBeVisible()
  await page.goBack()
  await expect(shown).toBeVisible()
  await expect(page).toHaveURL(/\/philly\/admin\/home$/)
  await page.goForward()
  await expect(full).toBeVisible()
})
