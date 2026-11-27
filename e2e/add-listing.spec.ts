import { expect, test } from '@playwright/test'
import { categoryAddButton, categoryWithDistances, defaultCommunity, ready } from './helpers'

// Adding a place yourself (agreed Oct 5): "+" opens "Find the place"
// (board R3b, Nov 27), then the listing's boxes as rows (Oct 11), in the box, with Back at each
// step. The Google search itself can't run here (it needs a real Maps key
// and bills per search), so this types a name and takes "Fill in ‘…’
// yourself · not on Google", which reaches the same form (only once
// something is typed, Nov 27). Sends nothing.
test('Adding finds the place first, then asks the category’s questions, with Back', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  // Has an address, so it starts with the search.
  const { category } = await categoryWithDistances(request, community)

  await page.goto(`/${community}/${category.id}`)
  await ready(page)
  await categoryAddButton(page).click()

  const find = page.getByRole('dialog', { name: 'Add or update' })
  const search = find.getByPlaceholder('Search by name or address…')
  await expect(search).toBeVisible()
  await expect(find.getByRole('button', { name: /not on Google/ })).toHaveCount(0)
  await search.fill('Kosher Corner')
  await find.getByRole('button', { name: /^Fill in “Kosher Corner” yourself/ }).click()

  // Opened from this category's page, it's added there without asking.
  const add = page.getByRole('dialog', { name: `Add to ${category.pluralLabel}` })
  // The listing's boxes as rows (Oct 11), starting with the name typed.
  await expect(add.getByTestId('editor-row-name')).toContainText('Kosher Corner')
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
  await expect(page.getByRole('dialog', { name: 'Add or update' })).toBeVisible()
  // Add's first screen: nothing before it to go back to.
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Back', exact: true })).toHaveCount(0)
})
