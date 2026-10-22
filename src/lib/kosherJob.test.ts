import { describe, expect, it } from 'vitest'
import { findingKey as keystoneKey, compareKeystone, type KeystoneEntry } from './keystoneWatch'
import { kosherCounts, kosherPlaces, kosherSection, type Filed } from './kosherJob'
import { findingKey as mekorKey, compareMekor, type GuideListing, type MekorEntry } from './mekorWatch'

function listing(over: Partial<GuideListing> & { details?: Record<string, unknown> }): GuideListing {
  return {
    id: over.id ?? 'id-' + (over.name ?? 'x'),
    status: 'approved',
    category: 'restaurant',
    name: 'Somewhere',
    address: null,
    phone: null,
    anchor_id: 'community',
    distance: null,
    ...over,
    details: over.details ?? {},
  }
}

function keystone(over: Partial<KeystoneEntry>): KeystoneEntry {
  const slug = over.slug ?? 'somewhere'
  return {
    slug,
    url: `https://keystone-k.org/kosher/${slug}/`,
    name: 'Somewhere',
    kinds: ['restaurants'],
    updated: null,
    address: '',
    phone: '',
    website: null,
    certification: 'Meat',
    levels: ['Meat'],
    ...over,
  }
}

function mekor(over: Partial<MekorEntry>): MekorEntry {
  const slug = over.slug ?? 'somewhere'
  return {
    slug,
    url: `https://www.mekorhabracha.org/post/${slug}`,
    name: 'Somewhere',
    neighborhood: 'Center City & Vicinity',
    kinds: ['Restaurants'],
    supervision: 'Under IKC Supervision',
    certs: ['IKC'],
    address: '',
    phone: '',
    website: null,
    certificate: null,
    ...over,
  }
}

const filed = (pending: string[] = [], settled: string[] = []): Filed => ({ pending: new Set(pending), settled: new Set(settled) })

const cherry = listing({
  id: 'cherry',
  name: 'Cherry Grill',
  details: { kosherCert: ['Keystone-K'], k: 'https://keystone-k.org/kosher/cherry-grill/', t: ['Meat'] },
})
const cherryEntry = keystone({ slug: 'cherry-grill', name: 'Cherry Grill', certification: 'Meat – Glatt', levels: ['Meat'] })

describe('kosherPlaces', () => {
  it('a place a list agrees with is checked, and says what the list says', () => {
    const { places } = kosherPlaces({ listings: [cherry], keystone: [cherryEntry], mekor: null })
    expect(places).toHaveLength(1)
    expect(places[0].on).toEqual([{ list: 'keystone', name: 'Cherry Grill', url: cherryEntry.url, says: 'Meat – Glatt' }])
    expect(places[0].differences).toEqual([])
    expect(kosherSection(places[0])).toBe('checked')
  })

  // Step 6: a finding filed before still waits here after the list changes.
  it('a place with a finding waiting is to check, even once the list agrees', () => {
    const { places } = kosherPlaces({ listings: [cherry], keystone: [cherryEntry], mekor: null })
    expect(kosherSection({ ...places[0], waiting: 1 })).toBe('to_check')
    expect(kosherCounts([{ ...places[0], waiting: 1 }], [], 0).toCheck).toBe(1)
  })

  it('a place on Keystone-K’s list whose listing doesn’t name Keystone-K is to check, in a line', () => {
    const l = listing({ id: 'judah', name: 'Judah Grille', details: { kosherCert: ['IKC'], t: ['Meat'] } })
    const e = keystone({ slug: 'judah-grille', name: 'Judah Grille' })
    const { places } = kosherPlaces({ listings: [l], keystone: [e], mekor: null })
    expect(places[0].differences.map((d) => d.line)).toEqual([
      'On Keystone-K’s list; the listing doesn’t name Keystone-K',
      'The listing has no link to its page on Keystone-K’s list',
    ])
    expect(places[0].differences.every((d) => d.filed === 'next')).toBe(true)
    expect(kosherSection(places[0])).toBe('to_check')
  })

  it('says meat, dairy or parve as each side has it, whatever the order', () => {
    const l = listing({ id: 'bagel', name: 'New York Bagel', details: { kosherCert: ['Keystone-K'], k: 'https://keystone-k.org/kosher/bagel/', t: ['Dairy'] } })
    const both = keystone({ slug: 'bagel', name: 'New York Bagel', levels: ['Dairy', 'Parve'] })
    expect(kosherPlaces({ listings: [l], keystone: [both], mekor: null }).places[0].differences.map((d) => d.line)).toEqual([
      'Keystone-K says Dairy, Parve; the listing says Dairy',
    ])
    // Listed in the other order, beside a difference that is real.
    const reordered = listing({ ...l, details: { ...l.details, kosherCert: ['OU'], t: ['Parve', 'Dairy'] } })
    expect(kosherPlaces({ listings: [reordered], keystone: [both], mekor: null }).places[0].differences.map((d) => d.line)).toEqual([
      'On Keystone-K’s list; the listing doesn’t name Keystone-K',
    ])
  })

  it('a place gone from Keystone-K’s list says whether Keystone-K was its only hechsher', () => {
    const only = listing({ id: 'only', name: 'Gone Grill', details: { kosherCert: ['Keystone-K'] } })
    const two = listing({ id: 'two', name: 'Half Grill', details: { kosherCert: ['Keystone-K', 'OU'] } })
    const lines = kosherPlaces({ listings: [only, two], keystone: [cherryEntry], mekor: null }).places.map((p) => p.differences.map((d) => d.line))
    expect(lines).toEqual([
      ['Not on Keystone-K’s list any more, and Keystone-K is its only hechsher'],
      ['Not on Keystone-K’s list any more; the listing names Keystone-K'],
    ])
  })

  it('a Mekor Habracha difference says both hechsherim', () => {
    const l = listing({ id: 'sababa', name: 'Sababa', details: { kosherCert: ['OU'] } })
    const e = mekor({ slug: 'sababa', name: 'Sababa', certs: ['IKC'] })
    const { places } = kosherPlaces({ listings: [l], keystone: null, mekor: [e] })
    expect(places[0].on.map((o) => o.says)).toEqual(['Under IKC Supervision'])
    expect(places[0].differences.map((d) => [d.list, d.line])).toEqual([['mekor', 'Mekor Habracha says IKC; the listing says OU']])
  })

  it('a listing that says IKC with no place on Mekor Habracha’s list is to check', () => {
    const l = listing({ id: 'ikc', name: 'Only Here', details: { kosherCert: ['IKC'] } })
    const { places } = kosherPlaces({ listings: [l], keystone: null, mekor: [mekor({ slug: 'other', name: 'Elsewhere Cafe' })] })
    expect(places[0].differences.map((d) => d.line)).toEqual(['The listing says IKC; Mekor Habracha’s list doesn’t have it'])
  })

  it('a place on neither list is not listed, not checked', () => {
    const l = listing({ id: 'star', name: 'Star K Place', details: { kosherCert: ['Star-K'] } })
    const { places } = kosherPlaces({ listings: [l], keystone: [cherryEntry], mekor: [] })
    expect(kosherSection(places[0])).toBe('not_listed')
  })

  it('a list that wasn’t read says nothing, rather than that every place is gone from it', () => {
    const { places } = kosherPlaces({ listings: [cherry], keystone: null, mekor: null })
    expect(places[0].differences).toEqual([])
    expect(kosherSection(places[0])).toBe('not_listed')
  })

  it('a difference says whether it waits in the queue, was decided, or files tomorrow', () => {
    const l = listing({ id: 'judah', name: 'Judah Grille', details: { kosherCert: ['IKC'], t: ['Meat'] } })
    const e = keystone({ slug: 'judah-grille', name: 'Judah Grille' })
    const key = keystoneKey(compareKeystone([e], [l])[0])
    const at = (f: Filed) => kosherPlaces({ listings: [l], keystone: [e], mekor: null, filed: { keystone: f } }).places[0]
    expect(at(filed([key])).differences[0].filed).toBe('queued')
    expect(kosherSection(at(filed([key])))).toBe('to_check')
    expect(at(filed([], [key])).differences[0].filed).toBe('decided')
    expect(kosherSection(at(filed([], [key])))).toBe('decided')
    expect(at(filed()).differences[0].filed).toBe('next')
  })

  it('archived listings aren’t places on the page, but Mekor Habracha’s list having one is said', () => {
    const gone = listing({ id: 'old', name: 'Old Deli', status: 'archived', details: { kosherCert: ['IKC'] } })
    const e = mekor({ slug: 'old-deli', name: 'Old Deli' })
    const { places, newPlaces } = kosherPlaces({ listings: [gone], keystone: null, mekor: [e] })
    expect(places).toEqual([])
    expect(newPlaces).toEqual([{ name: 'Old Deli', address: '', on: [expect.objectContaining({ list: 'mekor' })], archived: 'Old Deli', filed: 'next' }])
  })

  // The user, Oct 22: "We only need to check Food, not grocery stores".
  it('a grocery isn’t a place on the page, and one on a list isn’t a new place', () => {
    const giant = listing({ id: 'giant', category: 'grocery', name: 'GIANT', address: '50 E Wynnewood Rd' })
    const k = keystone({ slug: 'giant-wynnewood', name: 'GIANT', kinds: ['groceries', 'bakeries'] })
    const m = mekor({ slug: 'giant', name: 'GIANT', kinds: ['Bakery'], address: '50 E Wynnewood Rd' })
    expect(kosherPlaces({ listings: [giant, cherry], keystone: [k, cherryEntry], mekor: [m] })).toEqual({ places: [expect.objectContaining({ id: 'cherry' })], newPlaces: [] })
    // Nor is a grocery the guide doesn't have.
    expect(kosherPlaces({ listings: [], keystone: [k], mekor: null }).newPlaces).toEqual([])
  })

  it('a place new on both lists is one place, waiting if either filed it', () => {
    const k = keystone({ slug: 'shug', name: 'Shug Sisters', kinds: ['bakeries'] })
    const m = mekor({ slug: 'shug-sisters', name: 'Shug Sisters', kinds: ['Bakery'] })
    const mKey = mekorKey(compareMekor([m], [], [])[0])
    const { newPlaces } = kosherPlaces({ listings: [], keystone: [k], mekor: [m], filed: { mekor: filed([mKey]) } })
    expect(newPlaces).toHaveLength(1)
    expect(newPlaces[0].on.map((o) => o.list)).toEqual(['keystone', 'mekor'])
    expect(newPlaces[0].filed).toBe('queued')
  })
})

describe('kosherCounts', () => {
  it('counts places to check and new places, but not ones decided before', () => {
    const judah = listing({ id: 'judah', name: 'Judah Grille', details: { kosherCert: ['IKC'], t: ['Meat'] } })
    const star = listing({ id: 'star', name: 'Star K Place', details: { kosherCert: ['Star-K'] } })
    const entries = [cherryEntry, keystone({ slug: 'judah-grille', name: 'Judah Grille' }), keystone({ slug: 'shug', name: 'Shug Sisters', kinds: ['bakeries'] })]
    const newKey = 'new:shug'
    const { places, newPlaces } = kosherPlaces({ listings: [cherry, judah, star], keystone: entries, mekor: null, filed: { keystone: filed([], [newKey]) } })
    expect(kosherCounts(places, newPlaces, 1)).toEqual({ checked: 1, toCheck: 1, cantRead: 0, didntLoad: 1, notListed: 1 })
  })
})
