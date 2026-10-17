import { expect, test, type Page } from '@playwright/test'
import { categories, defaultCommunity, dismissLocationPrompt } from './helpers'

// The phone home (the user, Oct 17), on a real build, at a fixed moment for
// each kind of day: who keeps the guide right at the top (and the sheet it
// opens), Right now, and the categories as tiles.
//
// The week's zmanim are stood in for with page.route, since /api/zmanim
// answers for the real today: Friday Oct 16, 2026 in Philadelphia, candles
// 6:01 PM, havdalah Saturday 6:59 PM, as Hebcal gives them. What's in the
// guide is the test project's own, so only what doesn't depend on it is
// asserted.

// The service worker is kept out: once it controls the page, it fetches
// /api/zmanim itself, where page.route can't stand in for it.
test.use({ timezoneId: 'America/New_York', serviceWorkers: 'block' })

const ZMANIM = {
  hebrewDate: '2 Cheshvan 5787',
  parsha: 'Parashat Noach',
  dailyZmanim: [{ label: 'Sunset', time: '6:18 PM' }],
  shabbos: {
    candleLighting: { label: 'Friday', time: '6:01 PM', iso: '2026-10-16T18:01:00-04:00' },
    havdalah: { label: 'Saturday', time: '6:59 PM', iso: '2026-10-17T18:59:00-04:00' },
  },
}
const DAYS = {
  tuesday: { at: '2026-10-13T12:30:00-04:00', zmanim: { ...ZMANIM, dayOfWeek: 2, isFriday: false, isShabbos: false } },
  friday: { at: '2026-10-16T13:30:00-04:00', zmanim: { ...ZMANIM, hebrewDate: '5 Cheshvan 5787', dayOfWeek: 5, isFriday: true, isShabbos: false } },
  shabbos: { at: '2026-10-17T11:00:00-04:00', zmanim: { ...ZMANIM, hebrewDate: '6 Cheshvan 5787', dayOfWeek: 6, isFriday: false, isShabbos: true } },
}

// The eruvim as /api/eruv gives them, stood in for: the real route reads
// each eruv's site as it answers, so what it says depends on the day and
// the network. Two read from their sites, one with only a hotline.
const ERUVIM = [
  { id: 'center-city', name: 'Center City Eruv', hotline: null, statusUrl: 'https://example.org/', statusDated: false, status: 'up', statusWords: 'Up', statusPostedOn: null, statusCheckedAt: '2026-10-16T17:25:00Z', statusErrorAt: null, statusError: null },
  { id: 'university-city', name: 'University City Eruv', hotline: null, statusUrl: 'https://example.org/', statusDated: false, status: 'up', statusWords: 'Up', statusPostedOn: null, statusCheckedAt: '2026-10-16T17:25:00Z', statusErrorAt: null, statusError: null },
  { id: 'northeast', name: 'Northeast Eruv', hotline: '(215) 333-ERUV', statusUrl: null, statusDated: false, status: null, statusWords: null, statusPostedOn: null, statusCheckedAt: null, statusErrorAt: null, statusError: null },
]

async function openHome(page: Page, day: keyof typeof DAYS) {
  const community = await defaultCommunity(page)
  await page.route('**/api/zmanim?**', (route) => route.fulfill({ json: { ok: true, data: DAYS[day].zmanim } }))
  await page.route(
    (url) => url.pathname === '/api/eruv',
    (route) => route.fulfill({ json: { ok: true, available: true, timezone: 'America/New_York', candles: null, eruvim: ERUVIM, mapsVersion: null } }),
  )
  await page.clock.setFixedTime(new Date(DAYS[day].at))
  await page.goto(`/${community}`)
  await dismissLocationPrompt(page)
  return community
}

test.describe('on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'the phone home')

  test('who keeps it right, at the top, opening how it’s kept up', async ({ page }) => {
    const community = await openHome(page, 'tuesday')
    const band = page.getByTestId('trust-band')
    await expect(band).toBeVisible()
    await expect(band).toContainText('Kept up by the community')
    await expect(band).toContainText(/\d+ places?/)
    // No headline and no mission on show; the search right under it.
    // (The title is still the page's heading, for screen readers: a 1px box.)
    const title = await page.getByTestId('phone-hero').getByRole('heading', { level: 1 }).boundingBox()
    expect(title?.height ?? 0).toBeLessThanOrEqual(1)
    await expect(page.getByRole('textbox', { name: 'Search resources' }).filter({ visible: true })).toBeVisible()

    await band.click()
    const sheet = page.getByRole('dialog', { name: 'How this guide stays right' })
    await expect(sheet).toBeVisible()
    // "if and when" until every place has a date (the test project's own).
    await expect(sheet).toContainText(/Every listing says (when it was last|if and when it was) checked/)
    await expect(sheet).toContainText('A person reviews every change before it shows')
    await expect(sheet.getByRole('link', { name: 'About the guide' })).toHaveAttribute('href', `/${community}/about`)
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
  })

  test('a Tuesday at lunchtime: what’s open, each to its page with Open now on; no candles, no minyan', async ({ page }) => {
    const community = await openHome(page, 'tuesday')
    const now = page.getByTestId('right-now')
    // Late-night-empty is possible in principle; at lunch the test project
    // has places with hours. If it ever doesn't, this says so.
    await expect(now, 'something in the guide is open at Tuesday lunchtime').toBeVisible()
    await expect(now).toHaveAttribute('data-moment', 'weekday')
    await expect(now.getByRole('heading')).toContainText('Right now · Tuesday · 2 Cheshvan')
    for (const href of await now.getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href')))) {
      expect(href).toMatch(new RegExp(`^/${community}/[^/?]+\\?openNow=1$`))
    }
    for (const link of await now.getByRole('link').all()) await expect(link).toContainText(/\d+ open now/)
    await expect(page.getByTestId('today-candles')).toHaveCount(0)
    await expect(now).not.toContainText(/minyan|Mincha/i)
  })

  test('Friday afternoon: the candles card with the eruvim on it, and nothing “open now”', async ({ page, request }) => {
    const community = await openHome(page, 'friday')
    const now = page.getByTestId('right-now')
    await expect(now).toHaveAttribute('data-moment', 'erev')
    const card = page.getByTestId('today-candles')
    await expect(card).toContainText('Candles 6:01 PM')
    // The eruvim, before Shabbos: the answer on the card, in place of a
    // button to the Eruv page (Oct 17), and the way there. It went missing
    // once, when Right now was only told about categories with a tile of
    // their own id.
    if ((await categories(request, community)).some((c) => c.kind === 'eruv')) {
      const eruv = card.getByTestId('today-eruv')
      await expect(eruv).toHaveText(/^Eruvim\s*2 up\s*1 by phone$/)
      await expect(eruv).toHaveAttribute('href', `/${community}/eruv`)
      await expect(card.getByRole('link', { name: 'Eruv', exact: true })).toHaveCount(0)
    }
    await expect(now).not.toContainText('open now')
  })

  test('Shabbos: the card says when it ends; nothing to buy and nothing open', async ({ page }) => {
    await openHome(page, 'shabbos')
    await expect(page.getByTestId('right-now')).toHaveAttribute('data-moment', 'shabbos')
    await expect(page.getByTestId('today-candles')).toContainText('Havdalah 6:59 PM')
    await expect(page.getByTestId('today-before-candles')).toHaveCount(0)
    await expect(page.getByTestId('right-now')).not.toContainText('open now')
  })

  test('the categories as one grid of tiles, each a link to its page, none left out, no headings', async ({ page, request }) => {
    const community = await openHome(page, 'tuesday')
    const tiles = page.getByTestId('category-tiles')
    await expect(tiles.getByRole('listitem').first()).toBeVisible()
    // No group headings (the user, Oct 17), and no "Also:" line.
    await expect(tiles.getByRole('heading')).toHaveCount(0)
    await expect(tiles).not.toContainText('Also:')
    // Every category with a page has its tile.
    const hrefs = await tiles.getByRole('listitem').getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
    for (const href of hrefs) expect(href).toMatch(new RegExp(`^/${community}/`))
    const listing = (await categories(request, community)).filter((c) => c.kind === 'listing')
    for (const c of listing) expect(hrefs).toContain(`/${community}/${c.id}`)
    // Three to a row.
    const tops = await tiles.getByRole('listitem').evaluateAll((lis) => lis.slice(0, 3).map((li) => Math.round(li.getBoundingClientRect().top)))
    if (tops.length === 3) expect(new Set(tops).size).toBe(1)
  })

  // One search box on a phone (Oct 17): the home's had stayed the old pill
  // while every category page had the blue-edged box.
  test('the search box looks like a category page’s', async ({ page, request }) => {
    const community = await openHome(page, 'tuesday')
    const look = (box: import('@playwright/test').Locator) =>
      box.evaluate((input) => {
        const frame = input.parentElement!
        const st = getComputedStyle(frame)
        return { border: st.borderTopColor, width: st.borderTopWidth, radius: st.borderTopLeftRadius, height: Math.round(frame.getBoundingClientRect().height), icon: getComputedStyle(frame.querySelector('svg')!).color }
      })
    const home = await look(page.getByRole('textbox', { name: 'Search resources' }).filter({ visible: true }))
    const category = (await categories(request, community)).find((c) => c.kind === 'listing')!
    await page.goto(`/${community}/${category.id}`)
    await dismissLocationPrompt(page)
    const there = await look(page.getByRole('searchbox').filter({ visible: true }).first())
    expect(home).toEqual(there)
  })
})

test('on a computer, none of it: the photo band home as before', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'the computer’s home')
  await openHome(page, 'tuesday')
  await expect(page.getByTestId('trust-band')).toBeHidden()
  await expect(page.getByTestId('category-tiles')).toBeHidden()
  await expect(page.getByTestId('right-now')).toBeHidden()
})
