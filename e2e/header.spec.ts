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

// The home screen's embedded map band (HomeMap.tsx → ResourceMapView.tsx in
// its non-fullscreen, "boxed" mode) floats its own search box at z-40 —
// meant only to sit above the map/sidebar inside that box. Neither Landing's
// wrapper div around it nor ResourceMapView's boxed-mode container used to
// establish a stacking context of their own, so that z-40 leaked straight
// into the root stacking context and tied with SiteHeader's own z-40
// (sticky, so it DOES form a stacking context — see the "spans the header
// content row" comment above on why a dropdown nested inside it can't beat
// a same-level sibling by raising its own z-index). With equal z-index, DOM
// order won, and the map band — later in the document — painted over the
// entire header, Categories mega-menu included. Fixed with `desktop:isolate`
// on ResourceMapView's boxed-mode container (see its own comment there).
test.describe('header — Categories dropdown stays above the home screen\'s map', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop-only: the map band only renders at the desktop breakpoint')

  test('the dropdown wins where it overlaps the map\'s floating search box', async ({ page }) => {
    const community = await defaultCommunity(page)
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.goto(`/${community}`)
    await dismissLocationPrompt(page)
    await ready(page)

    // The map band only mounts once scrolled near-into-view (Landing.tsx's
    // own useInView gate, keeping the Google Maps script off the initial
    // load) — scroll it into view first so HomeMap has actually rendered.
    await page.locator('div.scroll-mt-20.desktop\\:block').scrollIntoViewIfNeeded()

    const searchWrap = page.locator('div.absolute.left-3.top-3.z-40')
    await expect(searchWrap).toBeVisible()

    // Pin the search box just under the header, in the same region an open
    // mega-menu occupies, regardless of how tall the page happens to be
    // above the map band on this run (hero copy, promo banners, etc. are all
    // admin-configurable and shouldn't make this test's positioning brittle).
    await page.evaluate(() => {
      const header = document.querySelector('header')
      const wrap = document.querySelector('div.absolute.left-3.top-3.z-40')
      if (!header || !wrap) return
      const wrapDocTop = wrap.getBoundingClientRect().top + window.scrollY
      window.scrollTo(0, wrapDocTop - header.getBoundingClientRect().height - 10)
    })

    const trigger = page.getByRole('button', { name: 'Categories', exact: true })
    await trigger.click()
    const panel = trigger.locator('xpath=following-sibling::div[contains(@class, "absolute")]').first()
    await expect(panel).toBeVisible()

    const [panelBox, wrapBox] = await Promise.all([panel.boundingBox(), searchWrap.boundingBox()])
    expect(panelBox).not.toBeNull()
    expect(wrapBox).not.toBeNull()

    // Confirm the two actually overlap on screen — otherwise the
    // elementFromPoint check below would trivially "pass" for the wrong
    // reason (nothing to contest).
    const overlapX = Math.max(panelBox!.x, wrapBox!.x)
    const overlapY = Math.max(panelBox!.y, wrapBox!.y)
    expect(overlapX).toBeLessThan(Math.min(panelBox!.x + panelBox!.width, wrapBox!.x + wrapBox!.width))
    expect(overlapY).toBeLessThan(Math.min(panelBox!.y + panelBox!.height, wrapBox!.y + wrapBox!.height))

    const panelHandle = await panel.elementHandle()
    const topElementIsInPanel = await page.evaluate(
      ([x, y, panelEl]) => {
        const el = document.elementFromPoint(x as number, y as number)
        return !!el && (panelEl as Element).contains(el)
      },
      [overlapX + 2, overlapY + 2, panelHandle],
    )
    expect(topElementIsInPanel).toBe(true)
  })
})
