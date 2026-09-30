import { expect, test } from '@playwright/test'
import { categoryWithListings, defaultCommunity, dismissLocationPrompt } from './helpers'

// The home search reading a question (decided Sep 30): a question is read
// into the site's own categories, shown as "Read as" and a chip for each,
// the listings answer the reading, and removing a chip changes the answer.
//
// The reader is stood in for with page.route, as in map-reader.spec.ts:
// every test server has it off, and no test may spend or write a reading.

const QUESTION = 'somewhere good please for us'

test('Enter reads the question; the chips say how, and removing one goes back to today’s search', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithListings(request, community)
  const asked: string[] = []
  let askedAt = 0
  await page.route('**/api/ask/read**', async (route) => {
    asked.push((route.request().postDataJSON() as { question: string }).question)
    askedAt ||= Date.now()
    await route.fulfill({ json: { ok: true, reading: { categories: [{ id: category.id }] }, remembered: true } })
  })

  await page.goto(`/${community}`)
  await dismissLocationPrompt(page)
  const box = page.getByRole('textbox', { name: 'Search resources' }).filter({ visible: true })
  await box.fill(QUESTION)
  const enteredAt = Date.now()
  await box.press('Enter')

  const readAs = page.getByTestId('read-as').filter({ visible: true })
  await expect(readAs).toBeVisible()
  await expect(readAs.getByRole('button', { name: `Remove ${category.pluralLabel}` })).toBeVisible()
  expect(asked).toEqual([QUESTION])
  // Read on Enter, not a second later when the pause would have asked.
  expect(askedAt - enteredAt).toBeLessThan(700)

  await readAs.getByRole('button', { name: `Remove ${category.pluralLabel}` }).click()
  await expect(page.getByTestId('read-as').filter({ visible: true })).toHaveCount(0)
  // Asked once: removing a chip edits the reading, it doesn't ask again.
  expect(asked).toEqual([QUESTION])
})

test('a shared question is read as it arrives, without Enter', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithListings(request, community)
  await page.route('**/api/ask/read**', (route) => route.fulfill({ json: { ok: true, reading: { categories: [{ id: category.id }] }, remembered: true } }))

  await page.goto(`/${community}/ask/${encodeURIComponent(QUESTION)}`)
  await dismissLocationPrompt(page)
  await expect(page.getByTestId('read-as').filter({ visible: true })).toContainText(category.pluralLabel)
})
