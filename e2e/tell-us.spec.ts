import { expect, test } from '@playwright/test'
import { categoryAddButton, categoryWithListings, defaultCommunity, dismissLocationPrompt, ready } from './helpers'

// "+ Add" opens the box ("Add or update a place" since Oct 10) on every
// screen but the Map (decided Oct 5). Read-only like everything in e2e/: nothing here reads a
// message or sends one (that would call the AI and file a suggestion).

test('the home page’s “+ Add” opens the box', async ({ page }) => {
  const community = await defaultCommunity(page)
  await page.goto(`/${community}`)
  await ready(page)
  await dismissLocationPrompt(page)

  await page.getByRole('button', { name: 'Add', exact: true }).click()
  const box = page.getByRole('dialog', { name: 'Add or update a place' })
  await expect(box).toBeVisible()
  await expect(box.getByLabel('Your message')).toBeVisible()
  await expect(box.getByRole('button', { name: 'See what changes' })).toBeDisabled()
})

test('a category’s “+” opens the box, with filling it in yourself one link away', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithListings(request, community)
  await page.goto(`/${community}/${category.id}`)
  await ready(page)
  await dismissLocationPrompt(page)

  await categoryAddButton(page).click()
  const box = page.getByRole('dialog', { name: 'Add or update a place' })
  await box.getByLabel('Your message').fill('Acme on 5th has challah')
  await expect(box.getByRole('button', { name: 'See what changes' })).toBeEnabled()
  await box.getByRole('button', { name: 'Fill it in yourself' }).click()
  await expect(page.getByRole('dialog', { name: 'Find the place' })).toBeVisible()
})

// Oct 27, the user: on a phone "you don't necessarily notice the 'fill it
// in yourself' option", and closing it is "a sudden shift in the background
// lighting" that a listing doesn't have. At half height the link sat under
// the screen's edge; the box now opens at its content's height. And it was
// taken off the page the moment it closed, its dimmed backdrop with it, in
// one frame; it slides and fades away now, as a listing does.
test.describe('the box on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile viewport only')

  test('opens tall enough to show Fill it in yourself, and no taller', async ({ page }) => {
    // A phone with Safari's bars showing: shorter than the emulated screen.
    await page.setViewportSize({ width: 375, height: 660 })
    const community = await defaultCommunity(page)
    await page.goto(`/${community}`)
    await ready(page)
    await dismissLocationPrompt(page)

    await page.getByRole('button', { name: 'Add', exact: true }).click()
    const box = page.getByRole('dialog', { name: 'Add or update a place' })
    const link = box.getByRole('button', { name: 'Fill it in yourself' })
    await expect(link).toBeVisible()
    // Once it has finished sliding up.
    await expect.poll(async () => (await box.boundingBox())?.y).toBeLessThan(660)
    await page.waitForTimeout(400)
    const sheet = (await box.boundingBox())!
    const yourself = (await link.boundingBox())!
    expect(yourself.y + yourself.height, 'Fill it in yourself is on the screen').toBeLessThanOrEqual(660)
    expect(sheet.y + sheet.height - (yourself.y + yourself.height), 'and the box ends under it').toBeLessThan(60)
    expect(sheet.height, 'not the full height').toBeLessThan(660 - 76)
  })

  test('closing slides and fades it away, as a listing does', async ({ page }) => {
    const community = await defaultCommunity(page)
    await page.goto(`/${community}`)
    await ready(page)
    await dismissLocationPrompt(page)

    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await page.getByRole('dialog', { name: 'Add or update a place' }).getByLabel('Your message').fill('Acme on 5th has challah')
    await page.waitForTimeout(400)
    // Timed in the page: Playwright's own round trips are slower than the slide.
    const shownAfter60ms = await page.evaluate(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await new Promise((r) => setTimeout(r, 60))
      return !!document.querySelector('[role=dialog][aria-label="Add or update a place"]')
    })
    expect(shownAfter60ms, 'still sliding away 60ms after closing').toBe(true)
    await expect(page.getByRole('dialog', { name: 'Add or update a place' })).toHaveCount(0)

    // And opened again, it starts over.
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Add or update a place' }).getByLabel('Your message')).toHaveValue('')
  })
})

test('the Map has no “+ Add”', async ({ page }) => {
  const community = await defaultCommunity(page)
  await page.goto(`/${community}/map`)
  // On a phone the Map hides the header, so wait for its own search box:
  // a page that hasn't rendered would have no Add either.
  await page.getByPlaceholder(/Search name, address/).filter({ visible: true }).waitFor()
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0)
})

// Oct 15: an open listing's Edit listing opens the editor itself, not the
// box about it ("show actual edit. Not AI"). On a phone the page's
// floating "+" steps aside while a listing is open (it covered the
// listing's overflow); on desktop it stays (the listing's own row is at
// its foot, out of sight), for adding anything. A click here fails if
// anything covers it.
test('an open listing’s Edit listing opens the editor, not the box about that listing', async ({ page, request, isMobile }) => {
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
    const general = page.getByRole('dialog', { name: 'Add or update a place' })
    await expect(general).toBeVisible()
    await general.getByRole('button', { name: 'Close' }).click()
    await expect(general).toBeHidden()
  }
  await page.getByRole('button', { name: 'Edit listing' }).filter({ visible: true }).click()
  // The listing-shaped editor, which says it has nothing to send yet.
  await expect(page.getByRole('button', { name: 'No changes yet' }).filter({ visible: true })).toBeVisible()
  await expect(page.getByRole('dialog', { name: `Update ${listing.name}` })).toHaveCount(0)
})
