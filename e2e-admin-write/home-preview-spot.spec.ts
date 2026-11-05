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
