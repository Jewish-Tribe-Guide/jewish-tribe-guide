import { expect, test } from '@playwright/test'
import { categoryAddButton, categoryWithListings, defaultCommunity, dismissLocationPrompt, ready } from './helpers'

// "+ Add" opens "Saw something? Tell us" on every screen but the Map
// (decided Oct 5). Read-only like everything in e2e/: nothing here reads a
// message or sends one (that would call the AI and file a suggestion).

test('the home page’s “+ Add” opens the box', async ({ page }) => {
  const community = await defaultCommunity(page)
  await page.goto(`/${community}`)
  await ready(page)
  await dismissLocationPrompt(page)

  await page.getByRole('button', { name: 'Add', exact: true }).click()
  const box = page.getByRole('dialog', { name: 'Saw something? Tell us' })
  await expect(box).toBeVisible()
  await expect(box.getByLabel('What did you see?')).toBeVisible()
  await expect(box.getByRole('button', { name: 'See what changes' })).toBeDisabled()
})

test('a category’s “+” opens the box, with filling it in yourself one link away', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithListings(request, community)
  await page.goto(`/${community}/${category.id}`)
  await ready(page)
  await dismissLocationPrompt(page)

  await categoryAddButton(page).click()
  const box = page.getByRole('dialog', { name: 'Saw something? Tell us' })
  await box.getByLabel('What did you see?').fill('Acme on 5th has challah')
  await expect(box.getByRole('button', { name: 'See what changes' })).toBeEnabled()
  await box.getByRole('button', { name: 'Add a place' }).click()
  await expect(page.getByRole('dialog', { name: `Add a ${category.label}` })).toBeVisible()
})

test('the Map has no “+ Add”', async ({ page }) => {
  const community = await defaultCommunity(page)
  await page.goto(`/${community}/map`)
  // On a phone the Map hides the header, so wait for its own search box:
  // a page that hasn't rendered would have no Add either.
  await page.getByPlaceholder(/Search name, address/).filter({ visible: true }).waitFor()
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0)
})

// Agreed Oct 5: "+" stays over an open listing and opens the box about it.
// It used to sit under the listing's backdrop, dimmed and inert; a click
// here fails if anything still covers it.
test('over an open listing, “+” opens the box about that listing', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithListings(request, community)
  const body = await (await request.get(`/api/resources?category=${category.id}&community=${community}`)).json()
  const listing = body.resources[0] as { id: string; name: string }
  await page.goto(`/${community}/${category.id}?item=${listing.id}`)
  await ready(page)
  await dismissLocationPrompt(page)

  await categoryAddButton(page).click()
  const box = page.getByRole('dialog', { name: `Tell us about ${listing.name}` })
  await expect(box).toBeVisible()
  await expect(box.getByRole('button', { name: 'Edit the details myself' })).toBeVisible()
})
