import { describe, expect, it } from 'vitest'
import type { DirectoryResource } from '@/types'
import { makeCategory } from '@/test/providerFixtures'
import type { CategoryConfig } from './categories'
import { searchAsk } from './askSearch'
import { answerFor } from './askAnswer'
import { askWordKey, askWordLabel, proposeWords, readTaught, withTaught, type AskWord } from './askWords'
import { needsReading, ownFrom } from './readingSearch'

const fields = [
  { key: 'kosherCert', label: 'Kosher Cert', type: 'select' as const, filterable: true, options: [{ value: 'IKC', label: 'IKC' }, { value: 'OU', label: 'OU' }] },
  { key: 't', label: 'Food Type', type: 'select' as const, filterable: true },
  { key: 'notes', label: 'Notes', type: 'text' as const },
]
const food = (askWords?: AskWord[]) => makeCategory({ id: 'restaurant', label: 'Food', pluralLabel: 'Food', detailFields: fields, ...(askWords ? { askWords } : {}) })
const grocery = (askWords?: AskWord[]) =>
  makeCategory({ id: 'grocery', label: 'Grocery', pluralLabel: 'Grocery', detailFields: [{ key: 'm', label: 'Kosher items', type: 'tags' }], ...(askWords ? { askWords } : {}) })
const hotels = makeCategory({ id: 'hotel', label: 'Hotel', pluralLabel: 'Hotels', detailFields: [{ key: 'shabbatFriendly', label: 'Shabbat friendly', type: 'boolean', filterable: true }] })

const place = (category: string, name: string, details: Record<string, unknown> = {}): DirectoryResource => ({
  id: name,
  category,
  name,
  anchorId: 'community',
  distance: 0,
  address: '',
  geo: { lat: 39.95, lng: -75.17 },
  ...details,
})
// "IKC dairy" by text finds every place that mentions either; by filter, one.
const listings = [
  place('restaurant', 'Holy Cow', { kosherCert: 'IKC', t: ['Dairy'] }),
  place('restaurant', 'Grill', { kosherCert: 'IKC', t: ['Meat'] }),
  place('restaurant', 'Milk Bar', { kosherCert: 'OU', t: ['Dairy'], notes: 'IKC once' }),
  place('restaurant', 'Dairy Queen'),
  place('grocery', 'ShopRite', { m: ['Dairy'] }),
]
const taught: AskWord[] = [
  { word: 'ikc', field: 'kosherCert', value: 'IKC' },
  { word: 'dairy', field: 't', value: 'Dairy' },
]
const names = (r: { hits: { item: DirectoryResource }[] }) => r.hits.map((h) => h.item.name).sort()

describe('taught words in our own search', () => {
  it('reads "IKC dairy" as the two filters, not as text', () => {
    const before = searchAsk(listings, [food(), grocery()], 'IKC dairy places')
    expect(names(before).length).toBeGreaterThan(1)
    expect(needsReading(before)).toBe(true)

    const after = searchAsk(listings, [food(taught), grocery()], 'IKC dairy places')
    expect(names(after)).toEqual(['Holy Cow'])
    expect(after.terms).toEqual([])
    expect(after.categoryIds).toEqual(['restaurant'])
    expect(after.taught?.map((t) => t.word)).toEqual(['ikc', 'dairy'])
    // Fully understood: the AI isn't asked.
    expect(needsReading(after)).toBe(false)
  })

  it('says what the words were read as', () => {
    const r = searchAsk(listings, [food(taught), grocery()], 'ikc dairy')
    expect(answerFor(r)?.text).toBe('Holy Cow: IKC, Dairy.')
    const two = searchAsk(listings, [food([taught[1]]), grocery()], 'dairy')
    expect(answerFor(two)?.text).toMatch(/^2 food places: Dairy\./)
  })

  it('leaves a listing’s own name alone: "dairy queen" is the place', () => {
    const r = searchAsk(listings, [food(taught), grocery()], 'dairy queen')
    expect(r.taught).toBeUndefined()
    expect(names(r)[0]).toBe('Dairy Queen')
  })

  it('only in the kinds of place asked about, or on its own category page', () => {
    // "dairy grocery" named Grocery: Food's "dairy" doesn't apply there.
    const named = searchAsk(listings, [food(taught), grocery()], 'dairy grocery')
    expect(named.taught).toBeUndefined()
    expect(names(named)).toEqual(['ShopRite'])
    const page = searchAsk(listings, [food(taught), grocery()], 'dairy', { categoryId: 'grocery' })
    expect(page.taught).toBeUndefined()
    expect(names(page)).toEqual(['ShopRite'])
    const own = searchAsk(listings, [food(taught), grocery()], 'dairy', { categoryId: 'restaurant' })
    expect(names(own)).toEqual(['Holy Cow', 'Milk Bar'])
  })

  it('keeps any other words to look for', () => {
    // (The last word is still being typed, so "grill" goes first.)
    const r = searchAsk(listings, [food(taught), grocery()], 'grill ikc')
    expect(r.terms).toEqual(['grill'])
    expect(names(r)).toEqual(['Grill'])
  })

  it('carries into a reading, which can add to it but not take it away', () => {
    const r = searchAsk(listings, [food(taught), grocery()], 'ikc spots for a simcha')
    const own = ownFrom(r)
    expect(own.taught?.map((t) => t.word)).toEqual(['ikc'])
    const read = withTaught({ categories: [{ id: 'restaurant', select: { kosherCert: ['OU'], t: ['Meat'] } }, { id: 'hotel' }] }, own.taught)
    expect(read.categories).toEqual([{ id: 'restaurant', select: { kosherCert: ['IKC'], t: ['Meat'] } }, { id: 'hotel' }])
    expect(withTaught({ categories: [] }, [{ word: 'bakery', categoryId: 'restaurant' }]).categories).toEqual([{ id: 'restaurant' }])
  })
})

describe('readTaught', () => {
  const cats = [food([{ word: 'chalav yisroel', field: 't', value: 'CY' }, { word: 'yisroel', field: 't', value: 'Israeli' }])]
  it('a phrase needs all its words, and wins over a word inside it', () => {
    const r = readTaught(['chalav', 'yisroel', 'pizza'], cats, { categoryIds: null })
    expect(r.used.map((u) => u.value)).toEqual(['CY'])
    expect(r.terms).toEqual(['pizza'])
    expect(readTaught(['yisroel'], cats, { categoryIds: null }).used.map((u) => u.value)).toEqual(['Israeli'])
  })
  it('folds a word as it’s typed', () => {
    expect(askWordKey('Cholov  Yisrael')).toBe('chalav yisroel')
    expect(askWordKey('CY')).toBe('chalav yisroel')
  })
})

describe('askWordLabel', () => {
  const cats: CategoryConfig[] = [food(), hotels]
  it('says it in the guide’s own words', () => {
    expect(askWordLabel({ word: 'ikc', categoryId: 'restaurant', field: 'kosherCert', value: 'IKC' }, cats)).toBe('Food · Kosher Cert: IKC')
    expect(askWordLabel({ word: 'shomer', categoryId: 'hotel', field: 'shabbatFriendly' }, cats)).toBe('Hotels · Shabbat friendly')
    expect(askWordLabel({ word: 'eats', categoryId: 'restaurant' }, cats)).toBe('Food')
    expect(askWordLabel({ word: 'x', categoryId: 'gone' }, cats)).toBeNull()
    expect(askWordLabel({ word: 'x', categoryId: 'restaurant', field: 'gone', value: 'y' }, cats)).toBeNull()
  })
})

describe('proposeWords — what a reading suggests teaching', () => {
  const cats: CategoryConfig[] = [food(), grocery(), hotels]
  it('a word that names one of the reading’s filters is that filter', () => {
    const p = proposeWords(['ikc', 'dairy'], { categories: [{ id: 'restaurant', select: { kosherCert: ['IKC'], t: ['Dairy'] } }] }, cats, null)
    expect(p.map((x) => [x.word, x.label])).toEqual([
      ['ikc', 'Food · Kosher Cert: IKC'],
      ['dairy', 'Food · Food Type: Dairy'],
    ])
  })
  it('one filter left and a word or two left: those words are it', () => {
    const p = proposeWords(['milchig'], { categories: [{ id: 'restaurant', select: { t: ['Dairy'] } }] }, cats, null)
    expect(p).toEqual([{ word: 'milchig', categoryId: 'restaurant', field: 't', value: 'Dairy', label: 'Food · Food Type: Dairy' }])
    const yesNo = proposeWords(['shomer', 'shabbos'], { categories: [{ id: 'hotel', bool: ['shabbatFriendly'] }] }, cats, null)
    expect(yesNo.map((x) => [x.word, x.field])).toEqual([['shomer shabbos', 'shabbatFriendly']])
  })
  it('a kind of place the reading added, for the one word left', () => {
    expect(proposeWords(['bakery'], { categories: [{ id: 'restaurant' }] }, cats, null)).toEqual([{ word: 'bakery', categoryId: 'restaurant', label: 'Food' }])
    // Not a kind our own search already heard.
    expect(proposeWords(['bakery'], { categories: [{ id: 'restaurant' }] }, cats, ['restaurant'])).toEqual([])
  })
  it('never a guess past that', () => {
    // Two filters unexplained, two words: which is which isn't known.
    expect(proposeWords(['fancy', 'milchig'], { categories: [{ id: 'restaurant', select: { t: ['Dairy'], kosherCert: ['OU'] } }] }, cats, null)).toEqual([])
    // Items aren't filters, and nothing read means nothing to teach.
    expect(proposeWords(['cy'], { categories: [], items: ['Chalav Yisroel Milk'] }, cats, null)).toEqual([])
    expect(proposeWords([], { categories: [{ id: 'restaurant', select: { t: ['Dairy'] } }] }, cats, null)).toEqual([])
    // A filter its page doesn't offer.
    expect(proposeWords(['notes'], { categories: [{ id: 'restaurant', select: { notes: ['x'] } }] }, cats, null)).toEqual([])
  })
})
