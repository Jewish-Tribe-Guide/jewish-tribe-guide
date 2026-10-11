import { expect, test } from '@playwright/test'
import { categoryWithHoursField, categoryWithListings, defaultCommunity, dismissLocationPrompt } from './helpers'

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
  await page.route('**/api/ask/read**', async (route) => {
    asked.push((route.request().postDataJSON() as { question: string }).question)
    await route.fulfill({ json: { ok: true, reading: { categories: [{ id: category.id }] }, remembered: true } })
  })

  // A pause in typing reads the question too, a second later (Landing.tsx),
  // so a reading alone doesn't show Enter did it. The page's clock is held
  // still from before the question is typed: the pause can't come, and a
  // reading can only be Enter's. Not a stopwatch in the test process, which
  // measured the runner's load as much as the page and failed under it.
  const installedAt = Date.now()
  await page.clock.install({ time: installedAt })
  await page.goto(`/${community}`)
  await dismissLocationPrompt(page)
  const box = page.getByRole('textbox', { name: 'Search resources' }).filter({ visible: true })
  // Held a minute on from install: always ahead of the page's clock, so
  // pausing can't ask it to go back however slowly the page loaded.
  await page.clock.pauseAt(installedAt + 60_000)
  await box.fill(QUESTION)
  // Enter as a person presses it, once the page has answered what was typed.
  // Before then it isn't running yet (no clock until hydration, useNow) and
  // drops the key, and only the pause would read, which is what this used to
  // measure under load: ~1.2s, the pause plus the wait for hydration.
  await expect(page.getByRole('status').filter({ visible: true })).toBeVisible()
  await box.press('Enter')

  const readAs = page.getByTestId('read-as').filter({ visible: true })
  await expect(readAs).toBeVisible()
  await expect(readAs.getByRole('button', { name: `Remove ${category.pluralLabel}` })).toBeVisible()
  expect(asked).toEqual([QUESTION])
  // The pause, when it comes, doesn't ask again: it is the same question.
  await page.clock.runFor(2_000)
  expect(asked).toEqual([QUESTION])

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

// A category page reads its own part of a question the same way: its
// filters as chips (not its own name: the page is that), the list and the
// sentence from the reading.
test('a category page reads its own part of a question, and the list follows it', async ({ page, request }) => {
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

  const readAs = page.getByTestId('read-as')
  await expect(readAs.getByRole('button', { name: 'Remove Open now' })).toBeVisible()
  await expect(readAs.getByRole('button', { name: `Remove ${category.pluralLabel}` })).toHaveCount(0)
  await readAs.getByRole('button', { name: 'Remove Open now' }).click()
  await expect(page.getByTestId('read-as')).toHaveCount(0)
})
