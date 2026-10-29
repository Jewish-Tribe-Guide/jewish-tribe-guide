import { describe, expect, it } from 'vitest'
import { filterPlaces, placeCounts, placeLine, type AdminPlace } from './adminPlaces'

const place = (over: Partial<AdminPlace> = {}): AdminPlace => ({
  id: over.name ?? 'p',
  name: 'Goldie',
  category: 'food',
  status: 'approved',
  hasAddress: true,
  changedAt: new Date(2026, 9, 17, 12).toISOString(),
  listing: { id: 'p', category: 'food', name: 'Goldie', anchorId: 'all', distance: 0, address: '1 Main St' },
  ...over,
})

const places = [
  place({ name: 'Goldie' }),
  place({ name: 'Base Philadelphia', category: 'networking', hasAddress: false }),
  place({ name: 'Café Olé', category: 'food' }),
  place({ name: 'Old Deli', status: 'archived' }),
]

describe('placeCounts', () => {
  it('counts on the site, missing an address, and archived', () => {
    expect(placeCounts(places)).toEqual({ site: 3, 'no-address': 1, archived: 1 })
  })
  it('counts within a category', () => {
    expect(placeCounts(places, 'food')).toEqual({ site: 2, 'no-address': 0, archived: 1 })
  })
})

describe('filterPlaces', () => {
  const names = (ps: AdminPlace[]) => ps.map((p) => p.name)
  it('lists what’s on the site by name, with no archived ones', () => {
    expect(names(filterPlaces(places, { show: 'site' }))).toEqual(['Base Philadelphia', 'Café Olé', 'Goldie'])
  })
  it('Archived is a filter like the others', () => {
    expect(names(filterPlaces(places, { show: 'archived' }))).toEqual(['Old Deli'])
    expect(names(filterPlaces(places, { show: 'no-address' }))).toEqual(['Base Philadelphia'])
  })
  it('finds by any part of the name, ignoring case and accents, within a category', () => {
    expect(names(filterPlaces(places, { show: 'site', query: 'cafe ole' }))).toEqual(['Café Olé'])
    expect(names(filterPlaces(places, { show: 'site', category: 'networking' }))).toEqual(['Base Philadelphia'])
    expect(names(filterPlaces(places, { show: 'site', category: 'networking', query: 'gold' }))).toEqual([])
  })
})

describe('placeLine', () => {
  it('says when it changed, and what’s wrong first', () => {
    expect(placeLine(place())).toBe('Changed Oct 17')
    expect(placeLine(place({ hasAddress: false }))).toBe('No address · changed Oct 17')
    expect(placeLine(place({ status: 'archived' }))).toBe('Archived Oct 17')
  })
})
