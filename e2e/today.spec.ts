import { expect, test, type Page } from '@playwright/test'
import { defaultCommunity, dismissLocationPrompt, previewSettings } from './helpers'

// The Today home (step 6), on a real build, at a fixed moment for each kind
// of day: which blocks show, in what order, and which never do.
//
// Read-only, like everything in e2e/: Today is turned on the way the admin's
// Preview does it, with a draft in this tab's sessionStorage and ?preview=1
// (see previewDraft.ts), never by saving. The week's zmanim are stood in for
// with page.route, since /api/zmanim answers for the real today: Friday
// Oct 9, 2026 in Philadelphia, candles 6:12 PM, havdalah Saturday 7:09 PM,
// as Hebcal gives them. What's in the guide (shuls, stores, hours) is the
// test project's own, so only what doesn't depend on it is asserted.

// The service worker is kept out: once it controls the page, it fetches
// /api/zmanim itself, where page.route can't stand in for it.
test.use({ timezoneId: 'America/New_York', serviceWorkers: 'block' })

const ZMANIM = {
  hebrewDate: '28 Tishrei 5787',
  parsha: 'Parashat Bereshit',
  dailyZmanim: [{ label: 'Sunset', time: '6:30 PM' }],
  shabbos: {
    candleLighting: { label: 'Friday', time: '6:12 PM', iso: '2026-10-09T18:12:00-04:00' },
    havdalah: { label: 'Saturday', time: '7:09 PM', iso: '2026-10-10T19:09:00-04:00' },
  },
}
const DAYS = {
  friday: { at: '2026-10-09T13:30:00-04:00', zmanim: { ...ZMANIM, dayOfWeek: 5, isFriday: true, isShabbos: false } },
  shabbos: { at: '2026-10-10T11:00:00-04:00', zmanim: { ...ZMANIM, hebrewDate: '29 Tishrei 5787', dayOfWeek: 6, isFriday: false, isShabbos: true } },
  tuesday: { at: '2026-10-06T12:30:00-04:00', zmanim: { ...ZMANIM, hebrewDate: '25 Tishrei 5787', dayOfWeek: 2, isFriday: false, isShabbos: false } },
}

/** The site's own saved settings and sections, with the Today home and the
 *  tabs it goes with, as the admin's Preview would hand them over. */
async function openToday(page: Page, day: keyof typeof DAYS, path = '') {
  const community = await defaultCommunity(page)
  await previewSettings(page, community, {
    homeStyle: 'today',
    todayHidden: [],
    mobileTabs: [
      { id: 'categories', label: 'Today', target: 'categories' },
      { id: 'map', label: 'Map', target: 'map' },
      { id: 'browse', label: 'Browse', target: 'browse' },
    ],
  })
  await page.route('**/api/zmanim?**', (route) => route.fulfill({ json: { ok: true, data: DAYS[day].zmanim } }))
  await page.clock.setFixedTime(new Date(DAYS[day].at))
  await page.goto(`/${community}${path}?preview=1`)
  await dismissLocationPrompt(page)
  return community
}

/** The blocks' order, by the test id each carries. */
async function blocks(page: Page): Promise<string[]> {
  return page.getByTestId('today-home').locator('section[data-testid]').evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')!))
}

test('Friday afternoon: the candles card first; nothing “open now”', async ({ page }) => {
  await openToday(page, 'friday')
  const home = page.getByTestId('today-home')
  await expect(home).toHaveAttribute('data-moment', 'erev')
  const card = page.getByTestId('today-candles')
  await expect(card).toContainText('Candles 6:12 PM')
  await expect(card).toContainText('In 4 hr 42 min')
  expect((await blocks(page))[0]).toBe('today-candles')
  await expect(page.getByTestId('today-open-now')).toHaveCount(0)
  // The day line, in the community's time, with the Hebrew date.
  await expect(page.getByText('Friday, Oct 9 · 28 Tishrei').filter({ visible: true })).toBeVisible()
})

test('Shabbos: the card says when it ends; nothing to buy and nothing open', async ({ page }) => {
  await openToday(page, 'shabbos')
  await expect(page.getByTestId('today-home')).toHaveAttribute('data-moment', 'shabbos')
  await expect(page.getByTestId('today-candles')).toContainText('Havdalah 7:09 PM')
  await expect(page.getByTestId('today-before-candles')).toHaveCount(0)
  await expect(page.getByTestId('today-open-now')).toHaveCount(0)
})

test('a Tuesday at lunchtime: no candles card, no shopping', async ({ page }) => {
  await openToday(page, 'tuesday')
  await expect(page.getByTestId('today-home')).toHaveAttribute('data-moment', 'weekday')
  await expect(page.getByTestId('today-candles')).toHaveCount(0)
  await expect(page.getByTestId('today-before-candles')).toHaveCount(0)
  await expect(page.getByText('Tuesday, Oct 6 · 25 Tishrei · sunset 6:30 PM').filter({ visible: true })).toBeVisible()
  // Whatever's open is lunch's.
  const open = page.getByTestId('today-open-now')
  if (await open.count()) await expect(open.getByRole('heading')).toHaveText('Lunch, open now')
})

test('Browse: on a phone, a short row ending in All, to the Browse page and its tab', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the row and the tabs are a phone’s')
  const community = await openToday(page, 'tuesday')
  const row = page.getByTestId('today-browse-row')
  await expect(row.getByRole('link', { name: 'All ›' })).toHaveAttribute('href', `/${community}/browse`)

  await page.goto(`/${community}/browse?preview=1`)
  await expect(page.getByRole('heading', { level: 1, name: 'Browse' })).toBeVisible()
  await expect(page.locator('[data-testid^="browse-group-"]').first()).toBeVisible()
  const tabs = page.getByRole('navigation', { name: 'Primary' })
  await expect(tabs.getByRole('button', { name: 'Browse' })).toHaveAttribute('aria-current', 'page')
  await tabs.getByRole('button', { name: 'Today' }).click()
  await expect(page).toHaveURL(new RegExp(`/${community}$`))
})

test('Browse on desktop: every category beside the answers', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the list is desktop’s')
  await openToday(page, 'tuesday')
  const list = page.getByTestId('today-browse')
  await expect(list).toBeVisible()
  await expect(list.getByRole('link', { name: 'Map ›' })).toBeVisible()
})
