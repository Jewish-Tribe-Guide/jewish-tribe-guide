import { describe, expect, it } from 'vitest'
import { contactLine, contactsChange, contactsSummary, contactsText, mergeContacts, readContacts, sameContacts, webLink } from './contacts'

// A list of contacts (Oct 6): a hospital's liaisons, pantries, rides, read
// the same way wherever they're shown, so nothing half-typed or odd ever
// reaches a listing or the queue.

describe('readContacts', () => {
  it('tidies each entry: spaces, blank parts, repeated phones, a phone given as a string', () => {
    expect(
      readContacts([
        { name: '  Bikur Cholim  of Philadelphia ', who: '', phones: ['215-805-8668', ' 215-805-8668', ' ', '610-389-1412'], note: 'Call to arrange.', junk: 1 },
        { name: 'Chai Lifeline', phones: '732-719-1700, 908-770-5145' },
      ]),
    ).toEqual([
      { name: 'Bikur Cholim of Philadelphia', phones: ['215-805-8668', '610-389-1412'], note: 'Call to arrange.' },
      { name: 'Chai Lifeline', phones: ['732-719-1700', '908-770-5145'] },
    ])
  })
  it('an entry with only a person is named by them; one with no name at all is no entry', () => {
    expect(readContacts([{ who: 'Mrs. Schwartz', phones: ['2158058668'] }, { phones: ['2158058668'] }, null, 'x', []])).toEqual([{ name: 'Mrs. Schwartz', phones: ['2158058668'] }])
  })
  it('anything that isn’t a list is none', () => {
    expect(readContacts('Bikur Cholim')).toEqual([])
    expect(readContacts({ name: 'x' })).toEqual([])
    expect(readContacts(undefined)).toEqual([])
  })
  it('a phone with no number in it isn’t a phone', () => {
    expect(readContacts([{ name: 'x', phones: ['call us', '12'] }])).toEqual([{ name: 'x' }])
  })
})

describe('as words', () => {
  const e = { name: 'Darchei Chesed', who: 'Dispatch', phones: ['8454254070'], email: 'r@dc.org', web: 'dc.org', note: 'Rides to appointments.', from: 'Monsey' }
  it('one line an entry, every part of it', () => {
    expect(contactLine(e)).toBe('From Monsey: Darchei Chesed · Dispatch · (845) 425-4070 · r@dc.org · dc.org · Rides to appointments.')
    expect(contactsSummary([e, { name: 'Bikur Cholim' }])).toBe(`${contactLine(e)}\nBikur Cholim`)
    expect(contactsSummary([])).toBe('')
  })
  it('search words: names, people, notes, where from', () => {
    expect(contactsText([e])).toBe('Monsey Darchei Chesed Dispatch Rides to appointments.')
  })
  it('a website as people say it, linked', () => {
    expect(webLink('https://www.bikkurcholimphilly.org/hospitality/')).toEqual({ label: 'bikkurcholimphilly.org/hospitality', href: 'https://www.bikkurcholimphilly.org/hospitality/' })
    expect(webLink('chailifeline.org')).toEqual({ label: 'chailifeline.org', href: 'https://chailifeline.org' })
  })
})

describe('comparing and merging', () => {
  const bc = { name: 'Bikur Cholim', phones: ['215-805-8668'] }
  it('the same list, however it was typed', () => {
    expect(sameContacts([bc], [{ name: ' Bikur Cholim ', phones: ['215-805-8668', ''] }])).toBe(true)
    expect(sameContacts([bc], [{ ...bc, note: 'x' }])).toBe(false)
    expect(sameContacts(undefined, [{ name: '' }])).toBe(true)
  })
  it('a merge updates by name and adds the rest, taking nothing off', () => {
    expect(mergeContacts([bc, { name: 'Chai House' }], [{ name: 'bikur cholim', note: 'In Philadelphia.' }, { name: 'Darchei Chesed' }])).toEqual([
      { name: 'bikur cholim', phones: ['215-805-8668'], note: 'In Philadelphia.' },
      { name: 'Chai House' },
      { name: 'Darchei Chesed' },
    ])
  })
  it('what an edit did, by name', () => {
    expect(contactsChange([bc, { name: 'Old' }], [{ ...bc, note: 'x' }, { name: 'New' }])).toBe('+ New · − Old · Changed: Bikur Cholim')
    expect(contactsChange([bc, { name: 'B' }], [{ name: 'B' }, bc])).toBe('Reordered')
  })
})
