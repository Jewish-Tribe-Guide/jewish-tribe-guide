import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import type { DirectoryResource } from '@/types'
import { classifyMiss, tallyMisses, type MissTally } from './missedSearches'

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
    { key: 'hours', label: 'Hours', type: 'hours' },
  ],
})
const hotel = makeCategory({ id: 'hotel', label: 'Hotel', pluralLabel: 'Hotels', capabilities: { add: false, edit: true, report: true, directorySearch: true, map: true } })
const eruv = makeCategory({ id: 'eruv-info', label: 'Eruv Information', pluralLabel: 'Eruv Information', kind: 'eruv' })
const categories = [grocery, restaurant, hotel, eruv]

function listing(category: string, name: string, details: Record<string, unknown> = {}): DirectoryResource {
  return { id: name, category, name, anchorId: 'community', distance: 0, address: '', geo: { lat: 39.95, lng: -75.17 }, ...details }
}
const allWeek = (open: string, close: string) =>
  Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open, close }]))

const aldi = listing('grocery', 'ALDI', { m: ['Pretzels', 'Brie'] })
const shlomo = listing('grocery', "Shlomo's Fish Market", { m: ['Frozen Fish'] })
const pizza = listing('restaurant', 'Pizza Place', { t: ['Dairy', 'Pizza'], hours: allWeek('11:00', '15:00') })
const cambria = listing('hotel', 'Cambria Hotel')
const listings = [aldi, shlomo, pizza, cambria]

const tally = (term: string): MissTally => ({ term, count: 4, lastDay: '2026-09-26', dismissedAt: null })
const classify = (term: string, now = new Date(2026, 8, 24, 12, 0)) => classifyMiss(tally(term), listings, categories, { now })

describe('tallyMisses', () => {
  it('adds up each search’s days, most searched first, then most recent', () => {
    const rows = [
      { key: 'dentist', day: '2026-09-20', count: 2 },
      { key: 'peeled garlic', day: '2026-09-25', count: 1 },
      { key: 'dentist', day: '2026-09-24', count: 1 },
      { key: 'tutor', day: '2026-09-26', count: 1 },
    ]
    expect(tallyMisses(rows, new Map([['tutor', '2026-09-26T10:00:00Z']]))).toEqual([
      { term: 'dentist', count: 3, lastDay: '2026-09-24', dismissedAt: null },
      { term: 'tutor', count: 1, lastDay: '2026-09-26', dismissedAt: '2026-09-26T10:00:00Z' },
      { term: 'peeled garlic', count: 1, lastDay: '2026-09-25', dismissedAt: null },
    ])
  })
})

describe('classifyMiss', () => {
  it('keeps the count and dates it was given', () => {
    expect(classify('dentist')).toMatchObject({ term: 'dentist', count: 4, lastDay: '2026-09-26', dismissedAt: null })
  })

  it('calls a search nothing answers, even loosely, missing', () => {
    expect(classify('dentist').verdict).toEqual({ kind: 'missing' })
  })

  it('calls it close when dropping a word finds something, and names what', () => {
    const { verdict } = classify('frozen gefilte fish')
    expect(verdict.kind).toBe('close')
    if (verdict.kind !== 'close') return
    expect(verdict.summary).toMatch(/^Without “gefilte”: /)
    expect(verdict.places.map((p) => p.name)).toEqual(["Shlomo's Fish Market"])
  })

  it('calls it found when today’s search answers it, with the places', () => {
    const { verdict } = classify('pretzels')
    expect(verdict.kind).toBe('found')
    if (verdict.kind !== 'found') return
    expect(verdict.places).toEqual([{ id: 'ALDI', name: 'ALDI', category: 'grocery' }])
  })

  it('judges "open now" without the clock: the guide has pizza, whenever the admin looks', () => {
    const tenPm = new Date(2026, 8, 24, 22, 0)
    const { verdict } = classify('pizza open now', tenPm)
    expect(verdict.kind).toBe('found')
    if (verdict.kind !== 'found') return
    expect(verdict.places.map((p) => p.name)).toEqual(['Pizza Place'])
    expect(verdict.summary).toContain('the hours decided')
  })

  it('counts a page the home cards answer with as found: a stroller on Shabbos is the Eruv page', () => {
    const { verdict } = classify('stroller on shabbos')
    expect(verdict).toEqual({ kind: 'found', summary: 'Matches the Eruv Information page.', places: [] })
  })

  it('counts a question about the guide itself as answered', () => {
    expect(classify('who runs this').verdict).toEqual({ kind: 'found', summary: 'Answered about the guide itself.', places: [] })
  })

  it('counts a Shabbos-times question as answered, from the zmanim', () => {
    expect(classify('when is candle lighting').verdict).toEqual({ kind: 'found', summary: 'Answered from the zmanim.', places: [] })
  })

  it('counts "is the eruv up" as answered, by the eruv status links', () => {
    expect(classify('is the eruv up').verdict).toEqual({ kind: 'found', summary: "Answered with each eruv's status link.", places: [] })
  })

  it('doesn’t let the kind of place alone make a page answer it: no vegan food is still a gap', () => {
    expect(classify('vegan food').verdict.kind).not.toBe('found')
  })

  it('suggests adding to the one kind of place asked about, only when it takes additions', () => {
    expect(classify('vegan food').askedCategory).toBe('restaurant')
    expect(classify('hotel with a pool').askedCategory).toBeNull()
    expect(classify('dentist').askedCategory).toBeNull()
  })

  it('ignores listings in a category visitors can’t see', () => {
    // The public categories leave hidden ones out; their listings answer nothing.
    const r = classifyMiss(tally('cambria'), listings, [grocery, restaurant], { now: new Date(2026, 8, 24, 12, 0) })
    expect(r.verdict.kind).toBe('missing')
  })
})
