import { expect, test } from '@playwright/test'
import { categoryAddButton, categoryWithDistances, defaultCommunity, ready } from './helpers'

// Adding a place yourself (agreed Oct 5): "+" opens "Find the place"
// (board R3b, Nov 27), then the listing's boxes as rows (Oct 11), in the box, with Back at each
// step. The Google search itself can't run here (it needs a real Maps key
// and bills per search), so this takes "Fill it in yourself · not on
// Google", which reaches the same form. Sends nothing.
test('Adding finds the place first, then asks the category’s questions, with Back', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  // Has an address, so it starts with the search.
  const { category } = await categoryWithDistances(request, community)

  await page.goto(`/${community}/${category.id}`)
  await ready(page)
  await categoryAddButton(page).click()

  const find = page.getByRole('dialog', { name: 'Find the place' })
  await expect(find.getByPlaceholder('Search by name or address…')).toBeVisible()
  await find.getByRole('button', { name: /^Fill it in yourself/ }).click()

  // Opened from this category's page, it's added there without asking.
  const add = page.getByRole('dialog', { name: `Add to ${category.pluralLabel}` })
  // The listing's boxes as rows (Oct 11), what's needed marked, and Send
  // waiting for it.
  await expect(add.getByTestId('editor-row-name')).toContainText('Needed')
  await expect(add.getByRole('button', { name: /^Still needed: Name/ })).toBeVisible()
  // The name opens where it is (Oct 11, "editorlook"); the header keeps
  // its title, and its Back closes the row first.
  await add.getByTestId('editor-row-name').click()
  await expect(add.getByTestId('editor-open-name').getByRole('textbox', { name: 'Name' })).toBeVisible()
  await expect(add.getByTestId('editor-list')).toBeVisible()
  await add.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(add.getByTestId('editor-open-name')).toHaveCount(0)
  await expect(add.getByTestId('editor-list')).toBeVisible()

  // Back is the header's chevron, before the title.
  await add.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Find the place' })).toBeVisible()
  // Add's first screen: nothing before it to go back to.
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Back', exact: true })).toHaveCount(0)
})
