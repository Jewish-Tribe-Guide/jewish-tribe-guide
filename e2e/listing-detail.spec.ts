import { expect, test } from '@playwright/test'
import { categoryWithListings, largestCategory, defaultCommunity, dismissLocationPrompt } from './helpers'

// A multi-column desktop grid has nowhere sensible to push an expanding
// card's panel — it would have to span every column in its row or overlap
// its neighbors — so desktop opens the same detail content in a dialog
// instead of the mobile inline accordion. See GenericListingCard's
// `isMobile` branch and ListingDetailModal.

test.describe('listing detail — desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop viewport only')

  test('clicking a listing opens a dialog, not an inline panel', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)

    await page.goto(`/${community}/${category.id}`)
    await dismissLocationPrompt(page)

    const trigger = page.getByRole('button', { name: /^Show details for / }).first()
    const name = (await trigger.getAttribute('aria-label'))!.replace(/^Show details for /, '')
    await trigger.click()

    const dialog = page.getByRole('dialog', { name })
    await expect(dialog).toBeVisible()
    // The trigger's own label flips in step with the dialog — same `expanded`
    // state drives both, just rendered differently. See GenericListingCard.
    await expect(page.getByRole('button', { name: `Hide details for ${name}` })).toBeVisible()

    // Escape closes it and hands the trigger's label back.
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(page.getByRole('button', { name: `Show details for ${name}` })).toBeVisible()
  })

  test('clicking outside the dialog closes it', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)

    await page.goto(`/${community}/${category.id}`)
    await dismissLocationPrompt(page)

    await page.getByRole('button', { name: /^Show details for / }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Top-left corner of the viewport — outside the centered dialog, but
    // still inside its backdrop.
    await page.mouse.click(5, 5)
    await expect(dialog).not.toBeVisible()
  })

  test('the directory lays out listings in columns, not one long list', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await largestCategory(request, community)

    await page.goto(`/${community}/${category.id}`)
    await dismissLocationPrompt(page)

    // Walks up from a trigger button to the nearest ancestor CSS actually
    // lays out as a grid, rather than assuming a fixed number of DOM levels
    // — brittle against any wrapper div GenericDirectory happens to add or
    // remove between the card and its container.
    const trigger = page.getByRole('button', { name: /^Show details for / }).first()
    const columnCount = await trigger.evaluate((el) => {
      let node: Element | null = el
      while (node && getComputedStyle(node).display !== 'grid') node = node.parentElement
      if (!node) return 0
      return getComputedStyle(node).gridTemplateColumns.split(' ').length
    })
    expect(columnCount, 'the directory grid should lay out more than one column at desktop width').toBeGreaterThan(1)
  })

  // Was anchored to `lg` (1024px), a full breakpoint above where the grid
  // even turns on for `isMobile` purposes (`sm`, 640px — see the grid's own
  // doc). 1024px of content width is already comfortably enough for
  // auto-fill to reserve all 3 of its 280px tracks, so nothing between
  // "wide enough for 3" and "not a grid at all" ever got a chance to be 2 —
  // the grid jumped straight from 3 columns to a single one. Aligning the
  // grid's own breakpoint to `sm` lets auto-fill do the same job at the
  // narrower widths where only 2 of those tracks fit.
  test('narrows 3 columns to 2 before collapsing to 1, rather than jumping straight from 3 to 1', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await largestCategory(request, community)
    const trigger = () => page.getByRole('button', { name: /^Show details for / }).first()
    const columnsAt = async (width: number) => {
      await page.setViewportSize({ width, height: 900 })
      return trigger().evaluate((el) => {
        let node: Element | null = el
        while (node && getComputedStyle(node).display !== 'grid') node = node.parentElement
        return node ? getComputedStyle(node).gridTemplateColumns.split(' ').length : 1
      })
    }

    await page.goto(`/${community}/${category.id}`)
    await dismissLocationPrompt(page)

    expect(await columnsAt(1400)).toBe(3)
    expect(await columnsAt(750)).toBe(2)
    expect(await columnsAt(600)).toBe(1)
  })

  // CategoryBandFrame wraps this whole screen (header, filters, grid) in a
  // full-bleed photo band, and used to break out to the viewport width with
  // `left-1/2 -translate-x-1/2` — a CSS transform. A transform on an
  // ancestor creates a new containing block for any `position: fixed`
  // descendant, and this dialog is `fixed inset-0`, so it ended up
  // positioned relative to that ancestor's own box instead of the viewport
  // — which moves as the page scrolls. Scrolling down first is essential:
  // at scrollY 0 the two containing blocks coincide and the bug is
  // invisible. Fixed by swapping the transform for the calc(50% - 50vw)
  // margin trick, which achieves the same full-bleed layout without ever
  // setting a transform.
  test('the dialog stays centered in the viewport when opened after scrolling down', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await largestCategory(request, community)

    await page.goto(`/${community}/${category.id}`)
    await dismissLocationPrompt(page)

    await page.mouse.wheel(0, 600)
    await page.getByRole('button', { name: /^Show details for / }).first().click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const box = (await dialog.boundingBox())!
    // NOT page.viewportSize() (the nominal configured size, e.g. 1280) and
    // NOT window.innerWidth/innerHeight either — both stay constant
    // regardless of whether a scrollbar is actually showing. CI runs Linux/
    // headless Chromium with a real, space-reserving scrollbar (this app's
    // `scrollbar-gutter: stable` on <html> always leaves room for one); a
    // classic scrollbar narrows the actual rendered content area — the area
    // a `fixed inset-0` element centers within — by its own width, and only
    // document.documentElement.clientWidth/clientHeight reflect that
    // narrowed area. Local dev (macOS, overlay scrollbars, no reserved
    // space) passed either way, which is exactly why this only broke in CI:
    // off by ~7.5px, almost exactly half a ~15px scrollbar's width.
    const viewport = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    }))
    const dialogCenterX = box.x + box.width / 2
    const dialogCenterY = box.y + box.height / 2
    expect(Math.abs(dialogCenterX - viewport.width / 2), 'dialog should be horizontally centered in the viewport').toBeLessThan(5)
    expect(Math.abs(dialogCenterY - viewport.height / 2), 'dialog should be vertically centered in the viewport').toBeLessThan(5)
  })

  // Arrow navigation scrolls the next/previous card into view. That scroll
  // used to only clear the site header's own height — not the SEPARATE
  // sticky search/filter/sort bar directly under it (GenericDirectory's
  // own `lg:sticky lg:top-14` controls row) — so the target's row landed
  // tucked behind that second bar, above the visible content, often almost
  // entirely. jsdom can't compute real layout or `position: sticky`'s
  // actual stuck state, so this only has coverage here.
  test('scrolling to the next card via the arrow clears BOTH sticky bars, not just the header', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await largestCategory(request, community)

    await page.goto(`/${community}/${category.id}`)
    await dismissLocationPrompt(page)

    const triggers = page.getByRole('button', { name: /^Show details for / })
    await triggers.first().click()
    // Several clicks, not one — the first "next" from item 1 is often still
    // in the SAME grid row (no scroll needed at all), which wouldn't have
    // exposed this bug either. Enough clicks to guarantee at least one
    // genuine row-to-row scroll happens.
    for (let i = 0; i < 5; i++) {
      await page.getByRole('button', { name: 'Next listing' }).click()
    }

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()

    // Tracked by position (5 "Next" clicks from the first item lands on the
    // 6th, index 5), not by re-matching the dialog's own aria-label against
    // the trigger buttons' names — two real listings sharing an exact name
    // (a legitimate case: two branches of the same business) made that a
    // strict-mode violation, reported live in CI against real test-project
    // data. The list itself doesn't reorder between these clicks, so the
    // index is stable.
    const nextTrigger = triggers.nth(5)
    await expect(nextTrigger).toBeVisible()

    // The site header is ALSO `position: sticky` (see SiteHeader's own
    // className) — excluding it by tag name isolates GenericDirectory's
    // own controls bar, the second sticky element down.
    const controlsBottom = await page.evaluate(() => {
      const stuck = [...document.querySelectorAll('*')].filter(
        (el) => el.tagName !== 'HEADER' && getComputedStyle(el).position === 'sticky',
      )
      return stuck.length > 0 ? Math.max(...stuck.map((el) => el.getBoundingClientRect().bottom)) : 0
    })
    const rowTop = (await nextTrigger.boundingBox())!.y
    expect(rowTop, 'the next card should sit below both sticky bars, not behind them').toBeGreaterThanOrEqual(controlsBottom - 1)
  })
})

test.describe('listing detail — mobile', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile viewport only')

  test('clicking a listing expands it inline, not a dialog', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)

    await page.goto(`/${community}/${category.id}`)
    await dismissLocationPrompt(page)

    const trigger = page.getByRole('button', { name: /^Show details for / }).first()
    const name = (await trigger.getAttribute('aria-label'))!.replace(/^Show details for /, '')
    await trigger.click()

    await expect(page.getByRole('button', { name: `Hide details for ${name}` })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Tapping again collapses it back.
    await page.getByRole('button', { name: `Hide details for ${name}` }).click()
    await expect(page.getByRole('button', { name: `Show details for ${name}` })).toBeVisible()
  })
})
