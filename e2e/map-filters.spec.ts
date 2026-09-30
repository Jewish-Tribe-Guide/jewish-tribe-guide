import { expect, test } from '@playwright/test'
import { categoryWithHoursField, defaultCommunity, dismissLocationPrompt } from './helpers'

// The Map page's Filters (agreed Sep 30): one button before the category
// chips, opening the category pages' own sheet with a section per category
// showing. In a real browser because what matters here is real: the sheet
// over the full-screen map, the address bar it writes, and Escape closing
// the sheet without taking the map with it (the map's own Escape exits
// full screen, and both listen to the same key).

test('the Map page’s Filters: a section per category, its Open now in the link, and Escape closes only the sheet', async ({ page, request, isMobile }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithHoursField(request, community)

  await page.goto(`/${community}/map?cat=${category.id}`)
  await dismissLocationPrompt(page)

  await page.getByTestId('map-filters-button').filter({ visible: true }).click()
  const sheet = page.getByTestId('map-filters').filter({ visible: true })
  const section = sheet.getByTestId(`map-filters-${category.id}`)
  await expect(section).toBeVisible()

  await section.getByRole('switch', { name: 'Open now' }).click()
  await expect(section.getByRole('switch', { name: 'Open now' })).toBeChecked()
  // Open now for this category, written as the category's own. (With one
  // category keeping hours showing, it's also every one that does, so the
  // link may say open=1.)
  await expect.poll(() => new URL(page.url()).searchParams.get('open')).toMatch(new RegExp(`^(1|${category.id})$`))

  if (!isMobile) {
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Filters' })).toHaveCount(0)
    // Still on the map, still filtered.
    expect(new URL(page.url()).pathname).toBe(`/${community}/map`)
    await expect(page.getByTestId('map-active-filters').filter({ visible: true })).toContainText('Open now')
  }
})
