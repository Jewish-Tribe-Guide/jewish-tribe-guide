import { expect, test, type Page } from '@playwright/test'
import { categoryWithHoursField, defaultCommunity, ready } from './helpers'

// The AI isn't part of the search (the user, Oct 27: "trader joes" on
// Synagogues found nothing, then the reading showed every shul; "feels weird
// to search, get an answer, then see reading question, then get a different
// answer"). A question our own search finds nothing for is read in the
// background, on Enter or once the typing stops (the user: "I don't think
// most people click enter"), for the admin's Read questions tab, where its
// words can be taught to the search; the home, a category page and the map
// never wait for the reading or use it. Words that find something are
// never read.
//
// The reader is stood in for with page.route, answering with a reading that
// would change each page if it were used: every test server has it off
// (QUESTION_READER=off), and no test may spend on OpenAI or write a reading.

const QUESTION = 'zqxw qvvjk'
/** useLearnAfterPause's LEARN_PAUSE_MS. */
const PAUSE_MS = 2500

// The pause is a timer, so the tests move the page's clock (page.clock)
// rather than wait it out: each test installs it before loading the page,
// and stops it while typing, so only the test moves it. Real waits made the
// pause's timing depend on the machine: once (Nov 21) a loaded one read late
// enough to fail a "nothing yet" check, and an installed clock left running
// read early under the full suite (Nov 24).

async function standIn(page: Page, categoryId: string) {
  const asked: string[] = []
  await page.route('**/api/ask/read**', async (route) => {
    asked.push((route.request().postDataJSON() as { question: string }).question)
    await route.fulfill({ json: { ok: true, reading: { categories: [{ id: categoryId, openNow: true }] }, remembered: true } })
  })
  return asked
}

/** Stops the page's clock, a second on (pauseAt can't go back, and the
 *  clock runs on while it's asked): from here only `after` moves it. Called
 *  before typing, so the jump can't count toward the pause. */
async function stopClock(page: Page) {
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000))
}

/** Lets the page's clock run `ms`, then gives a read it started a moment to
 *  reach the stand-in, so "nothing was read" means it. */
async function after(page: Page, ms: number) {
  await page.clock.runFor(ms)
  await page.waitForTimeout(300)
}

/** Typed, read once the typing stops (useLearnAfterPause's 2.5s), once. */
async function typeAndLeave(page: Page, box: ReturnType<Page['getByRole']>, asked: string[]) {
  await stopClock(page)
  await box.fill(QUESTION)
  await after(page, PAUSE_MS - 500)
  expect(asked, 'read before the pause was up').toEqual([])
  await page.clock.runFor(500)
  await expect.poll(() => asked).toEqual([QUESTION])
  await after(page, PAUSE_MS * 2)
  expect(asked).toEqual([QUESTION])
  await page.clock.resume()
}

/** Typed, Enter before the pause is up: read at once, and only once. */
async function typeThenEnter(page: Page, box: ReturnType<Page['getByRole']>, asked: string[]) {
  await stopClock(page)
  await box.fill(QUESTION)
  await after(page, PAUSE_MS - 1000)
  expect(asked, 'read before the pause was up').toEqual([])
  await box.press('Enter')
  await expect.poll(() => asked).toEqual([QUESTION])
  await after(page, PAUSE_MS * 2)
  expect(asked).toEqual([QUESTION])
  await page.clock.resume()
}

test('the home: Enter reads it in the background and says it found nothing', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithHoursField(request, community)
  const asked = await standIn(page, category.id)
  await page.clock.install()

  await page.goto(`/${community}`)
  await ready(page)
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
  await page.clock.install()

  await page.goto(`/${community}/${category.id}`)
  await ready(page)
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
  await page.clock.install()

  await page.goto(`/${community}/map`)
  await ready(page)
  const box = page.getByPlaceholder(/Search name, address/).filter({ visible: true })
  await typeThenEnter(page, box, asked)

  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(QUESTION)
  await page.waitForTimeout(300)
  await expect(page.getByTestId('map-read-as')).toHaveCount(0)
  expect(new URL(page.url()).searchParams.get('open')).toBeNull()
  expect(new URL(page.url()).searchParams.get('cat')).toBeNull()
})

test('typed and left, without Enter: read once the typing stops, on every page', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithHoursField(request, community)
  const asked = await standIn(page, category.id)
  await page.clock.install()

  await page.goto(`/${community}`)
  await ready(page)
  const home = page.getByRole('textbox', { name: 'Search resources' }).filter({ visible: true })
  // Words that find something are never read, however long they're left.
  await home.fill(category.pluralLabel)
  await expect(page.getByTestId('search-lines').filter({ visible: true })).toBeVisible()
  await stopClock(page)
  await after(page, PAUSE_MS + 1000)
  expect(asked).toEqual([])
  await page.clock.resume()
  await typeAndLeave(page, home, asked)

  // Each page is its own visit: the tab's answers don't carry over a load.
  asked.length = 0
  await page.goto(`/${community}/${category.id}`)
  await ready(page)
  await typeAndLeave(page, page.getByRole('searchbox', { name: `Search ${category.pluralLabel}` }), asked)

  asked.length = 0
  await page.goto(`/${community}/map`)
  await ready(page)
  await typeAndLeave(page, page.getByPlaceholder(/Search name, address/).filter({ visible: true }), asked)
})
