import { expect, test, type Page } from '@playwright/test'
import { categories, defaultCommunity, listingCounts, ready, needs } from './helpers'

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
  await ready(page)
  // A phone's first render is the computer's layout, with the computer's
  // copy of Right now, until the screen is measured (useIsMobile, Oct 16),
  // which is a render after React has the page.
  const phone = await page.evaluate(() => matchMedia('(max-width: 639px), (max-height: 639px)').matches)
  if (phone) await expect(page.locator('[data-testid="right-now"][data-wide]')).toHaveCount(0)
  return community
}

test.describe('on a phone', { tag: '@mobile' }, () => {

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
    // One title now, dated or not (Oct 23): each box carries its own date.
    await expect(sheet).toContainText('Every listing says when it was last checked')
    await expect(sheet).toContainText('Something wrong? Open the place and tap Edit listing.')
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
    await expect(now.getByRole('heading')).toHaveText(/^Right now · Tuesday$/i)
    for (const href of await now.getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href')))) {
      expect(href).toMatch(new RegExp(`^/${community}/[^/?]+\\?openNow=1$`))
    }
    for (const link of await now.getByRole('link').all()) await expect(link).toContainText(/\d+ open now/)
    await expect(page.getByTestId('today-candles')).toHaveCount(0)
    await expect(now).not.toContainText(/minyan|Mincha/i)
  })

  // Board K1c (Nov 11): Right now sits close under the search. The
  // computer's spacing between its card rows used to collapse through the
  // phone's empty copies of them into 72px of nothing here. Board Q1
  // (Nov 14): Try asking waits for a tap into the box, so at rest Right now
  // sits under the box itself.
  test('Right now sits close under the search, with no empty gap', async ({ page }) => {
    await openHome(page, 'tuesday')
    const now = page.getByTestId('right-now')
    await expect(now).toBeVisible()
    await expect(page.getByTestId('search-prompts').filter({ visible: true }).getByRole('button')).toHaveCount(0)
    const box = await page.getByRole('textbox', { name: 'Search resources' }).filter({ visible: true }).first().locator('xpath=..').boundingBox()
    const top = await now.boundingBox()
    const gap = (top?.y ?? 0) - ((box?.y ?? 0) + (box?.height ?? 0))
    expect(gap, `the gap between the search box and Right now is ${gap}px`).toBeLessThanOrEqual(32)
    expect(gap).toBeGreaterThanOrEqual(8)
  })

  // The user, Nov 14: in Safari a gap under Feedback · About · Privacy,
  // none in the app added to the home screen. The page left a flat 96px
  // for a 58px tab bar, which only the home-screen app's 34px safe area
  // filled. Chromium, like Safari, has no safe area here, so this is
  // Safari's case: the footer ends just above the bar, as close as the
  // home-screen app had it (4px of air past the bar; 14px read as high).
  test('the footer ends just above the tab bar, no empty band', async ({ page }) => {
    await openHome(page, 'tuesday')
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const privacy = page.getByRole('link', { name: 'Privacy', exact: true }).filter({ visible: true }).last()
    await expect(privacy).toBeVisible()
    await expect(async () => {
      const link = await privacy.boundingBox()
      const bar = await page.getByRole('navigation', { name: 'Primary' }).boundingBox()
      const gap = (bar?.y ?? 0) - ((link?.y ?? 0) + (link?.height ?? 0))
      expect(gap, `the footer's last link ends ${gap}px above the tab bar`).toBeLessThanOrEqual(16)
      expect(gap).toBeGreaterThanOrEqual(0)
    }).toPass({ timeout: 5_000 })
  })

  // One line, as tall as the search box (the user, Nov 14).
  test('Kept up is as tall as the search box', async ({ page }) => {
    await openHome(page, 'tuesday')
    const band = await page.getByTestId('trust-band').boundingBox()
    // The box the input sits in; the input itself is one line of text.
    const box = await page.getByRole('textbox', { name: 'Search resources' }).filter({ visible: true }).first().locator('xpath=..').boundingBox()
    expect(Math.abs(Math.round(band?.height ?? 0) - Math.round(box?.height ?? 0)), `Kept up ${band?.height}px, the search box ${box?.height}px`).toBeLessThanOrEqual(2)
  })

  test('Try asking shows once the box is tapped, and a chip keeps it open', async ({ page }) => {
    await openHome(page, 'tuesday')
    const chips = page.getByTestId('search-prompts').filter({ visible: true }).getByRole('button')
    await expect(chips).toHaveCount(0)
    await page.getByRole('textbox', { name: 'Search resources' }).filter({ visible: true }).first().click()
    await expect(chips.first()).toBeVisible()
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

  // The user, Oct 28: an answer per item, not the one store that has them
  // all. Board U3f (Nov 14): Shabbos shopping, a button per item, each
  // opening its stores with Has and Open now on; the card's number is how
  // many stores open now have any of them, so no item's list is longer.
  test('Friday afternoon: Shabbos shopping, a button per item opening the stores open now that have it', async ({ page }) => {
    const community = await openHome(page, 'friday')
    await expect(page.getByTestId('today-candles')).toBeVisible()
    const card = page.getByTestId('shabbos-shopping')
    const buttons = card.getByRole('link')
    needs((await buttons.count()) > 0, 'no store in the test project lists a Shabbos shopping item')
    for (const link of await buttons.all()) {
      await expect(link).toHaveAttribute('href', new RegExp(`^/${community}/[^/?]+\\?openNow=1&has_[^=&]+=[^&]+$`))
    }
    const stores = Number((await card.textContent())!.match(/(\d+) stores? open/)![1])
    const first = buttons.first()
    const href = (await first.getAttribute('href'))!
    await first.click()
    await expect(page).toHaveURL(href)
    const rows = page.getByTestId('directory-row').filter({ visible: true })
    await expect(rows.first()).toBeVisible()
    expect(await rows.count()).toBeLessThanOrEqual(stores)
  })

  test('Shabbos: the card says when it ends; nothing to buy and nothing open', async ({ page }) => {
    await openHome(page, 'shabbos')
    await expect(page.getByTestId('right-now')).toHaveAttribute('data-moment', 'shabbos')
    await expect(page.getByTestId('today-candles')).toContainText('Havdalah 6:59 PM')
    await expect(page.getByTestId('shabbos-shopping')).toHaveCount(0)
    await expect(page.getByTestId('right-now')).not.toContainText('open now')
  })

  // The user, Oct 20: "Candle Lighting & Zmanim" came out "Candle Lighting
  // &…", the one word that says what else is there cut off. A tile shows its
  // whole name. Checked on every tile, and on one given that name, since
  // the test project's own names may all be short.
  test('every tile shows its whole name, a long one too', async ({ page }) => {
    // An iPhone's width, not the Pixel 7's wider 412px, where it fit.
    await page.setViewportSize({ width: 375, height: 812 })
    await openHome(page, 'tuesday')
    const names = page.getByTestId('category-tiles').getByTestId('tile-name')
    await expect(names.first()).toBeVisible()
    await names.first().evaluate((el) => (el.textContent = 'Candle Lighting & Zmanim'))
    const cut = await names.evaluateAll((els) => els.filter((el) => el.scrollHeight > el.clientHeight + 1).map((el) => el.textContent))
    expect(cut, 'tiles whose name is cut off').toEqual([])
  })

  test('the categories as one grid of tiles, each a link to its page, none left out, no headings', async ({ page, request }) => {
    const community = await openHome(page, 'tuesday')
    const tiles = page.getByTestId('category-tiles')
    await expect(tiles.getByRole('listitem').first()).toBeVisible()
    // No group headings (the user, Oct 17), and no "Also:" line. One
    // heading: the small label over the tiles (board K1c, Nov 11).
    await expect(tiles.getByRole('heading')).toHaveText(['Explore by Category'])
    await expect(tiles).not.toContainText('Also:')
    // Every category with a page has its tile.
    const hrefs = await tiles.getByRole('listitem').getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
    for (const href of hrefs) expect(href).toMatch(new RegExp(`^/${community}/`))
    const listing = (await categories(request, community)).filter((c) => c.kind === 'listing')
    for (const c of listing) expect(hrefs).toContain(`/${community}/${c.id}`)
    // Three to a row.
    const tops = await tiles.getByRole('listitem').evaluateAll((lis) => lis.slice(0, 3).map((li) => Math.round(li.getBoundingClientRect().top)))
    if (tops.length === 3) expect(new Set(tops).size).toBe(1)
    // Most places first, as the computer's grid (the user, Oct 17), by the
    // API's own counts, since a tile shows no number (the user, Oct 17).
    // The first tile is the biggest category: its name, and no number.
    await expect(tiles.getByRole('listitem').first()).not.toContainText(/\d/)
    const counts = await listingCounts(request, community)
    const shown = hrefs.map((h) => h!.split('/').at(-1)!).filter((id) => id in counts).map((id) => counts[id])
    expect(shown.length).toBeGreaterThan(1)
    expect(shown).toEqual([...shown].sort((a, b) => b - a))
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
    // Retried: read while the page swaps in the phone's layout, the box is
    // a detached one and every style comes back empty.
    await expect.poll(() => look(page.getByRole('searchbox').filter({ visible: true }).first())).toEqual(home)
  })
})

// The computer has a Right now of its own since board U1 (Nov 14), wide,
// under Explore; the phone's stays hidden.
test('on a computer, none of the phone’s: the photo band home, Right now its own wide one', { tag: '@desktop' }, async ({ page }) => {
  await openHome(page, 'tuesday')
  await expect(page.getByTestId('trust-band')).toBeHidden()
  await expect(page.getByTestId('category-tiles')).toBeHidden()
  await expect(page.locator('[data-testid="right-now"]:not([data-wide])')).toBeHidden()
  await expect(page.locator('[data-testid="right-now"][data-wide]')).toBeVisible()
})
