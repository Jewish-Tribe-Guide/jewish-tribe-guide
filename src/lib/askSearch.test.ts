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
