import { describe, expect, it } from 'vitest'
import type { DirectoryResource } from '@/types'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { searchAsk } from './askSearch'
import { boxWords, categoryHref, hrefFilters, landSub, savedLand, searchLines, timesLine, withFilters, type LinesContext } from './searchLands'
import { itemCounts, listingHas } from './itemFilter'
import type { Eruv } from './eruv'

// ── Where Enter goes (canvas page "lands", Oct 13): one test per row of its
// table, then the pieces. Thursday 2 PM, when every store below is open.

const NOW = new Date('2026-10-15T14:00:00-04:00')
const allWeek = (open: string, close: string) => Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open, close }]))
const open = allWeek('08:00', '22:00')
const closed = allWeek('20:00', '22:00')

const grocery = makeCategory({
  id: 'grocery',
  label: 'Grocery',
  pluralLabel: 'Grocery',
  detailFields: [
    { key: 'hours', label: 'Hours', type: 'hours', filterable: true },
    { key: 'm', label: 'Kosher items', type: 'tags' },
  ],
})
const food = makeCategory({
  id: 'restaurant',
  label: 'Food',
  pluralLabel: 'Food',
  detailFields: [{ key: 't', label: 'Type', type: 'select', filterable: true, options: [{ value: 'Meat', label: 'Meat' }, { value: 'Dairy', label: 'Dairy' }] }],
})
const shuls = makeCategory({ id: 'synagogue', label: 'Synagogue', pluralLabel: 'Synagogues', detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] })
const zmanim = makeCategory({ id: 'prayer-shabbat-times', kind: 'zmanim', label: 'Zmanim', pluralLabel: 'Prayer & Shabbat Times' })
const eruv = makeCategory({ id: 'eruv-information', kind: 'eruv', label: 'Eruv', pluralLabel: 'Eruv' })
const categories = [grocery, food, shuls, zmanim, eruv]

const listings: DirectoryResource[] = [
  makeListing({ id: 'tj', category: 'grocery', name: 'Trader Joe’s', m: ['Challah', 'Wine'], hours: open }),
  makeListing({ id: 'ac', category: 'grocery', name: 'ACME Markets', m_sometimes: ['Challah'], hours: open }),
  makeListing({ id: 'mx', category: 'grocery', name: 'Maxx’s Produce', m: ['Apples'], hours: closed }),
  makeListing({ id: 'bk', category: 'restaurant', name: 'Challah Corner Bakery', t: 'Dairy' }),
  makeListing({ id: 'gr', category: 'restaurant', name: 'The Grill', t: 'Meat' }),
  makeListing({ id: 'sh', category: 'synagogue', name: 'Mekor Habracha' }),
]

function lines(q: string, more: Partial<LinesContext> = {}) {
  const options = { now: NOW }
  return searchLines(q, { slug: 'philly', categories, listings, result: searchAsk(listings, categories, q, options), options, ...more })
}
const brief = (q: string, more: Partial<LinesContext> = {}) => lines(q, more).map((l) => `${l.title} · ${l.sub} → ${l.href}`)

describe('searchLines — where Enter goes', () => {
  it('a place’s name: the place is the first line, and opens its listing (board 2b)', () => {
    const [first] = lines('maxx')
    expect(first).toMatchObject({ kind: 'listing', title: 'Maxx’s Produce', href: expect.stringMatching(/^\/philly\/grocery\/maxx-s-produce/) })
    // Not the same place again as "Grocery · 1 for “maxx”".
    expect(lines('maxx')).toHaveLength(1)
  })

  it('a kind of place with conditions: that page, the words in its box, the count it will show (board 3)', () => {
    expect(brief('grocery with challah open now')).toEqual(['Grocery · 2 open now with Challah → /philly/grocery?q=challah+open+now'])
  })

  it('something in more than one category: the one with the most first, the other a line (board 4)', () => {
    expect(brief('challah')).toEqual([
      'Grocery · 2 with Challah → /philly/grocery?q=challah',
      'Food · 1 for “challah” → /philly/restaurant?q=challah',
      'Challah Corner Bakery · Food → /philly/restaurant/challah-corner-bakery-bk',
    ])
  })

  it('a pick-list value said is that filter: "meat" on Food', () => {
    const page = searchAsk(listings, [food], 'meat', { categoryId: 'restaurant', now: NOW })
    expect(page.hits.map((h) => h.item.name)).toEqual(['The Grill'])
    expect(brief('meat restaurant')[0]).toBe('Food · 1 Meat → /philly/restaurant?q=meat')
  })

  it('a minyan: Minyanim by time, the words in its box, with the shuls after (board 5b)', () => {
    expect(brief('next mincha', { minyanSub: 'Mincha next at 2 PM · Mekor Habracha' })).toEqual([
      'Minyanim by time · Mincha next at 2 PM · Mekor Habracha → /philly/synagogue?davening=1&q=next%20mincha',
      'Synagogues · 1 listing → /philly/synagogue',
    ])
  })

  // "next mincha" in the evening is tomorrow's: the page opens on that
  // day, not on a today with none left (the user, Oct 13).
  it('a minyan whose next is tomorrow: Minyanim by time opens on tomorrow', () => {
    expect(brief('next mincha', { minyanSub: 'Mincha next at 2 PM tomorrow · Mekor Habracha', minyanDay: 'wed' })[0]).toBe(
      'Minyanim by time · Mincha next at 2 PM tomorrow · Mekor Habracha → /philly/synagogue?davening=1&day=wed&q=next%20mincha',
    )
  })

  it('a zman: the times page, that time picked out (board 6b)', () => {
    expect(brief('when is candle lighting', { timesSub: 'Candles Friday 6:01 PM' })).toEqual([
      'Prayer & Shabbat Times · Candles Friday 6:01 PM → /philly/zmanim?time=candles',
    ])
  })

  it('the eruv: its page', () => {
    expect(brief('is the eruv up')).toEqual(['Eruv · Each eruv’s status this week → /philly/eruv'])
  })

  // Oct 15: "is center city eruv up?" found nothing. An eruv named is that
  // eruv, with its status in the line; the eruv in general is the page, with
  // each eruv's status under it.
  describe('the eruvim, with their statuses', () => {
    const eruvRow = (id: string, name: string, more: Partial<Eruv> = {}): Eruv => ({
      id, name, covers: null, website: null, hotline: null, alertsUrl: null, statusUrl: `https://${id}.example/status`, statusDated: false,
      status: 'up', statusWords: 'The eruv is up', statusPostedOn: null, statusCheckedAt: '2026-10-15T17:55:00Z', statusErrorAt: null, statusError: null, ...more,
    })
    const eruvim = {
      timezone: 'America/New_York',
      candles: null,
      eruvim: [
        eruvRow('cc', 'Center City Eruv'),
        eruvRow('uc', 'University City Eruv', { status: 'down' }),
        eruvRow('ne', 'Northeast Eruv', { statusUrl: null, hotline: '(215) 555-0100' }),
      ],
    }

    it('one named: that eruv, its status and when it was checked, then the page', () => {
      expect(brief('is center city eruv up?', { eruvim })).toEqual([
        'Center City Eruv · Up · Checked 1:55 PM → /philly/eruv?item=cc',
        'Eruv · Each eruv’s status this week → /philly/eruv',
      ])
      expect(lines('is center city eruv up?', { eruvim })[0]).toMatchObject({ kind: 'eruv', eruvId: 'cc', tone: 'green', categoryId: 'eruv-information' })
      expect(lines('is university city eruv up', { eruvim })[0]).toMatchObject({ sub: 'Down · Checked 1:55 PM', tone: 'red' })
      expect(lines('northeast eruv', { eruvim })[0]).toMatchObject({ sub: 'No status online · Hotline (215) 555-0100', tone: 'grey' })
    })

    it('while it’s typed', () => {
      expect(lines('center city er', { eruvim })[0]).toMatchObject({ eruvId: 'cc' })
      expect(lines('center city', { eruvim }).some((l) => l.eruvId)).toBe(false)
    })

    it('the eruv in general: the page, then each eruv’s status', () => {
      expect(brief('is the eruv up', { eruvim })).toEqual([
        'Eruv · Each eruv’s status this week → /philly/eruv',
        'Center City Eruv · Up · Checked 1:55 PM → /philly/eruv?item=cc',
        'University City Eruv · Down · Checked 1:55 PM → /philly/eruv?item=uc',
        'Northeast Eruv · No status online · Hotline (215) 555-0100 → /philly/eruv?item=ne',
      ])
    })

    it('"eruv" with other words: the Eruv page is still one of the lines', () => {
      const found = brief('challah eruv')
      expect(found.length).toBeGreaterThan(1)
      expect(found.at(-1)).toBe('Eruv · Each eruv’s status this week → /philly/eruv')
      expect(brief('store carrying challah').some((l) => l.startsWith('Eruv'))).toBe(false)
    })
  })

  it('the guide itself: "how do I add" opens + Add, or the Add form of the kind named; anything else is About', () => {
    expect(lines('how do I add a listing')).toEqual([expect.objectContaining({ kind: 'add', href: null })])
    expect(lines('how do I add a restaurant')[0]).toMatchObject({ kind: 'add', href: '/philly/restaurant?form=create' })
    expect(lines('what is this site')[0]).toMatchObject({ kind: 'about', href: '/philly/about' })
  })

  it('nothing anywhere: no lines, so Enter stays on home and says so (board 7)', () => {
    expect(lines('poke bowl')).toEqual([])
  })

  it('a question the reader read: its categories, its filters in the address, read=1', () => {
    const reading = { categories: [{ id: 'restaurant', select: { t: ['Meat'] } }] }
    expect(brief('somewhere fleishig for dinner', { reading })).toEqual([
      'Food · 1 Meat → /philly/restaurant?q=somewhere+fleishig+for+dinner&sel_t=Meat&read=1',
    ])
  })

  it('a reading of items: Has, under the names the listings use', () => {
    const reading = { categories: [{ id: 'grocery', openNow: true }], items: ['challos'] }
    expect(brief('bread for shabbos that’s open', { reading })[0]).toBe(
      'Grocery · 2 open now with Challah → /philly/grocery?q=bread+for+shabbos+that%E2%80%99s+open&openNow=1&has_m=Challah&read=1',
    )
  })
})

describe('boxWords — what stays in the page’s box', () => {
  it('drops the words naming the page and the filler around them, keeps what the page reads', () => {
    expect(boxWords('grocery with challah open now', ['grocery'])).toBe('challah open now')
    expect(boxWords('where can I buy cholov yisroel milk?')).toBe('cholov yisroel milk')
    expect(boxWords('kosher food', ['food'])).toBe('')
    expect(boxWords('food in rittenhouse', ['food'])).toBe('in rittenhouse')
    expect(boxWords('pizza near me')).toBe('pizza near me')
  })
})

describe('Has — items as a filter', () => {
  it('counts each item across a category, always or sometimes, most first', () => {
    expect(itemCounts(listings.filter((l) => l.category === 'grocery'), 'm')).toEqual([
      { tag: 'Challah', count: 2 },
      { tag: 'Apples', count: 1 },
      { tag: 'Wine', count: 1 },
    ])
  })

  it('one item whatever its capitals, under the first store’s spelling', () => {
    const stores = [{ ...listings[1], m: ['Pinot'], m_sometimes: [] }, { ...listings[1], id: 'x', m: ['pinot'], m_sometimes: [] }] as typeof listings
    expect(itemCounts(stores, 'm')).toEqual([{ tag: 'Pinot', count: 2 }])
  })

  it('a listing has an item always or sometimes, by the name the guide uses for it', () => {
    expect(listingHas(listings[1], 'm', ['Challah'])).toBe(true)
    expect(listingHas(listings[1], 'm', ['challos'])).toBe(true)
    expect(listingHas(listings[1], 'm', ['Wine'])).toBe(false)
  })

  it('the filters a page shows with nothing typed: what a line’s count promises', () => {
    const shown = withFilters(listings, grocery, { openNow: true, bool: [], select: {}, has: { m: ['Challah'] } }, NOW)
    expect(shown.map((l) => l.name)).toEqual(['Trader Joe’s', 'ACME Markets'])
  })
})

describe('timesLine', () => {
  const z = {
    hebrewDate: '', dayOfWeek: 2, isFriday: false, isShabbos: false,
    dailyZmanim: [{ label: 'Sunset', time: '6:24 PM' }],
    shabbos: { candleLighting: { label: 'Friday', time: '6:01 PM' }, havdalah: { label: 'Saturday', time: '6:59 PM' } },
  }
  it('says the time asked for, or both for Shabbos', () => {
    expect(timesLine('candles', z)).toBe('Candles Friday 6:01 PM')
    expect(timesLine('shabbos', z)).toBe('Candles Friday 6:01 PM · Havdalah Saturday 6:59 PM')
    expect(timesLine('Sunset', z)).toBe('Sunset today 6:24 PM')
    expect(timesLine('candles', null)).toBeNull()
  })
})

// You (Oct 14): a saved search with Filters beyond its words says what its
// page would show, in the home line's words.
describe('savedLand — a saved search with its own Filters', () => {
  const options = { now: NOW, slug: 'philly' }

  it('reads an address back into its words and Filters', () => {
    const href = categoryHref('philly', 'restaurant', 'grill', { openNow: true, bool: ['kids'], select: { t: ['Meat'] }, has: {} }, false)
    expect(hrefFilters(href)).toEqual({ words: 'grill', filters: { openNow: true, bool: ['kids'], select: { t: ['Meat'] }, has: {} }, read: false })
  })

  it('the words’ own Filters and the chosen ones together: "challah" with Wine is one store', () => {
    const land = savedLand(listings, categories, grocery, '/philly/grocery?q=challah&has_m=Wine', options)
    expect(land.count).toBe(1)
    expect(landSub(land)).toBe('1 with Challah and Wine')
  })

  it('a Filter with no words: the whole page, narrowed', () => {
    expect(landSub(savedLand(listings, categories, food, '/philly/restaurant?sel_t=Dairy', options))).toBe('1 Dairy')
  })

  it('read by the AI reader: its Filters are all of it, the words aren’t searched again', () => {
    const land = savedLand(listings, categories, grocery, '/philly/grocery?q=something+for+kiddush&has_m=Wine&read=1', options)
    expect(land.count).toBe(1)
    expect(landSub(land)).toBe('1 with Wine')
  })
})
