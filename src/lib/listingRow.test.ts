import { describe, expect, it } from 'vitest'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import type { CategoryField } from './categories'
import { initialsOf, listingRowFacts } from './listingRow'

const hours: CategoryField = { key: 'hours', label: 'Hours', type: 'hours', renderAs: 'row' }
const type: CategoryField = {
  key: 'type',
  label: 'Food type',
  type: 'select',
  renderAs: 'badge',
  filterable: true,
  options: [
    { value: 'meat', label: 'Meat' },
    { value: 'parve', label: 'Parve' },
  ],
}
const cert: CategoryField = {
  key: 'cert',
  label: 'Hechsher',
  type: 'select',
  renderAs: 'badge',
  filterable: true,
  caveat: { flagField: 'partial', noteField: 'partialNote' },
}
const items: CategoryField = {
  key: 'items',
  label: 'Kosher items',
  type: 'tags',
  showCountInHeader: true,
  countLabel: 'kosher item',
  countReplacesKey: 'kosher',
}
const kosher: CategoryField = { key: 'kosher', label: 'Kosher items', type: 'boolean', filterable: true }

// A Friday at 2 PM, local time.
const FRIDAY_2PM = new Date(2026, 9, 2, 14, 0)
const openFriday = (open: string, close: string) => ({ fri: { open, close } })
const texts = (facts: { text: string }[]) => facts.map((f) => f.text)

describe('listingRowFacts', () => {
  it('reads status, distance, kind of place, in that order', () => {
    const category = makeCategory({ detailFields: [hours, type, cert] })
    const item = makeListing({ hours: openFriday('09:00', '19:00'), milesFromAddress: 1.24, type: 'parve', cert: 'IKC' })
    expect(listingRowFacts(item, category, FRIDAY_2PM)).toEqual([
      { text: 'Open until 7 PM', tone: 'open' },
      { text: '1.2 mi', tone: 'plain' },
      { text: 'Parve', tone: 'plain' },
      { text: 'IKC', tone: 'plain' },
    ])
  })

  it('keeps the minutes when there are some, and says "closes soon" within the hour', () => {
    const category = makeCategory({ detailFields: [hours] })
    expect(texts(listingRowFacts(makeListing({ hours: openFriday('09:00', '18:30') }), category, FRIDAY_2PM))).toEqual(['Open until 6:30 PM'])
    const soon = listingRowFacts(makeListing({ hours: openFriday('09:00', '14:45') }), category, FRIDAY_2PM)
    expect(soon).toEqual([{ text: 'Closes soon · 2:45 PM', tone: 'caution' }])
  })

  it('says just "Open" for a place open till midnight, not "until 11:59 PM"', () => {
    const category = makeCategory({ detailFields: [hours] })
    expect(texts(listingRowFacts(makeListing({ hours: openFriday('09:00', '23:59') }), category, FRIDAY_2PM))).toEqual(['Open'])
  })

  it('says "Closed now" for a place with hours that isn’t open, and nothing for one with no hours', () => {
    const category = makeCategory({ detailFields: [hours] })
    expect(texts(listingRowFacts(makeListing({ hours: openFriday('16:00', '20:00') }), category, FRIDAY_2PM))).toEqual(['Closed now'])
    expect(listingRowFacts(makeListing(), category, FRIDAY_2PM)).toEqual([])
  })

  it('puts a closure first, over any hours, red only when it’s permanent', () => {
    const category = makeCategory({ detailFields: [hours] })
    const open = { hours: openFriday('09:00', '19:00') }
    expect(listingRowFacts(makeListing({ ...open, businessStatus: 'CLOSED_TEMPORARILY' }), category, FRIDAY_2PM)).toEqual([
      { text: 'Temporarily closed', tone: 'caution' },
    ])
    expect(listingRowFacts(makeListing({ ...open, businessStatus: 'CLOSED_PERMANENTLY' }), category, FRIDAY_2PM)).toEqual([
      { text: 'Permanently closed', tone: 'closed' },
    ])
  })

  it('puts a shul’s next minyan after its status, before its distance', () => {
    const facts = listingRowFacts(makeListing({ milesFromAddress: 0.4 }), makeCategory(), FRIDAY_2PM, { nextMinyan: 'Mincha 6:34 PM' })
    expect(facts).toEqual([
      { text: 'Mincha 6:34 PM', tone: 'minyan' },
      { text: '0.4 mi', tone: 'plain' },
    ])
  })

  it('marks a hechsher with a caveat in the caution tone, carrying its note', () => {
    const category = makeCategory({ detailFields: [cert] })
    const item = makeListing({ cert: 'IKC', partial: true, partialNote: 'Only the bakery case' })
    expect(listingRowFacts(item, category, FRIDAY_2PM)).toEqual([{ text: 'IKC', tone: 'caution', title: 'Only the bakery case' }])
    const noNote = makeListing({ cert: 'IKC', partial: true })
    expect(listingRowFacts(noNote, category, FRIDAY_2PM)[0].title).toBe('Not everything here is kosher — please verify.')
  })

  it('leaves out badge fields that aren’t tied to a filter', () => {
    const category = makeCategory({ detailFields: [{ ...type, filterable: false }] })
    expect(listingRowFacts(makeListing({ type: 'meat' }), category, FRIDAY_2PM)).toEqual([])
  })

  it('counts items, always and sometimes, and drops the badge the count replaces', () => {
    const category = makeCategory({ detailFields: [kosher, items] })
    const item = makeListing({ kosher: true, items: ['Milk', 'Challah'], items_sometimes: ['Brie'] })
    expect(texts(listingRowFacts(item, category, FRIDAY_2PM))).toEqual(['3 kosher items'])
  })

  it('keeps the replaced badge while there are no items to count, and says "1 kosher item"', () => {
    const category = makeCategory({ detailFields: [kosher, items] })
    expect(texts(listingRowFacts(makeListing({ kosher: true, items: [] }), category, FRIDAY_2PM))).toEqual(['Kosher items'])
    expect(texts(listingRowFacts(makeListing({ kosher: true, items: ['Milk'] }), category, FRIDAY_2PM))).toEqual(['1 kosher item'])
  })
})

describe('initialsOf', () => {
  it('takes the first letters of the first two words', () => {
    expect(initialsOf("Shlomo's Fish Market")).toBe('SF')
    expect(initialsOf('Mekor Habracha')).toBe('MH')
  })

  it('skips a leading "The"', () => {
    expect(initialsOf('The Kosher Grill')).toBe('KG')
  })

  it('takes two letters of a one-word name', () => {
    expect(initialsOf('ALDI')).toBe('AL')
    expect(initialsOf('Goldie')).toBe('GO')
  })

  it('never comes back empty', () => {
    expect(initialsOf('—')).toBe('?')
  })
})
