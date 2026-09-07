import { expect, test } from '@playwright/test'
import { defaultCommunity, dismissLocationPrompt, ready } from './helpers'

// The Categories mega-menu (HeaderNav, desktop only) spans the header's own
// content row — the same left/right edges as the logo-to-location-pill
// line above it — rather than being anchored to the "Categories" trigger's
// own much narrower footprint. That trigger sits well left of center in
// this nav's layout, so a panel merely flush with it (its previous
// behavior — see git history) read as randomly placed: mostly empty space
// to its left, an arbitrary edge partway across the screen to its right,
// connected to nothing wider than an 80px-wide word. Measured at runtime
// off the real header container, not a guessed breakpoint — jsdom can't
// compute real layout (see HeaderNav's own comment), so this only has
// coverage here.
test.describe('header — Categories mega-menu spans the header content row', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop-only feature (hidden below the desktop breakpoint)')

  test('matches the header content row\'s left/right edges, at a full-width window or a narrow one', async ({ page }) => {
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

      // The header's own content row — see SiteHeader.tsx, the first (and
      // only) direct child of <header> — is the reference the panel is
      // supposed to match, not the viewport or the trigger itself.
      const headerContent = page.locator('header > div').first()
      const [panelBox, headerBox] = await Promise.all([panel.boundingBox(), headerContent.boundingBox()])
      expect(panelBox).not.toBeNull()
      expect(headerBox).not.toBeNull()

      expect(panelBox!.x).toBeCloseTo(headerBox!.x, 0)
      expect(panelBox!.width).toBeCloseTo(headerBox!.width, 0)
      // Never overflows the viewport either way — the header content row
      // itself is already bounded (max-w-6xl mx-auto px-4/px-6), so this
      // mostly re-confirms that bound rather than adding a new one.
      expect(panelBox!.x).toBeGreaterThanOrEqual(0)
      expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(width + 1) // +1: sub-pixel rounding
    }
  })
})
