import { expect, test } from '@playwright/test'
import { defaultCommunity, dismissLocationPrompt, ready } from './helpers'

// The Categories mega-menu (HeaderNav, desktop only) anchors flush with its
// trigger by default, which sits well left of center in this nav's layout —
// fine at a full-width desktop window, but a panel up to 900px wide can run
// past the window's right edge on anything narrower (a split-screen half, a
// resized browser). Clamped at runtime by measuring the real trigger
// position and panel width, not a guessed breakpoint — jsdom can't compute
// real layout (see HeaderNav's own comment), so this only has coverage here.
test.describe('header — Categories mega-menu stays on screen', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop-only feature (hidden below the desktop breakpoint)')

  test('never overflows the viewport, at a full-width window or a narrow one', async ({ page }) => {
    const community = await defaultCommunity(page)

    for (const width of [1400, 960, 760]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto(`/${community}`)
      await dismissLocationPrompt(page)
      await ready(page)

      const trigger = page.getByRole('button', { name: 'Categories', exact: true })
      await trigger.click()

      // The panel opening is what the Categories button's own aria-expanded
      // flip confirms; structurally it's the trigger's sibling inside the
      // shared "relative" wrapper, found without depending on this
      // community's own admin-configured section names.
      const panel = trigger.locator('xpath=following-sibling::div[contains(@class, "absolute")]').first()
      await expect(panel).toBeVisible()

      const box = await panel.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1) // +1: sub-pixel rounding
    }
  })
})
