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
  await box.getByRole('button', { name: 'Find the place' }).click()
  await expect(page.getByRole('dialog', { name: 'Find the place' })).toBeVisible()
})

test('the Map has no “+ Add”', async ({ page }) => {
  const community = await defaultCommunity(page)
  await page.goto(`/${community}/map`)
  // On a phone the Map hides the header, so wait for its own search box:
  // a page that hasn't rendered would have no Add either.
  await page.getByPlaceholder(/Search name, address/).filter({ visible: true }).waitFor()
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0)
})

// Oct 6: an open listing's Suggest an edit opens the box about it, its
// "Edit the details myself" leading to the editor. On a phone the page's
// floating "+" steps aside while a listing is open (it covered the
// listing's overflow); on desktop it stays (the listing's own row is at
// its foot, out of sight), for adding anything. A click here fails if
// anything covers it.
test('an open listing’s Suggest an edit opens the box about that listing', async ({ page, request, isMobile }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithListings(request, community)
  const body = await (await request.get(`/api/resources?category=${category.id}&community=${community}`)).json()
  const listing = body.resources[0] as { id: string; name: string }
  await page.goto(`/${community}/${category.id}?item=${listing.id}`)
  await ready(page)
  await dismissLocationPrompt(page)

  if (isMobile) {
    await expect(categoryAddButton(page)).toHaveCount(0)
  } else {
    await categoryAddButton(page).click()
    const general = page.getByRole('dialog', { name: 'Saw something? Tell us' })
    await expect(general).toBeVisible()
    await general.getByRole('button', { name: 'Close' }).click()
    await expect(general).toBeHidden()
  }
  await page.getByRole('button', { name: 'Suggest an edit' }).filter({ visible: true }).click()
  const box = page.getByRole('dialog', { name: `Tell us about ${listing.name}` })
  await expect(box).toBeVisible()
  await expect(box.getByRole('button', { name: 'Edit the details myself' })).toBeVisible()
  await box.getByRole('button', { name: 'Edit the details myself' }).click()
  // The listing-shaped editor, which says it has nothing to send yet.
  await expect(page.getByRole('button', { name: 'No changes yet' }).filter({ visible: true })).toBeVisible()
})
