import { expect, test } from '@playwright/test'
import { categoryWithHoursField, categoryWithListings, defaultCommunity, dismissLocationPrompt } from './helpers'

// A question our own search doesn't follow is read by the question reader,
// and the reading decides where the search lands (Oct 13, "search takes you
// to the page"): Enter goes to that kind of place, with the reading in its
// own Filters and the question in its box. It used to answer on the home
// screen, with "Read as" chips over the answer.
//
// The reader is stood in for with page.route, as in map-reader.spec.ts:
// every test server has it off, and no test may spend or write a reading.

const QUESTION = 'somewhere good please for us'

test('Enter reads the question and lands where the reading says, the reading in the page’s Filters', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithListings(request, community)
  const asked: string[] = []
  await page.route('**/api/ask/read**', async (route) => {
    asked.push((route.request().postDataJSON() as { question: string }).question)
    await route.fulfill({ json: { ok: true, reading: { categories: [{ id: category.id }] }, remembered: true } })
  })

  await page.goto(`/${community}`)
  await dismissLocationPrompt(page)
  const box = page.getByRole('textbox', { name: 'Search resources' }).filter({ visible: true })
  await box.fill(QUESTION)
  // Enter as a person presses it, once the page is running (no clock until
  // hydration, useNow): the box's own list says it is.
  await expect(page.getByTestId('search-lines').filter({ visible: true })).toBeVisible()
  await box.press('Enter')

  await page.waitForURL((url) => url.pathname === `/${community}/${category.id}`)
  const url = new URL(page.url())
  expect(url.searchParams.get('q')).toBe(QUESTION)
  expect(url.searchParams.get('read')).toBe('1')
  await expect(page.getByRole('searchbox', { name: `Search ${category.pluralLabel}` })).toHaveValue(QUESTION)
  await expect(page.getByTestId('read-as')).toHaveCount(0)
  // Read once, whether Enter or the pause before it asked.
  expect(asked).toEqual([QUESTION])
})

// A category page reads its own part of a question the same way: into its
// own Filters, where it can be switched off, and the list widens.
test('a category page reads its own part of a question into its Filters, and switching it off widens the list', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithHoursField(request, community)
  await page.route('**/api/ask/read**', (route) =>
    route.fulfill({ json: { ok: true, reading: { categories: [{ id: category.id, openNow: true }, { id: 'no-such-category' }] }, remembered: true } }),
  )

  await page.goto(`/${community}/${category.id}`)
  await dismissLocationPrompt(page)
  const box = page.getByRole('searchbox', { name: `Search ${category.pluralLabel}` })
  await box.fill(QUESTION)
  await box.press('Enter')

  const filters = page.getByRole('button', { name: /^Filters/ }).filter({ visible: true })
  await expect(filters).toContainText('1')
  await expect(page.getByTestId('read-as')).toHaveCount(0)
  await filters.click()
  const openNow = page.getByRole('switch', { name: 'Open now' })
  await expect(openNow).toHaveAttribute('aria-checked', 'true')
  await openNow.click()
  await expect(openNow).toHaveAttribute('aria-checked', 'false')
  await expect(box).toHaveValue(QUESTION)
})
