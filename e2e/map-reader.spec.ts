import { expect, test } from '@playwright/test'
import { categoryWithHoursField, defaultCommunity, dismissLocationPrompt } from './helpers'

// The Map page reading a question (decided Sep 30): a question that isn't a
// place's name is read into the map's own categories and Filters, shown as
// "Read as" and its chips, and clearing the search puts back what was there.
//
// The reader itself is stood in for with page.route: every test server has
// it switched off (QUESTION_READER=off), and a test must never spend on
// OpenAI or write a reading. What's under test is the page's side.

const QUESTION = 'what is serving right now'

test('a question read into the map’s own Filters, shown as "Read as", and put back on clearing', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithHoursField(request, community)
  let asked = ''
  await page.route('**/api/ask/read**', async (route) => {
    asked = (route.request().postDataJSON() as { question: string }).question
    await route.fulfill({ json: { ok: true, reading: { categories: [{ id: category.id, openNow: true }] }, remembered: true } })
  })

  await page.goto(`/${community}/map`)
  await dismissLocationPrompt(page)
  const box = page.getByPlaceholder(/Search name, address/).filter({ visible: true })
  await box.fill(QUESTION)
  await box.press('Enter')

  const row = page.getByTestId('map-active-filters').filter({ visible: true })
  await expect(row.getByTestId('map-read-as')).toBeVisible()
  expect(asked).toBe(QUESTION)
  await expect(row).toContainText('Open now')
  // The reading is the map's own state: in the link, as a Filter would be.
  await expect.poll(() => new URL(page.url()).searchParams.get('cat')).toBe(category.id)
  await expect.poll(() => new URL(page.url()).searchParams.get('open')).toMatch(new RegExp(`^(1|${category.id})$`))

  await page.getByRole('button', { name: 'Clear search' }).filter({ visible: true }).click()
  await expect(page.getByTestId('map-read-as')).toHaveCount(0)
  await expect.poll(() => new URL(page.url()).searchParams.get('open')).toBeNull()
  await expect.poll(() => new URL(page.url()).searchParams.get('cat')).toBeNull()
})

test('when the reader can’t read it, today’s search answers and nothing says "Read as"', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  await categoryWithHoursField(request, community)
  let calls = 0
  await page.route('**/api/ask/read**', async (route) => {
    calls++
    await route.fulfill({ json: { ok: false, reason: 'busy' } })
  })

  await page.goto(`/${community}/map`)
  await dismissLocationPrompt(page)
  const box = page.getByPlaceholder(/Search name, address/).filter({ visible: true })
  await box.fill(QUESTION)
  await box.press('Enter')

  await expect.poll(() => calls).toBe(1)
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(QUESTION)
  await expect(page.getByTestId('map-reading')).toHaveCount(0)
  await expect(page.getByTestId('map-read-as')).toHaveCount(0)
  expect(new URL(page.url()).searchParams.get('open')).toBeNull()
})
