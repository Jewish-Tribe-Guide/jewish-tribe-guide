import { describe, expect, it } from 'vitest'
import type { DirectoryResource } from '@/types'
import { makeCategory } from '@/test/providerFixtures'
import { answerFor } from './askAnswer'
import { readerPlaces, type Reading } from './questionReader'
import { ownConditions, readingAnswers, readingChips, readingLoses, readingOffers, searchReading, type Asked } from './readingSearch'

const allWeek = (open: string, close: string) => Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open, close }]))
const hours = { key: 'hours', label: 'Hours', type: 'hours' as const, filterable: true }
const food = makeCategory({
  id: 'restaurant',
  label: 'Food',
  pluralLabel: 'Food',
  detailFields: [hours, { key: 't', label: 'Food Type', type: 'select', filterable: true }, { key: 'kind', label: 'Type', type: 'select', filterable: true }],
})
const grocery = makeCategory({ id: 'grocery', label: 'Grocery', pluralLabel: 'Grocery', detailFields: [hours, { key: 'm', label: 'Kosher items', type: 'tags' }] })
const hotels = makeCategory({ id: 'hotel', label: 'Hotel', pluralLabel: 'Hotels', detailFields: [{ key: 'shabbatFriendly', label: 'Shabbat friendly', type: 'boolean', filterable: true }] })
const shuls = makeCategory({ id: 'synagogue', label: 'Synagogue', pluralLabel: 'Synagogues', detailFields: [] })
const categories = [food, grocery, hotels, shuls]

const place = (category: string, name: string, lat: number, lng: number, details: Record<string, unknown> = {}): DirectoryResource => ({
  id: name,
  category,
  name,
  anchorId: 'community',
  distance: 0,
  address: '',
  geo: { lat, lng },
  ...details,
})
const lateGrill = place('restaurant', 'Late Grill', 39.95, -75.17, { t: ['Meat'], hours: allWeek('11:00', '23:30') })
const lunchGrill = place('restaurant', 'Lunch Grill', 39.951, -75.171, { t: ['Meat'], hours: allWeek('11:00', '15:00') })
const dairy = place('restaurant', 'Dairy Cafe', 39.95, -75.17, { t: ['Dairy'], hours: allWeek('07:00', '23:00') })
const shoprite = place('grocery', 'ShopRite Cherry Hill', 39.93, -75.03, { m: ['Chalav Yisroel Milk', 'Challah'] })
const giant = place('grocery', 'GIANT', 39.95, -75.17, { m: ['Challah'], m_sometimes: ['Chalav Yisroel Milk'] })
const sheraton = place('hotel', 'Sheraton', 39.955, -75.165, { shabbatFriendly: true })
const motel = place('hotel', 'Motel', 39.955, -75.165)
const shul = place('synagogue', 'Mekor', 39.95, -75.17)
const hup = place('hospital', 'Hospital of the University of Pennsylvania', 39.9496, -75.1936)
const listings = [lateGrill, lunchGrill, dairy, shoprite, giant, sheraton, motel, shul, hup]
const places = readerPlaces(listings, 'philly')
const sixPm = new Date(2026, 8, 24, 18, 0)
const me = { lat: 39.95, lng: -75.17 }
const asked = (reading: Reading, question = 'q'): Asked => ({ reading, own: ownConditions(question) })
const ask = (reading: Reading, question = 'q', opts: { categoryId?: string; coords?: typeof me | null; now?: Date } = {}) =>
  searchReading(listings, categories, asked(reading, question), question, {
    now: opts.now ?? sixPm,
    places,
    coords: opts.coords === undefined ? me : opts.coords,
    categoryId: opts.categoryId,
  })
const names = (r: ReturnType<typeof ask>) => r.hits.map((h) => h.item.name)

describe('searchReading — the listings answer what the reader read', () => {
  it('the user’s own question: meat open now, every synagogue, the Shabbat-friendly hotels', () => {
    const r = ask({
      categories: [{ id: 'restaurant', openNow: true, select: { t: ['Meat'] } }, { id: 'synagogue' }, { id: 'hotel', bool: ['shabbatFriendly'] }],
    })
    expect(names(r).sort()).toEqual(['Late Grill', 'Mekor', 'Sheraton'])
    // The lunch place is meat but closed at six: counted, not listed.
    expect(r.closedCount).toBe(1)
    // Not "3 places open now": the shul and the hotel weren't asked about
    // as open, and keep no hours.
    expect(r.query.openNow).toBe(false)
    // …but the meat place, asked about as open, still says its hours.
    expect(r.openNowIn).toEqual(['restaurant'])
    expect(answerFor(r, { coords: me })?.text ?? '').not.toMatch(/open now/)
  })

  it('open now for the whole question is what the answer sentence says', () => {
    const r = ask({ categories: [{ id: 'restaurant', openNow: true }] }, 'whats open for dinner')
    expect(names(r)).toEqual(['Dairy Cafe', 'Late Grill'].sort((a, b) => a.localeCompare(b)))
    expect(answerFor(r, { coords: me })?.text).toMatch(/^2 food places open now\. Nearest: /)
  })

  it('items: the places listing them, in the listings’ own words, sometimes-in-stock said', () => {
    const r = ask({ categories: [{ id: 'grocery' }], items: ['Chalav Yisroel Milk'] }, 'where can i get cholov yisroel milk')
    expect(names(r)).toEqual(['GIANT', 'ShopRite Cherry Hill'])
    expect(r.hits[0].matched).toEqual([{ tag: 'Chalav Yisroel Milk', sometimes: true }])
    expect(answerFor(r, { coords: me })?.text).toMatch(/^2 places have Chalav Yisroel Milk \(1 only sometimes\)\. Nearest: GIANT/)
  })

  it('"near HUP" is measured from HUP, grown to the nearest that answers, and the answer says from where', () => {
    const r = ask({ categories: [{ id: 'grocery' }], items: ['Chalav Yisroel Milk'], near: 'hup' }, 'cy milk near hup', { coords: null })
    expect(r.reach).toMatchObject({ label: 'HUP', miles: 1.5 })
    expect(names(r)).toEqual(['GIANT'])
    expect(answerFor(r)?.text).toMatch(/^GIANT has Chalav Yisroel Milk \(only sometimes in stock\), 1\.\d mi from HUP\./)
  })

  it('a category page answers only its own part, and names no other', () => {
    const r = ask({ categories: [{ id: 'restaurant', select: { t: ['Dairy'] } }, { id: 'hotel' }] }, 'dairy', { categoryId: 'restaurant' })
    expect(names(r)).toEqual(['Dairy Cafe'])
    expect(r.categoryIds).toEqual(['restaurant'])
  })

  it('an empty reading answers nothing, and says so, so the site’s own search does', () => {
    expect(readingAnswers({ categories: [] })).toBe(false)
    expect(readingAnswers({ categories: [{ id: 'hotel' }] }, 'restaurant')).toBe(false)
    expect(readingAnswers({ categories: [], items: ['Challah'] })).toBe(true)
    expect(names(ask({ categories: [] }))).toEqual([])
  })
})

describe('our own parser keeps what it’s sure of, whatever the reading says', () => {
  // The question that found this (Sep 30): the reader can't say "until
  // 10", so it left it out, and the page listed every meat restaurant.
  const question = 'can you show me meat restaurants that are open until 10pm or later'
  const meat: Reading = { categories: [{ id: 'restaurant', select: { t: ['Meat'] } }] }

  it('"open until 10pm or later": only the meat place still open at ten', () => {
    const r = ask(meat, question)
    expect(names(r)).toEqual(['Late Grill'])
    expect(r.query.openAt).toEqual({ how: 'until', minutes: 22 * 60 })
    expect(readingChips(asked(meat, question), categories, { reach: null }).map((c) => c.label)).toEqual(['Food', 'Meat', 'Open until 10:00 PM'])
  })

  it('"open now" the reading didn’t carry is kept, for every kind of place that keeps hours', () => {
    expect(names(ask(meat, 'meat places open now'))).toEqual(['Late Grill'])
    expect(readingChips(asked(meat, 'meat places open now'), categories, { reach: null }).map((c) => c.label)).toContain('Open now')
  })

  it('but where the reading said now of some kinds and not others, the reading’s is kept', () => {
    const r = ask({ categories: [{ id: 'restaurant', openNow: true }, { id: 'synagogue' }] }, 'food open now and all the shuls regardless')
    expect(names(r).sort()).toEqual(['Dairy Cafe', 'Late Grill', 'Mekor'])
  })

  it('"other than GIANT" and "best"', () => {
    const r = ask({ categories: [], items: ['Challah'] }, 'best challah other than giant')
    expect(names(r)).toEqual(['ShopRite Cherry Hill'])
    expect(r.excluded).toEqual(['GIANT'])
    expect(readingChips(asked({ categories: [], items: ['Challah'] }, 'best challah other than giant'), categories, { reach: null, excluded: r.excluded }).map((c) => c.label)).toEqual([
      'Challah',
      'Most upvoted first',
      'Besides GIANT',
    ])
  })

  it('removing the time chip removes our parser’s time, and the reading stays', () => {
    const chip = readingChips(asked(meat, question), categories, { reach: null }).find((c) => c.key === 'when')!
    expect(chip.without.own.openAt).toBeNull()
    expect(chip.without.reading).toEqual(meat)
    const r = searchReading(listings, categories, chip.without, question, { now: sixPm, places, coords: me })
    expect(names(r)).toEqual(['Late Grill', 'Lunch Grill'])
  })

  it('a reading that lost the kind of place our parser is sure was named isn’t used', () => {
    expect(readingLoses('shul near hup', { categories: [{ id: 'restaurant' }] }, categories)).toBe(true)
    expect(readingLoses('shul near hup', { categories: [{ id: 'synagogue' }] }, categories)).toBe(false)
    expect(readingLoses('challah at a bakery', { categories: [], items: ['Challah'] }, categories)).toBe(false)
    // Our parser hears food in "eat": read as hotels, that's a disagreement.
    expect(readingLoses('somewhere to eat', { categories: [{ id: 'hotel' }] }, categories)).toBe(true)
    // With no kind of place our parser is sure of, the reading decides.
    expect(readingLoses('somewhere good please', { categories: [{ id: 'hotel' }] }, categories)).toBe(false)
  })
})

describe('readingChips — how it was read, each removable', () => {
  const reading: Reading = { categories: [{ id: 'restaurant', openNow: true, select: { t: ['Meat'] } }, { id: 'hotel', bool: ['shabbatFriendly'] }], items: ['Challah'] }
  const chips = readingChips(asked(reading), categories, { reach: null })

  it('each category, each filter named with its category when there are several, each item', () => {
    expect(chips.map((c) => c.label)).toEqual(['Food', 'Food: Open now', 'Food: Meat', 'Hotels', 'Hotels: Shabbat friendly', 'Challah'])
  })

  it('removing one leaves the rest of the reading', () => {
    const meat = chips.find((c) => c.label === 'Food: Meat')!
    expect(meat.without.reading.categories[0]).toEqual({ id: 'restaurant', openNow: true })
    expect(meat.without.reading.categories[1]).toEqual(reading.categories[1])
    expect(chips.find((c) => c.label === 'Hotels')!.without.reading.categories.map((c) => c.id)).toEqual(['restaurant'])
    expect(chips.find((c) => c.label === 'Challah')!.without.reading.items).toEqual([])
  })

  it('on a category page, not its own category, and filters without the name', () => {
    expect(readingChips(asked(reading), categories, { reach: null, categoryId: 'restaurant' }).map((c) => c.label)).toEqual(['Open now', 'Meat', 'Challah'])
  })

  it('how far, as measured', () => {
    const r = ask({ categories: [{ id: 'grocery' }], items: ['Chalav Yisroel Milk'], near: 'hup' }, 'q', { coords: null })
    expect(readingChips(asked({ categories: [], near: 'hup' }), categories, { reach: r.reach }).map((c) => c.label)).toEqual(['Within 1.5 mi of HUP'])
  })
})

describe('readingOffers — ask, don’t answer wrongly', () => {
  // One sit-down meat restaurant among the takeout.
  const steakHouse = place('restaurant', 'Steak House', 39.96, -75.16, { t: ['Meat'], kind: ['Restaurant'], hours: allWeek('17:00', '23:00') })
  const more = [...listings, steakHouse]
  const offersFor = (a: Asked, question: string) => {
    const r = searchReading(more, categories, a, question, { now: sixPm, places, coords: me })
    const chips = readingChips(a, categories, { reach: r.reach, excluded: r.excluded })
    return { r, offers: readingOffers(a, more, categories, question, { now: sixPm, places, coords: me, found: r.hits.length + r.noHours.length, chips }) }
  }

  it('"restaurants" read loosely: every meat place, with "Only Restaurant" offered, not applied', () => {
    const question = 'meat restaurants open until 10pm'
    const a = asked({ categories: [{ id: 'restaurant', select: { t: ['Meat'] } }], maybe: [{ id: 'restaurant', select: { kind: ['Restaurant'] } }] }, question)
    const { r, offers } = offersFor(a, question)
    expect(names(r)).toEqual(['Late Grill', 'Steak House'])
    expect(offers.map((o) => `${o.label} (${o.count})`)).toEqual(['Only Restaurant (1)'])
    const narrowed = searchReading(more, categories, offers[0].next, question, { now: sixPm, places, coords: me })
    expect(names(narrowed)).toEqual(['Steak House'])
  })

  it('an unsure filter that would find nothing isn’t offered', () => {
    const question = 'dairy restaurants'
    const a = asked({ categories: [{ id: 'restaurant', select: { t: ['Dairy'] } }], maybe: [{ id: 'restaurant', select: { kind: ['Restaurant'] } }] }, question)
    expect(offersFor(a, question).offers).toEqual([])
  })

  it('found nothing: the one chip without which it finds something, the smallest step', () => {
    const question = 'dairy restaurants'
    const a = asked({ categories: [{ id: 'restaurant', select: { t: ['Dairy'], kind: ['Restaurant'] } }] }, question)
    const { r, offers } = offersFor(a, question)
    expect(r.hits).toEqual([])
    // Without Dairy finds the one Restaurant; without Restaurant, the one
    // dairy place; without Food, nothing. Either single step is offered.
    expect(offers).toHaveLength(1)
    expect(offers[0].label).toMatch(/^Without (Dairy|Restaurant)$/)
    expect(offers[0].count).toBe(1)
  })

  it('found nothing there: "Anywhere", not "Without In Fishtown"', () => {
    const question = 'sit-down restaurant in fishtown'
    const a = asked({ categories: [{ id: 'restaurant', select: { kind: ['Restaurant'] } }], near: 'fishtown' }, question)
    const { r, offers } = offersFor(a, question)
    expect(r.hits).toEqual([])
    expect(offers.map((o) => o.label)).toEqual(['Anywhere'])
  })

  it('something found and nothing unsure: nothing offered', () => {
    const question = 'meat places'
    expect(offersFor(asked({ categories: [{ id: 'restaurant', select: { t: ['Meat'] } }] }, question), question).offers).toEqual([])
  })
})
