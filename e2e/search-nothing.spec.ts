import { expect, test } from '@playwright/test'
import { categoryWithListings, defaultCommunity, dismissLocationPrompt } from './helpers'

// A search that finds nothing says so, with where to ask, as a category
// page's does, as it's typed: not only on Enter, which most people never
// press (the user, Oct 27). The map used to say "Turn on a category above"
// once searched, which is what it says when every category is off.

const NOTHING = 'zqxw qvvjk'

test('the home says it found nothing as it is typed', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithListings(request, community)
  await page.goto(`/${community}`)
  await dismissLocationPrompt(page)
  const box = page.getByRole('textbox', { name: 'Search resources' }).filter({ visible: true })
  // Once the page is running: a kind of place's name shows its line.
  await box.fill(category.pluralLabel)
  await expect(page.getByTestId('search-lines').filter({ visible: true })).toBeVisible()
  await expect(page.getByTestId('search-nothing')).toHaveCount(0)

  await box.fill(NOTHING)
  await expect(page.getByTestId('search-nothing').filter({ visible: true })).toContainText(`Nothing in the guide for “${NOTHING}”.`)
})

test('the map says it found nothing as it is typed, and in the list once searched', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithListings(request, community)
  await page.goto(`/${community}/map`)
  await dismissLocationPrompt(page)
  const box = page.getByPlaceholder(/Search name, address/).filter({ visible: true })
  const nothing = page.getByTestId('ask-the-group').filter({ visible: true })

  // Words the search answers say nothing of the kind.
  await box.click()
  await box.fill(category.pluralLabel)
  await page.waitForTimeout(300)
  await expect(nothing).toHaveCount(0)

  await box.fill(NOTHING)
  await expect(nothing).toContainText(`Nothing in the guide for “${NOTHING}”.`)

  await box.press('Enter')
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(NOTHING)
  await expect(nothing.first()).toContainText(`Nothing in the guide for “${NOTHING}”.`)
  await expect(page.getByText('No places to show').filter({ visible: true })).toHaveCount(0)
})
