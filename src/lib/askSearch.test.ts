import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import type { DirectoryResource } from '@/types'
import { searchAsk } from './askSearch'

// Shaped on real Philly listings: the fields, tags and spellings are the ones
// the guide actually has, so a phrasing that works here works on the site.
const grocery = makeCategory({
  id: 'grocery',
  label: 'Grocery Store',
  pluralLabel: 'Grocery Stores',
  detailFields: [{ key: 'm', label: 'Kosher items', type: 'tags' }],
})
const restaurant = makeCategory({
  id: 'restaurant',
  label: 'Food Establishment',
  pluralLabel: 'Food Establishments',
  detailFields: [
    { key: 't', label: 'Meat, dairy or parve', type: 'tags' },
    { key: 'kosherCert', label: 'Hechsher', type: 'text' },
    {
      key: 'hours',
      label: 'Hours',
      type: 'hours',
    },
  ],
})
const synagogue = makeCategory({
  id: 'synagogue',
  label: 'Synagogue',
  pluralLabel: 'Synagogues',
  detailFields: [{ key: 'denomination', label: 'Denomination', type: 'text' }],
})
const hotel = makeCategory({
  id: 'hotel',
  label: 'Hotel',
  pluralLabel: 'Hotels',
  detailFields: [{ key: 'shabbatFriendly', label: 'Shabbat Friendly', type: 'boolean' }],
})
const hospital = makeCategory({ id: 'hospital', label: 'Hospital', pluralLabel: 'Hospitals' })
const categories = [grocery, restaurant, synagogue, hotel, hospital]

function listing(category: string, name: string, lat: number, lng: number, details: Record<string, unknown> = {}): DirectoryResource {
  return { id: name, category, name, anchorId: 'community', distance: 0, address: '', geo: { lat, lng }, ...details }
}

const shoprite = listing('grocery', 'ShopRite of Garden State Pavilion', 39.93, -75.03, {
  m: ['Prepared Shabbos Food', 'Pas Yisroel Bread', 'Chalav Yisroel Milk', 'Glatt Kosher Meat', 'Challah', 'Wine'],
})
const giantBroad = listing('grocery', 'GIANT', 39.938, -75.167, { m: ['Cheese Sticks', 'Wine'], m_sometimes: ['Challah'] })
const traderJoes = listing('grocery', "Trader Joe's", 39.955, -75.16, { m: ['Challah', 'Wine', 'Chicken'] })
const aldi = listing('grocery', 'ALDI', 39.939, -75.178, { m: ['Brie', 'Goat Cheese'] })
const chalavita = listing('restaurant', 'Chalavita', 39.95, -75.17, { t: ['Dairy'], kosherCert: 'Keystone-K' })
const insomnia = listing('restaurant', 'Insomnia Cookies', 39.952, -75.193, { t: ['Dairy'], kosherCert: 'Keystone-K' })
const cherryGrill = listing('restaurant', 'Cherry Grill', 39.9, -75.0, { t: ['Meat'], kosherCert: 'Keystone-K' })
const mekor = listing('synagogue', 'Mekor Habracha', 39.9494, -75.1661, { denomination: 'Orthodox (Ashkenazi)' })
const shtiebel = listing('synagogue', 'South Philadelphia Shtiebel', 39.933, -75.162, { denomination: 'Orthodox (Ashkenazi)' })
const cambria = listing('hotel', 'Cambria Hotel', 39.948, -75.164, { shabbatFriendly: true })
const sheraton = listing('hotel', 'Sheraton Philadelphia Downtown', 39.957, -75.167, { shabbatFriendly: false })
const hup = listing('hospital', 'Hospital of the University of Pennsylvania', 39.9496, -75.1936)

const listings = [shoprite, giantBroad, traderJoes, aldi, chalavita, insomnia, cherryGrill, mekor, shtiebel, cambria, sheraton, hup]
const names = (input: string, opts = {}) => searchAsk(listings, categories, input, opts).hits.map((h) => h.item.name)

describe('searchAsk — the questions people actually typed', () => {
  it.each([
    ['cholov yisroel milk'],
    ['chalav yisroel milk'],
    ['where can I buy cholov yisroel milk'],
    ['Where can I get chalav yisrael milk in center city?'],
    ['CY milk'],
    ['cholov yisroel'],
  ])('finds the one store with Chalav Yisroel milk: %s', (input) => {
    expect(names(input)[0]).toBe('ShopRite of Garden State Pavilion')
  })

  it('does not count a store for one word of a three-word item', () => {
    // Chalavita's name starts with "chalav", but it has no milk for sale.
    expect(names('cholov yisroel milk')).not.toContain('Chalavita')
  })

  it('finds every store with challah, however it is spelled', () => {
    for (const input of ['challah', 'chala', 'where can i get challah', 'chalah']) {
      expect(names(input).sort(), input).toEqual(['GIANT', 'ShopRite of Garden State Pavilion', "Trader Joe's"])
    }
  })

  it('finds wine without being told it has to be kosher', () => {
    expect(names('kosher wine').sort()).toEqual(['GIANT', 'ShopRite of Garden State Pavilion', "Trader Joe's"])
  })

  it('answers "kosher food" with the food places, not with nothing', () => {
    expect(names('kosher food').sort()).toEqual(['Chalavita', 'Cherry Grill', 'Insomnia Cookies'])
    expect(names('where can i eat').sort()).toEqual(['Chalavita', 'Cherry Grill', 'Insomnia Cookies'])
  })

  it('reads "food near HUP" as food, nearest the hospital first', () => {
    const result = searchAsk(listings, categories, 'kosher food near HUP')
    expect(result.anchor?.name).toBe('Hospital of the University of Pennsylvania')
    expect(result.hits.map((h) => h.item.name)[0]).toBe('Insomnia Cookies')
    expect(result.hits.every((h) => h.category.id === 'restaurant')).toBe(true)
    expect(result.hits[0].miles).toBeLessThan(0.5)
  })

  it('reads "shul near me" as every shul, nearest the visitor first', () => {
    const southPhilly = { lat: 39.932, lng: -75.163 }
    expect(names('shul near me', { coords: southPhilly })).toEqual(['South Philadelphia Shtiebel', 'Mekor Habracha'])
    expect(names('where can i daven', { coords: southPhilly })).toEqual(['South Philadelphia Shtiebel', 'Mekor Habracha'])
  })

  it('finds a kind of food within the food places', () => {
    expect(names('meat restaurant')).toEqual(['Cherry Grill'])
    expect(names('dairy restaurant').sort()).toEqual(['Chalavita', 'Insomnia Cookies'])
  })

  it('finds a hotel by a yes/no field it has switched on', () => {
    expect(names('shabbos friendly hotel')).toEqual(['Cambria Hotel'])
  })

  it('finds a place by the initials people call it', () => {
    expect(names('HUP')).toEqual(['Hospital of the University of Pennsylvania'])
  })

  it('shows results while a word is still being typed', () => {
    expect(names('chal')).toContain('ShopRite of Garden State Pavilion')
    expect(names('trader jo')).toEqual(["Trader Joe's"])
  })

  it('never loses results to a word that is still being typed', () => {
    // "th" on its way to "the": not yet a filler word, and not in any listing.
    expect(names('challah th').sort()).toEqual(['GIANT', 'ShopRite of Garden State Pavilion', "Trader Joe's"])
    // Once a space ends it, it is a word like any other.
    expect(names('challah zq ')).toEqual([])
  })

  it('survives a typo in a longer word', () => {
    expect(names('chllah').sort()).toEqual(['GIANT', 'ShopRite of Garden State Pavilion', "Trader Joe's"])
  })

  it('reports which of a listing’s items matched', () => {
    const [hit] = searchAsk(listings, categories, 'cholov yisroel milk').hits
    expect(hit.matchedTags[0]).toBe('Chalav Yisroel Milk')
  })

  it('marks an item that is only sometimes in stock', () => {
    const hits = searchAsk(listings, categories, 'challah').hits
    // GIANT lists challah as a "sometimes" item; ShopRite always has it.
    expect(hits.find((h) => h.item.name === 'GIANT')?.matched).toEqual([{ tag: 'Challah', sometimes: true }])
    expect(hits.find((h) => h.item.name.startsWith('ShopRite'))?.matched).toEqual([{ tag: 'Challah', sometimes: false }])
  })
})

describe('searchAsk — ranking', () => {
  const near = { lat: 39.9496, lng: -75.1718 }
  const farMeatMarket = listing('restaurant', "Shlomo's Kosher Meat & Fish Market", 41.2, -75.9, { t: [] })
  const grantAveRitas = { ...listing('restaurant', "Rita's", 40.08, -75.03, { t: ['Dairy'] }), address: '1709 Grant Ave' }
  const more = [...listings, farMeatMarket, grantAveRitas]

  it('puts the nearest match first, not the one with the word in its name', () => {
    const hits = searchAsk(more, categories, 'meat restaurant', { coords: near }).hits.map((h) => h.item.name)
    expect(hits[0]).toBe('Cherry Grill')
    expect(hits).toContain("Shlomo's Kosher Meat & Fish Market")
  })

  it('forgives a typo in a name or an item, never in a street name', () => {
    // "Grant" is one letter from "giant".
    expect(searchAsk(more, categories, 'giant').hits.map((h) => h.item.name)).toEqual(['GIANT'])
  })
})

describe('searchAsk — "open now"', () => {
  const allWeek = (open: string, close: string) =>
    Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open, close }]))
  const lateGrill = listing('restaurant', 'Late Night Grill', 39.95, -75.17, { t: ['Meat'], hours: allWeek('11:00', '23:30') })
  const lunchGrill = listing('restaurant', 'Lunch Grill', 39.95, -75.17, { t: ['Meat'], hours: allWeek('11:00', '15:00') })
  // "Meat Grill" in its name, so it matches better than either of the others.
  const meatGrill = listing('restaurant', 'Meat Grill', 39.95, -75.17, { t: ['Meat'], hours: allWeek('11:00', '15:00') })
  const places = [lateGrill, lunchGrill, meatGrill]
  const tenPmThursday = new Date(2026, 8, 24, 22, 0)

  it('lists only places open right now, however well a closed one matches', () => {
    // Reported live: "which meat restaurants are open now" listed closed ones.
    const result = searchAsk(places, categories, 'which meat restaurants are open now', { now: tenPmThursday })
    expect(result.hits.map((h) => h.item.name)).toEqual(['Late Night Grill'])
    expect(result.closedCount).toBe(2)
  })

  it('says how many matched but are closed when none is open', () => {
    const result = searchAsk([lunchGrill, meatGrill], categories, 'meat open now', { now: tenPmThursday })
    expect(result.hits).toEqual([])
    expect(result.closedCount).toBe(2)
  })
})

describe('searchAsk — "open today", and hours nobody has entered', () => {
  const mikvah = makeCategory({
    id: 'mikvah',
    label: 'Mikvah',
    pluralLabel: 'Mikvaot',
    detailFields: [
      { key: 'hours', label: 'Hours', type: 'hours' },
      { key: 'women_s_hours', label: 'Women’s Hours', type: 'hours' },
      { key: 'men_s_hours', label: "Men's Hours", type: 'hours' },
    ],
  })
  const allWeek = (open: string, close: string) =>
    Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open, close }]))
  const noDays = Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, null]))
  // Lower Merion's real shape: men's in the early morning, women's at night.
  const both = listing('mikvah', 'Both Mikvah', 39.95, -75.17, {
    men_s_hours: allWeek('04:30', '10:00'),
    women_s_hours: allWeek('20:00', '22:00'),
  })
  const womenOnly = listing('mikvah', 'Women Mikvah', 39.96, -75.17, { women_s_hours: allWeek('20:00', '22:00') })
  // Two of Philly's four: no hours field at all, and one saved with every day empty.
  const none = listing('mikvah', 'No Hours Mikvah', 39.951, -75.17)
  const empty = listing('mikvah', 'Empty Hours Mikvah', 39.952, -75.17, { hours: noDays })
  const all = [both, womenOnly, none, empty]
  const at = (h: number) => new Date(2026, 8, 26, h, 0)

  it('counts a place that opens later today as open today', () => {
    const result = searchAsk(all, [mikvah], "is there a mikvah that's open today", { now: at(7) })
    expect(result.hits.map((h) => h.item.name)).toEqual(['Both Mikvah', 'Women Mikvah'])
  })

  it('says which of its hours are open now and which open later', () => {
    const [hit] = searchAsk([both], [mikvah], 'mikvah open today', { now: at(7) }).hits
    expect(hit.today).toEqual([
      { label: "Men's", opens: '4:30 AM', closes: '10:00 AM', openNow: true },
      { label: 'Women’s', opens: '8:00 PM', closes: '10:00 PM', openNow: false },
    ])
  })

  it('drops hours already over for the day', () => {
    const [hit] = searchAsk([both], [mikvah], 'mikvah open today', { now: at(12) }).hits
    expect(hit.today.map((w) => w.label)).toEqual(['Women’s'])
    expect(searchAsk(all, [mikvah], 'mikvah open today', { now: at(23) }).hits).toEqual([])
  })

  it('does not count a place with no hours saved as closed', () => {
    const result = searchAsk(all, [mikvah], 'mikvah open now', { now: at(7) })
    expect(result.hits.map((h) => h.item.name)).toEqual(['Both Mikvah'])
    expect(result.closedCount).toBe(1) // Women Mikvah, which opens tonight
    expect(result.noHours.map((h) => h.item.name).sort()).toEqual(['Empty Hours Mikvah', 'No Hours Mikvah'])
    expect(result.noHours.every((h) => h.open === null)).toBe(true)
  })

  it('lists nothing as having no hours when the question is not about hours', () => {
    expect(searchAsk(all, [mikvah], 'mikvah', { now: at(7) }).noHours).toEqual([])
  })
})

describe('searchAsk — a Google description is not a kosher item list', () => {
  it('does not find a store by a product only its Google description mentions', () => {
    const groceryWithDescription = makeCategory({
      id: 'grocery',
      label: 'Grocery Store',
      pluralLabel: 'Grocery Stores',
      detailFields: [
        { key: 'googleDescription', label: 'Description', type: 'textarea' },
        { key: 'm', label: 'Kosher items', type: 'tags' },
      ],
    })
    // Reported: Di Bruno Bros. answered "cheese" off Google's "imported
    // cheeses", with no kosher cheese listed there.
    const diBruno = listing('grocery', 'Di Bruno Bros.', 39.95, -75.17, {
      googleDescription: 'Longstanding market-style venue offering imported cheeses, meats & specialty foods.',
      m: ['Challah'],
    })
    const withCheese = listing('grocery', 'GIANT', 39.94, -75.17, { m: ['Cheese Sticks'] })
    const hits = searchAsk([diBruno, withCheese], [groceryWithDescription], 'is there a place that sells cheese').hits
    expect(hits.map((h) => h.item.name)).toEqual(['GIANT'])
  })

  it('still finds a restaurant by its description, where everything served is kosher', () => {
    const restaurantWithDescription = makeCategory({
      id: 'restaurant',
      label: 'Food Establishment',
      pluralLabel: 'Food Establishments',
      detailFields: [{ key: 'googleDescription', label: 'Description', type: 'textarea' }],
    })
    const bakery = listing('restaurant', 'Tasty Twisters Bakery', 39.95, -75.17, {
      googleDescription: 'Family-owned bakery crafting hand-rolled soft pretzels.',
    })
    expect(searchAsk([bakery], [restaurantWithDescription], 'pretzels').hits.map((h) => h.item.name)).toEqual(['Tasty Twisters Bakery'])
  })
})

describe('searchAsk — distance and mikvah hours', () => {
  const mikvah = makeCategory({
    id: 'mikvah',
    label: 'Mikvah',
    pluralLabel: 'Mikvaot',
    detailFields: [
      { key: 'hours', label: 'Hours', type: 'hours' },
      { key: 'men_s_hours', label: "Men's Hours", type: 'hours' },
    ],
  })
  const allWeek = (open: string, close: string) =>
    Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open, close }]))
  const near = listing('mikvah', 'Near Mikvah', 39.95, -75.17, { men_s_hours: allWeek('20:00', '23:00') })
  const far = listing('mikvah', 'Far Mikvah', 40.2, -75.17, { men_s_hours: allWeek('20:00', '23:00') })
  const unlisted = listing('mikvah', 'No Hours Mikvah', 39.951, -75.17)
  const nine = new Date(2026, 8, 24, 21, 0)
  const here = { lat: 39.95, lng: -75.17 }

  it("counts men's hours as opening hours, ready for when they're entered", () => {
    const hits = searchAsk([near, far, unlisted], [mikvah], 'mikvah open tonight', { now: nine }).hits
    expect(hits.map((h) => h.item.name).sort()).toEqual(['Far Mikvah', 'Near Mikvah'])
  })

  it('keeps only places within the distance asked, from the visitor', () => {
    const hits = searchAsk([near, far], [mikvah], 'mikvah open tonight within a 15 minute drive of my location', {
      now: nine,
      coords: here,
    }).hits
    // Far Mikvah is about 17 miles away; 15 minutes' drive is about 6.
    expect(hits.map((h) => h.item.name)).toEqual(['Near Mikvah'])
  })

  it('rules nothing out on distance when there is nowhere to measure from', () => {
    const hits = searchAsk([near, far], [mikvah], 'mikvah within 1 mile', { now: nine }).hits
    expect(hits).toHaveLength(2)
  })
})

describe('searchAsk — what it must not do', () => {
  it('finds nothing for an item nobody has listed, rather than something unrelated', () => {
    // Real questions from the Kosher In Philly group that the guide has no
    // answer for yet. "Frozen" alone, or "fish" alone, is not an answer.
    expect(names('frozen gefilte fish')).toEqual([])
    expect(names('bag of peeled garlic')).toEqual([])
  })

  it('returns nothing for an empty or filler-only query it cannot use', () => {
    expect(names('')).toEqual([])
    expect(names('   ')).toEqual([])
  })

  it('on a category page, searches only that category and ignores its own name', () => {
    const onRestaurants = (input: string) =>
      searchAsk(listings, categories, input, { categoryId: 'restaurant' }).hits.map((h) => h.item.name)
    expect(onRestaurants('dairy').sort()).toEqual(['Chalavita', 'Insomnia Cookies'])
    expect(onRestaurants('kosher food').sort()).toEqual(['Chalavita', 'Cherry Grill', 'Insomnia Cookies'])
    expect(onRestaurants('challah')).toEqual([])
  })
})
