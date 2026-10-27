import { expect, test, type Page } from '@playwright/test'
import { categoryWithHoursField, defaultCommunity, dismissLocationPrompt } from './helpers'

// The AI isn't part of the search (the user, Oct 27: "trader joes" on
// Synagogues found nothing, then the reading showed every shul; "feels weird
// to search, get an answer, then see reading question, then get a different
// answer"). A question our own search finds nothing for is read in the
// background on Enter, for the admin's Read questions tab, where its words
// can be taught to the search; the home, a category page and the map never
// wait for the reading or use it, and typing alone reads nothing.
//
// The reader is stood in for with page.route, answering with a reading that
// would change each page if it were used: every test server has it off
// (QUESTION_READER=off), and no test may spend on OpenAI or write a reading.

const QUESTION = 'zqxw qvvjk'

async function standIn(page: Page, categoryId: string) {
  const asked: string[] = []
  await page.route('**/api/ask/read**', async (route) => {
    asked.push((route.request().postDataJSON() as { question: string }).question)
    await route.fulfill({ json: { ok: true, reading: { categories: [{ id: categoryId, openNow: true }] }, remembered: true } })
  })
  return asked
}

/** Typed, a pause longer than the reader's old one, then Enter. */
async function typeThenEnter(page: Page, box: ReturnType<Page['getByRole']>, asked: string[]) {
  await box.fill(QUESTION)
  await page.waitForTimeout(1500)
  expect(asked).toEqual([])
  await box.press('Enter')
  await expect.poll(() => asked).toEqual([QUESTION])
}

test('the home: Enter reads it in the background and says it found nothing', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithHoursField(request, community)
  const asked = await standIn(page, category.id)

  await page.goto(`/${community}`)
  await dismissLocationPrompt(page)
  const box = page.getByRole('textbox', { name: 'Search resources' }).filter({ visible: true })
  // Enter only once the page is running (no clock until hydration): a
  // kind of place's name shows its line once it is.
  await box.fill(category.pluralLabel)
  await expect(page.getByTestId('search-lines').filter({ visible: true })).toBeVisible()
  await typeThenEnter(page, box, asked)

  await expect(page.getByTestId('search-nothing').filter({ visible: true })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe(`/${community}`)
})

test('a category page: Enter reads it in the background, and still says it found nothing', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithHoursField(request, community)
  const asked = await standIn(page, category.id)

  await page.goto(`/${community}/${category.id}`)
  await dismissLocationPrompt(page)
  const box = page.getByRole('searchbox', { name: `Search ${category.pluralLabel}` })
  await typeThenEnter(page, box, asked)

  // It still says it found nothing: the reading's Open now never lands.
  await page.waitForTimeout(300)
  await expect(page.getByTestId('ask-the-group').filter({ visible: true })).toContainText(`for “${QUESTION}”`)
  expect(new URL(page.url()).searchParams.get('read')).toBeNull()
  expect(new URL(page.url()).searchParams.get('openNow')).toBeNull()
})

test('the map: Enter reads it in the background, and nothing says "Read as"', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithHoursField(request, community)
  const asked = await standIn(page, category.id)

  await page.goto(`/${community}/map`)
  await dismissLocationPrompt(page)
  const box = page.getByPlaceholder(/Search name, address/).filter({ visible: true })
  await typeThenEnter(page, box, asked)

  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(QUESTION)
  await page.waitForTimeout(300)
  await expect(page.getByTestId('map-read-as')).toHaveCount(0)
  expect(new URL(page.url()).searchParams.get('open')).toBeNull()
  expect(new URL(page.url()).searchParams.get('cat')).toBeNull()
})
