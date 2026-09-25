import { expect, test } from '@playwright/test'
import { categoryAddButton, categoryWithDistances, defaultCommunity, dismissLocationPrompt, ready } from './helpers'

// Add is two steps: find the place on Google, then finish it in the
// listing's own shape (ListingAdd → ListingEditor). The Google search itself
// can't run here — it needs a real Maps key and bills per search — so this
// takes the "Not on Google? Enter it yourself" path, which reaches the same
// second step. Sends nothing: Send is never pressed, and with nothing filled
// in it isn't even on.
test('Add finds the place first, then finishes it as the listing', async ({ page, request, isMobile }) => {
  const community = await defaultCommunity(page)
  // Has an address, so it starts with the search.
  const { category } = await categoryWithDistances(request, community)

  await page.goto(`/${community}/${category.id}`)
  await ready(page)
  await dismissLocationPrompt(page)
  await categoryAddButton(page).click()

  const add = page.getByRole('dialog', { name: `Add a ${category.label}` })
  await expect(add).toBeVisible()
  await expect(add.getByLabel('Find the place')).toBeVisible()

  await add.getByRole('button', { name: 'Not on Google? Enter it yourself' }).click()
  await expect(add.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible()
  const send = page.getByRole('button', { name: /^Still needed: / })
  await expect(send).toHaveText('Still needed: Name, Address')
  await expect(send).toBeDisabled()
  // On desktop Send floats under the dialog, as it does for an edit.
  if (!isMobile) await expect(add.locator('.dialog-in')).not.toContainText('Still needed')

  await add.getByRole('textbox', { name: 'Name', exact: true }).fill('An e2e test place that is never sent')
  await expect(send).toHaveText('Still needed: Address')

  await add.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(add.getByLabel('Find the place')).toBeVisible()
})
