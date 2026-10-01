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
