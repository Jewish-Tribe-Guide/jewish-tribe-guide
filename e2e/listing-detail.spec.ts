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

    const first = page.getByRole('button', { name: /^Show details for / }).first()
    await first.click()
    // Several clicks, not one — the first "next" from item 1 is often still
    // in the SAME grid row (no scroll needed at all), which wouldn't have
    // exposed this bug either. Enough clicks to guarantee at least one
    // genuine row-to-row scroll happens.
    for (let i = 0; i < 5; i++) {
      await page.getByRole('button', { name: 'Next listing' }).click()
    }

    const dialog = page.getByRole('dialog')
    const name = (await dialog.getAttribute('aria-label'))!
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()

    const nextTrigger = page.getByRole('button', { name: `Show details for ${name}` })
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
