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
