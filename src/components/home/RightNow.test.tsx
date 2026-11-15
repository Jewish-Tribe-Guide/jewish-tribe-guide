// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import type { CategoryField } from '@/lib/categories'
import type { MinyanSchedule } from '@/lib/useMinyanSchedule'
import type { ZmanimData } from '@/types'
import { clearEruvStatuses } from '@/lib/useEruvStatuses'
import RightNow from './RightNow'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// The phone home's Right now (the user, Oct 17), for each kind of day, with
// the clock fixed: what's open on a weekday, the candles card and Before
// candles on Friday, the card alone on Shabbos; the next minyan or the eruv
// only when the admin chose them (board V1, Nov 15).
const NY = 'America/New_York'
const hours: CategoryField = { key: 'hours', label: 'Hours', type: 'hours', filterable: true }
const meatDairy: CategoryField = {
  key: 't',
  label: 'Type',
  type: 'select',
  filterable: true,
  options: ['Meat', 'Dairy', 'Parve'].map((v) => ({ value: v, label: v })),
}
const kosherType: CategoryField = {
  key: 'isKosher',
  label: 'Kosher Store',
  type: 'select',
  filterable: true,
  options: ['Kosher Store', 'Kosher Items'].map((v) => ({ value: v, label: v })),
}
const items: CategoryField = { key: 'm', label: 'Items', type: 'tags', showCountInHeader: true, countLabel: 'kosher item' }
const shuls = makeCategory({ id: 'synagogue', label: 'Synagogue', pluralLabel: 'Synagogues', detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] })
const FOOD_PICTURE = 'https://example.supabase.co/storage/v1/object/public/site-assets/category-band/food-pic.jpeg'
const food = makeCategory({ id: 'restaurant', label: 'Food', pluralLabel: 'Food', icon: '🍽️', cardBandImageUrl: FOOD_PICTURE, detailFields: [hours, meatDairy] })
const grocery = makeCategory({ id: 'grocery', label: 'Grocery', pluralLabel: 'Grocery', detailFields: [hours, kosherType, items] })
const zmanimPage = makeCategory({ id: 'prayer-shabbat-times', kind: 'zmanim', label: 'Zmanim', pluralLabel: 'Zmanim' })
const eruvPage = makeCategory({ id: 'eruv-information', kind: 'eruv', label: 'Eruv', pluralLabel: 'Eruv Information' })
const categories = [shuls, food, grocery, zmanimPage, eruvPage]
const everyDay = Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open: '09:00', close: '21:00' }]))
const listings = [
  makeListing({ id: 'hip', name: 'HipCityVeg', category: 'restaurant', hours: everyDay, t: 'Parve' }),
  makeListing({ id: 'shtetl', name: 'Shtetl', category: 'restaurant', hours: everyDay, t: 'Meat' }),
  makeListing({ id: 'hok', name: 'House of Kosher', category: 'grocery', hours: everyDay, isKosher: 'Kosher Store', m: ['Challah'] }),
  makeListing({ id: 'tj', name: 'Trader Joe’s', category: 'grocery', geo: { lat: 39.9545, lng: -75.1614 }, hours: everyDay, isKosher: 'Kosher Items', m: ['Challah', 'Wine', 'Chicken'] }),
  makeListing({ id: 'mekor', name: 'Mekor Habracha', category: 'synagogue' }),
]
const week = {
  hebrewDate: '2 Cheshvan 5787',
  dayOfWeek: 2,
  isFriday: false,
  isShabbos: false,
  parsha: 'Parashat Noach',
  dailyZmanim: [],
  shabbos: {
    candleLighting: { label: 'Friday', time: '6:01 PM', iso: '2026-10-16T18:01:00-04:00' },
    havdalah: { label: 'Saturday', time: '6:59 PM', iso: '2026-10-17T18:59:00-04:00' },
  },
} as unknown as ZmanimData

/** The clock as useMinyanSchedule gives it, at a fixed moment. Local time
 *  for the hours (the device's clock), the instant for the zmanim. */
function scheduleAt(nyIso: string): MinyanSchedule {
  const [h, m] = nyIso.slice(11, 16).split(':').map(Number)
  return { now: Date.parse(nyIso), nowMinutes: h * 60 + m, linkCategoryId: 'synagogue', shuls: [] } as unknown as MinyanSchedule
}

function show(nyIso: string | null, zmanim: ZmanimData | null, choice: readonly string[] | null = null, schedule?: Partial<MinyanSchedule>) {
  return renderWithProviders(
    <RightNow
      listings={listings}
      categories={categories}
      communitySlug="test-community"
      timezone={NY}
      schedule={nyIso ? { ...scheduleAt(nyIso), ...schedule } : null}
      zmanim={zmanim}
      from={{ lat: 39.9526, lng: -75.1652 }}
      items={['Challah', 'Wine', 'Chicken']}
      onOpenListing={vi.fn()}
      choice={choice}
    />,
    { content: { categories } },
  )
}

// /api/eruv: one eruv read from its site, one with only a hotline.
const eruvim = [
  { id: 'cc', name: 'Center City Eruv', hotline: null, statusUrl: 'https://example.org/', statusDated: false, status: 'up', statusWords: 'Up', statusPostedOn: null, statusCheckedAt: '2026-10-16T17:25:00Z', statusErrorAt: null, statusError: null },
  { id: 'ne', name: 'Northeast Eruv', hotline: '(215) 333-ERUV', statusUrl: null, statusDated: false, status: null, statusWords: null, statusPostedOn: null, statusCheckedAt: null, statusErrorAt: null, statusError: null },
]
beforeEach(() => {
  clearEruvStatuses()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, available: true, timezone: NY, candles: null, eruvim }))))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Right now', () => {
  // The hours are read off the device's clock (getOpenStatus); the tests
  // run with it at the same moment.
  const at = (nyIso: string) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(nyIso))
  }

  it('a weekday: what’s open in the first two categories with hours, each to its page with Open now on; no minyan', () => {
    at('2026-10-13T12:30:00-04:00')
    show('2026-10-13T12:30:00-04:00', week)
    const section = screen.getByTestId('right-now')
    expect(section).toHaveAttribute('data-moment', 'weekday')
    expect(screen.getByRole('heading', { name: /Right now/ })).toHaveTextContent(/^Right now · Tuesday$/)
    const rows = within(section).getAllByRole('link')
    expect(rows.map((r) => [r.textContent, r.getAttribute('href')])).toEqual([
      ['Food2 open now1 meat · 1 parve', '/test-community/restaurant?openNow=1'],
      ['Grocery2 open now3 kosher items tracked', '/test-community/grocery?openNow=1'],
    ])
    expect(section).not.toHaveTextContent(/minyan|Mincha|Candles/i)
  })

  // Board K1c (Nov 11): each row shows its category's picture, the same as
  // its tile below, not an icon ("It feels childish"); none when it has no
  // picture.
  it('a weekday row shows its category’s picture, never an icon or emoji', () => {
    at('2026-10-13T12:30:00-04:00')
    show('2026-10-13T12:30:00-04:00', week)
    const [foodRow, groceryRow] = within(screen.getByTestId('right-now')).getAllByRole('link')
    const img = foodRow!.querySelector('[data-testid="right-now-photo"] img')
    expect(decodeURIComponent(img?.getAttribute('src') ?? '')).toContain('category-band/food-pic')
    expect(groceryRow!.querySelector('[data-testid="right-now-photo"]')).toBeNull()
    // No drawing at all in either row: no icon, and no chevron (Nov 14:
    // the photo row is the button).
    expect(foodRow!.querySelectorAll('svg')).toHaveLength(0)
    expect(groceryRow!.querySelectorAll('svg')).toHaveLength(0)
    expect(screen.getByTestId('right-now')).not.toHaveTextContent(/🍽️|🛒/u)
  })

  // Board Q1 (Nov 14): a row is its picture, full width, the words white
  // over a dark fade; no picture, plain slate under the same white words.
  it('a weekday row is a photo row: the picture fills it, the words white on it', () => {
    at('2026-10-13T12:30:00-04:00')
    show('2026-10-13T12:30:00-04:00', week)
    const [foodRow, groceryRow] = within(screen.getByTestId('right-now')).getAllByRole('link')
    for (const row of [foodRow!, groceryRow!]) {
      expect(row).toHaveClass('h-[84px]', 'rounded-2xl', 'text-white', 'bg-slate-700')
    }
    expect(foodRow!.querySelector('[data-testid="right-now-photo"]')).toHaveClass('absolute', 'inset-0')
  })

  // Board V3 (the user, Nov 15): the card used to go overnight. Each row
  // says when its first place opens, and opens the category itself, since
  // Open now would be an empty list.
  it('late at night, with nothing open: each row says when the first place opens', () => {
    at('2026-10-13T23:30:00-04:00')
    show('2026-10-13T23:30:00-04:00', week)
    const rows = within(screen.getByTestId('right-now')).getAllByRole('link')
    expect(rows.map((r) => [r.textContent, r.getAttribute('href')])).toEqual([
      [expect.stringMatching(/^FoodOpens Wed \d+(:\d\d)? [AP]MNothing open now · first: HipCityVeg$/), '/test-community/restaurant'],
      [expect.stringMatching(/^GroceryOpens Wed \d+(:\d\d)? [AP]MNothing open now · first: House of Kosher$/), '/test-community/grocery'],
    ])
  })

  // Board V1/V2 (the user, Nov 15): an admin can choose what Right now
  // answers, say the next minyan and the eruv for a community where those
  // are what matter on a weekday.
  it('the admin’s choice: the next minyan, to that day’s davening times, and the eruv', async () => {
    at('2026-10-13T12:30:00-04:00')
    const minyanim = { shuls: [{ id: 'mekor', name: 'Mekor Habracha', minyanim: [{ id: 'm1', tefillah: 'mincha', days: ['tue'], time: '1:45pm' }] }], todayDayKeys: ['tue'], tomorrowDayKeys: ['wed'], tomorrowKey: 'wed', anchors: {}, season: null } as Partial<MinyanSchedule>
    show('2026-10-13T12:30:00-04:00', week, ['synagogue', 'eruv-information'], minyanim)
    const section = screen.getByTestId('right-now')
    await within(section).findByText('1 up')
    expect(within(section).getAllByTestId('right-now-row').map((r) => [r.textContent, r.getAttribute('href')])).toEqual([
      ['SynagoguesMincha 1:45 PMMekor Habracha', '/test-community/synagogue?davening=1'],
      ['Eruv Information1 up1 by phone', '/test-community/eruv'],
    ])
    expect(section).not.toHaveTextContent('open now')
  })

  it('the next minyan is tomorrow’s first: it says so, and opens tomorrow', () => {
    at('2026-10-13T22:30:00-04:00')
    const minyanim = { shuls: [{ id: 'mekor', name: 'Mekor Habracha', minyanim: [{ id: 'm1', tefillah: 'shacharis', days: ['wed'], time: '7:00am' }] }], todayDayKeys: ['tue'], tomorrowDayKeys: ['wed'], tomorrowKey: 'wed', anchors: {}, season: null } as Partial<MinyanSchedule>
    show('2026-10-13T22:30:00-04:00', week, ['synagogue'], minyanim)
    const [row] = within(screen.getByTestId('right-now')).getAllByTestId('right-now-row')
    expect(row).toHaveTextContent(/Shacharis 7 AMMekor Habracha · tomorrow$/)
    expect(row).toHaveAttribute('href', '/test-community/synagogue?davening=1&day=wed')
  })

  it('an admin who chose nothing gets nothing; a choice that’s gone is left out', () => {
    at('2026-10-13T12:30:00-04:00')
    show('2026-10-13T12:30:00-04:00', week, ['deleted', 'grocery'])
    expect(within(screen.getByTestId('right-now')).getAllByTestId('right-now-row').map((r) => r.textContent)).toEqual(['Grocery2 open now3 kosher items tracked'])
    cleanup()
    show('2026-10-13T12:30:00-04:00', week, [])
    expect(screen.queryByTestId('right-now')).not.toBeInTheDocument()
  })

  it('Friday afternoon: the candles card with the eruvim on it, and Shabbos shopping; nothing “open now”', async () => {
    at('2026-10-16T13:30:00-04:00')
    show('2026-10-16T13:30:00-04:00', { ...week, hebrewDate: '5 Cheshvan 5787', dayOfWeek: 5, isFriday: true } as ZmanimData)
    const section = screen.getByTestId('right-now')
    expect(section).toHaveAttribute('data-moment', 'erev')
    const card = screen.getByTestId('today-candles')
    expect(card).toHaveTextContent('Candles 6:01 PM')
    // The answer, in place of a button to it (the user, Oct 17).
    const eruv = await within(card).findByTestId('today-eruv')
    expect(eruv).toHaveTextContent('Eruvim1 up1 by phone')
    expect(eruv).toHaveAttribute('href', '/test-community/eruv')
    expect(within(card).getAllByRole('link').map((a) => a.textContent)).toEqual([eruv.textContent, 'Minyanim', 'Zmanim'])
    // Board U3f (Nov 14): Before candles is Shabbos shopping, a button per
    // item to the stores open now that have it.
    const shopping = screen.getByTestId('shabbos-shopping')
    expect(shopping).toHaveTextContent(/^Shabbos shopping2 stores openClosest 0\.2 mi/)
    expect(within(shopping).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Challah', '/test-community/grocery?openNow=1&has_m=Challah'],
      ['Wine', '/test-community/grocery?openNow=1&has_m=Wine'],
      ['Chicken', '/test-community/grocery?openNow=1&has_m=Chicken'],
    ])
    expect(screen.queryByTestId('today-before-candles')).not.toBeInTheDocument()
    expect(section).not.toHaveTextContent('open now')
  })

  it('Shabbos: the card alone, saying when it ends, with the eruvim; nothing to buy, nothing open', async () => {
    at('2026-10-17T11:00:00-04:00')
    show('2026-10-17T11:00:00-04:00', { ...week, hebrewDate: '6 Cheshvan 5787', dayOfWeek: 6, isShabbos: true } as ZmanimData)
    expect(await screen.findByTestId('today-eruv')).toHaveTextContent('Eruvim1 up1 by phone')
    expect(screen.getByTestId('right-now')).toHaveAttribute('data-moment', 'shabbos')
    expect(screen.getByTestId('today-candles')).toHaveTextContent('Havdalah 6:59 PM')
    expect(screen.queryByTestId('shabbos-shopping')).not.toBeInTheDocument()
    expect(screen.getByTestId('right-now')).not.toHaveTextContent('open now')
    expect(screen.getByRole('heading', { name: /Right now/ })).toHaveTextContent(/^Right now · Shabbos$/)
  })

  // The user, Nov 14: after havdalah it said "Shabbos" over what's open.
  it('Saturday night, after havdalah: what’s open, under “Saturday”', () => {
    at('2026-10-17T20:00:00-04:00')
    show('2026-10-17T20:00:00-04:00', { ...week, hebrewDate: '6 Cheshvan 5787', dayOfWeek: 6, isShabbos: true } as ZmanimData)
    expect(screen.getByTestId('right-now')).toHaveAttribute('data-moment', 'weekday')
    expect(screen.getByRole('heading', { name: /Right now/ })).toHaveTextContent(/^Right now · Saturday$/)
  })

  // Friday, an item no store open now lists: no button for it; none at
  // all, no card.
  it('Shabbos shopping leaves out an item no store has, and goes when none has any', () => {
    at('2026-10-16T13:30:00-04:00')
    const friday = { ...week, hebrewDate: '5 Cheshvan 5787', dayOfWeek: 5, isFriday: true } as ZmanimData
    renderWithProviders(
      <RightNow listings={listings} categories={categories} communitySlug="test-community" timezone={NY} schedule={scheduleAt('2026-10-16T13:30:00-04:00')} zmanim={friday} from={{ lat: 39.9526, lng: -75.1652 }} items={['Challah', 'Fish']} onOpenListing={vi.fn()} />,
      { content: { categories } },
    )
    expect(within(screen.getByTestId('shabbos-shopping')).getAllByRole('link').map((a) => a.textContent)).toEqual(['Challah'])
    cleanup()
    renderWithProviders(
      <RightNow listings={listings} categories={categories} communitySlug="test-community" timezone={NY} schedule={scheduleAt('2026-10-16T13:30:00-04:00')} zmanim={friday} from={{ lat: 39.9526, lng: -75.1652 }} items={['Fish']} onOpenListing={vi.fn()} />,
      { content: { categories } },
    )
    expect(screen.queryByTestId('shabbos-shopping')).not.toBeInTheDocument()
    expect(screen.getByTestId('today-candles')).toBeInTheDocument()
  })

  // Board U1 (Nov 14): on the computer, the same answers side by side.
  // The user, Nov 15: no Right now label on the computer home. Still the
  // section's name for a screen reader, so only hidden from sight.
  it('wide: no label to see, still named for a screen reader', () => {
    renderWithProviders(
      <RightNow wide listings={listings} categories={categories} communitySlug="test-community" timezone={NY} schedule={scheduleAt('2026-10-13T12:30:00-04:00')} zmanim={week} from={{ lat: 39.9526, lng: -75.1652 }} items={['Challah']} onOpenListing={vi.fn()} />,
    )
    const heading = screen.getByRole('heading', { name: /Right now/ })
    expect(heading).toHaveClass('sr-only')
    expect(screen.getByRole('region', { name: /Right now/ })).toBe(screen.getByTestId('right-now'))
  })

  it('on the phone the label shows', () => {
    renderWithProviders(
      <RightNow listings={listings} categories={categories} communitySlug="test-community" timezone={NY} schedule={scheduleAt('2026-10-13T12:30:00-04:00')} zmanim={week} from={{ lat: 39.9526, lng: -75.1652 }} items={['Challah']} onOpenListing={vi.fn()} />,
    )
    expect(screen.getByRole('heading', { name: /Right now/ })).not.toHaveClass('sr-only')
  })

  it('wide (the computer home): the two rows side by side, taller; Friday’s two cards side by side', () => {
    at('2026-10-13T12:30:00-04:00')
    renderWithProviders(
      <RightNow wide listings={listings} categories={categories} communitySlug="test-community" timezone={NY} schedule={scheduleAt('2026-10-13T12:30:00-04:00')} zmanim={week} from={{ lat: 39.9526, lng: -75.1652 }} items={['Challah']} onOpenListing={vi.fn()} />,
      { content: { categories } },
    )
    const list = within(screen.getByTestId('right-now')).getByRole('list')
    expect(list).toHaveClass('grid', 'grid-cols-2')
    for (const row of within(list).getAllByRole('link')) expect(row).toHaveClass('h-[132px]')
    cleanup()
    at('2026-10-16T13:30:00-04:00')
    renderWithProviders(
      <RightNow wide listings={listings} categories={categories} communitySlug="test-community" timezone={NY} schedule={scheduleAt('2026-10-16T13:30:00-04:00')} zmanim={{ ...week, dayOfWeek: 5, isFriday: true } as ZmanimData} from={{ lat: 39.9526, lng: -75.1652 }} items={['Challah']} onOpenListing={vi.fn()} />,
      { content: { categories } },
    )
    const pair = screen.getByTestId('today-candles').parentElement!
    expect(pair).toHaveClass('grid', 'grid-cols-2')
    expect(pair).toContainElement(screen.getByTestId('shabbos-shopping'))
  })

  // The tiles under it shouldn't jump down when the clock arrives.
  it('before the clock is known: a placeholder its size, not nothing', () => {
    const { container } = show(null, null)
    expect(screen.queryByTestId('right-now')).not.toBeInTheDocument()
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })
})
