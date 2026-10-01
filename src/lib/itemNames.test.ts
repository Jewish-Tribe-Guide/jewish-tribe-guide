import { describe, expect, it } from 'vitest'
import type { DirectoryResource } from '@/types'
import { makeCategory } from '@/test/providerFixtures'
import { ITEM_NAMES, itemEntry, itemName, itemWords, namesItem } from './itemNames'
import { searchAsk } from './askSearch'
import { answerFor } from './askAnswer'
import { needsReading } from './readingSearch'
import { readerVocabulary, readingItemsOn } from './questionReader'
import { words } from './ask'

const grocery = makeCategory({ id: 'grocery', label: 'Grocery', pluralLabel: 'Grocery', detailFields: [{ key: 'm', label: 'Kosher items', type: 'tags' }] })
const store = (name: string, m: string[], lat = 39.95): DirectoryResource => ({ id: name, category: 'grocery', name, anchorId: 'c', distance: 0, address: '', geo: { lat, lng: -75.17 }, m })
// The names the guide's stores had on Oct 1.
const stores = [
  store('Acme', ['Salmon', 'Sliced Cheeses', 'Challah'], 39.951),
  store('ShopRite', ['Fresh Fish Counter', 'Brie', 'Premade Shabbat Meals'], 39.96),
  store('GIANT', ['Some Sliced Cheese', 'Hamburger Meat', 'Prepared Shabbos Food'], 39.97),
  store('ALDI', ['Goat Cheese', 'Wine'], 39.98),
]
const here = { lat: 39.95, lng: -75.17 }
const found = (q: string) => searchAsk(stores, [grocery], q, { coords: here })
const names = (q: string) => found(q).hits.map((h) => h.item.name)

describe('the list itself', () => {
  it('each name, other name and kind belongs to one item', () => {
    const seen = new Map<string, string>()
    for (const e of ITEM_NAMES) {
      for (const n of [e.name, ...(e.aka ?? [])]) {
        const k = words(n).join(' ')
        expect(seen.get(k) ?? e.name, `"${n}" is in two entries`).toBe(e.name)
        seen.set(k, e.name)
      }
    }
  })

  it('reads a name any way it’s typed or spelled', () => {
    expect(itemName('Some Sliced Cheese')).toBe('Sliced Cheese')
    expect(itemName('sliced cheeses')).toBe('Sliced Cheese')
    expect(itemName('Premade Shabbat Meals')).toBe('Prepared Shabbos Food')
    expect(itemName('Bakery')).toBe('Baked Goods')
    expect(itemName('Ground Beef')).toBe('Hamburger Meat')
    expect(itemName('Gefilte Fish')).toBe('Gefilte Fish')
    expect(itemEntry('Gefilte Fish')).toBeUndefined()
  })

  it('an item’s words include its kinds; one not on the list keeps its own', () => {
    expect(itemWords('Salmon')).toEqual(expect.arrayContaining(['salmon', 'lox', 'fish']))
    expect(itemWords('Gefilte Fish')).toEqual(['gefilte', 'fish'])
  })

  it('names an item only said whole', () => {
    expect(namesItem(['fish'], 'Salmon')).toBe(true)
    expect(namesItem(['sliced', 'cheese'], 'Some Sliced Cheese')).toBe(true)
    expect(namesItem(['smoked', 'fish'], 'Salmon')).toBe(false)
    expect(namesItem(['meat'], 'Chicken')).toBe(false)
  })
})

describe('search finds an item by its kind and its other names', () => {
  it('"fish" finds the salmon and the fish counter', () => {
    expect(names('fish').sort()).toEqual(['Acme', 'ShopRite'])
    expect(answerFor(found('fish'), { coords: here })?.text).toMatch(/^2 places have fish\./)
    // A kind may be a food place's type too ("meat"), so the AI is still
    // asked; it adds to what the search found.
    expect(needsReading(found('fish'))).toBe(true)
  })

  it('an item by another of its names is understood whole: the AI isn’t asked', () => {
    expect(needsReading(found('ground beef'))).toBe(false)
  })

  it('"meat" is Stew Meat’s kind and Food’s type: still read (Oct 1, a comparison miss)', () => {
    const steak = { ...store('Grill', [], 39.952), category: 'restaurant', t: ['Meat'] }
    const food = makeCategory({ id: 'restaurant', label: 'Food', pluralLabel: 'Food', detailFields: [{ key: 't', label: 'Food Type', type: 'select', filterable: true }] })
    const r = searchAsk([store('TJ', ['Stew Meat']), steak], [grocery, food], 'meat', { coords: here })
    expect(needsReading(r)).toBe(true)
    // Only groceries found it: still not understood whole.
    expect(needsReading(searchAsk([store('TJ', ['Stew Meat'])], [grocery], 'meat', { coords: here }))).toBe(true)
  })

  it('"cheese" finds the brie too', () => {
    expect(names('cheese').sort()).toEqual(['ALDI', 'Acme', 'GIANT', 'ShopRite'])
  })

  it('"ground beef" finds the hamburger meat, and "shabbos meals" both names for it', () => {
    expect(names('ground beef')).toEqual(['GIANT'])
    expect(names('shabbos meals').sort()).toEqual(['GIANT', 'ShopRite'])
  })
})

describe('the reader reads into one name per item', () => {
  it('two stores’ two names for sliced cheese are one item, and both stores have it', () => {
    const vocab = readerVocabulary([grocery], stores, [])
    expect(vocab.items.filter((i) => /sliced/i.test(i))).toEqual(['Sliced Cheese'])
    expect(vocab.items).not.toContain('Premade Shabbat Meals')
    expect(stores.filter((s) => readingItemsOn(s, ['Sliced Cheese']).length > 0).map((s) => s.name)).toEqual(['Acme', 'GIANT'])
    expect(readingItemsOn(stores[2], ['Sliced Cheese'])).toEqual([{ tag: 'Some Sliced Cheese', sometimes: false }])
  })
})

describe('the answer says when the item was last seen (agreed Oct 1)', () => {
  const now = Date.parse('2026-10-09T17:30:00Z')
  const dated = [
    { ...store('Acme', ['Challah'], 39.951), itemSeen: { m: { Challah: '2026-10-09T14:00:00Z' } } },
    { ...store('ShopRite', ['Challah'], 39.96), itemSeen: { m: { Challah: '2026-07-02T14:00:00Z' } } },
    store('GIANT', ['Challah'], 39.97),
  ]
  const ask = (q: string, list = dated, n: number | null = now) => answerFor(searchAsk(list, [grocery], q, { coords: here }), { coords: here, now: n })?.text

  it('the nearest’s date, and how many were seen this week', () => {
    expect(ask('challah')).toBe('3 places have Challah. Seen this week at 1. Nearest: Acme, 0.1 mi, seen today.')
  })

  it('nothing said where nobody has seen it, nor before the page knows the time', () => {
    expect(ask('challah', [dated[2], dated[1]])).toBe('2 places have Challah. Nearest: ShopRite, 0.7 mi, seen Jul 2.')
    expect(ask('challah', [dated[2]])).toBe('GIANT has Challah, 1.4 mi.')
    expect(ask('challah', dated, null)).toBe('3 places have Challah. Nearest: Acme, 0.1 mi.')
  })
})

describe('main dishes on Food (agreed Oct 1)', () => {
  const now = Date.parse('2026-10-09T17:30:00Z')
  const food = makeCategory({
    id: 'restaurant',
    label: 'Food',
    pluralLabel: 'Food',
    detailFields: [
      { key: 'googleDescription', label: 'Description', type: 'textarea' },
      {
        key: 't',
        label: 'Food Type',
        type: 'select',
        renderAs: 'badge',
        filterable: true,
        multiSelect: true,
        options: ['Meat', 'Dairy', 'Parve'].map((v) => ({ value: v, label: v })),
      },
      { key: 'dishes', label: 'Main dishes', type: 'tags', countLabel: 'dish', showCountInHeader: true, expandedOnly: true },
    ],
  })
  const place = (name: string, t: string[], details: Record<string, unknown>, lat: number): DirectoryResource => ({
    id: name,
    category: 'restaurant',
    name,
    anchorId: 'c',
    distance: 0,
    address: '',
    geo: { lat, lng: -75.17 },
    t,
    ...details,
  })
  const places = [
    place('Cherry Grill', ['Meat'], { dishes: ['Burgers', 'Steak'], itemMenu: { dishes: { Burgers: '2026-10-02T15:00:00Z' } } }, 39.951),
    place('PLNT', ['Parve'], { dishes: ['Burgers'] }, 39.96),
    place('Cafe Dairy', ['Dairy'], { dishes: ['Burger', 'Pizza'] }, 39.97),
    place('Bagel Place', [], { dishes: ['Burgers'] }, 39.98),
    place('Pretzel Co.', ['Parve'], { googleDescription: 'Hand-rolled soft pretzels.' }, 39.99),
  ]
  const ask = (q: string, list = places) => answerFor(searchAsk(list, [food], q, { coords: here }), { coords: here, now })?.text

  it('"burger" finds the burgers, however each menu names them, and says where they’re meatless', () => {
    expect(ask('burger')).toBe(
      '4 places have burgers. At PLNT (parve) and Cafe Dairy (dairy) they’re meatless. Nearest: Cherry Grill, 0.1 mi, on its menu Oct 2.',
    )
    expect(ask('hamburger')).toMatch(/^4 places have /)
  })

  it('says it of one place too, and nothing where the place is meat or says neither', () => {
    expect(ask('burger', [places[1]])).toBe('PLNT has Burgers, 0.7 mi. It’s parve, so they’re meatless.')
    expect(ask('burger', [places[0], places[3]])).toBe('2 places have Burgers. Nearest: Cherry Grill, 0.1 mi, on its menu Oct 2.')
    // Meat and dairy both: not said.
    expect(ask('burger', [place('Both', ['Meat', 'Dairy'], { dishes: ['Burgers'] }, 39.96)])).toBe('Both has Burgers, 0.7 mi.')
  })

  it('a dish that isn’t usually meat says nothing about it', () => {
    expect(ask('pizza')).toBe('Cafe Dairy has Pizza, 1.4 mi.')
  })

  it('a food place is still found by its own description beside the dishes', () => {
    expect(ask('pretzels')).toMatch(/^Pretzel Co\. has pretzels/)
  })
})
