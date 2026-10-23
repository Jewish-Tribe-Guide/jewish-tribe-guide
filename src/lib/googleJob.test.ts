import { describe, expect, it } from 'vitest'
import { checkerText, fieldsPill, googleCounts, googlePill, googleSection, streetOf, whoText, type Checker, type GoogleFieldRow, type GooglePlace } from './googleJob'

const f = (field: GoogleFieldRow['field'], by: Checker, value = 'x'): GoogleFieldRow => ({ field, label: { name: 'Name', hours: 'Hours', phone: 'Phone', website: 'Website' }[field], value, by })
const G: Checker = { kind: 'google' }
const W: Checker = { kind: 'website' }
const N: Checker = { kind: 'nothing' }
const place = (over: Partial<GooglePlace>): GooglePlace => ({
  id: '1',
  name: 'Chalavita',
  street: null,
  address: null,
  category: 'restaurant',
  categoryLabel: 'Food',
  href: '/philly/food/chalavita',
  matched: true,
  section: 'checked',
  fields: [f('name', G)],
  readAt: '2026-10-18T10:00:00Z',
  failedAt: null,
  notOnGoogle: null,
  closure: null,
  compare: null,
  ...over,
})

describe('googleSection', () => {
  it('a match Google stopped answering is Can’t be read, whatever else', () => {
    expect(googleSection({ matched: true, failing: true, fields: [{ by: N }] })).toBe('cant_read')
  })
  it('a field nothing checks is To check; with no match too', () => {
    expect(googleSection({ matched: true, failing: false, fields: [{ by: G }, { by: N }] })).toBe('to_check')
    expect(googleSection({ matched: false, failing: true, fields: [{ by: N }] })).toBe('to_check')
  })
  it('every field checked is Checked', () => {
    expect(googleSection({ matched: false, failing: false, fields: [{ by: W }, { by: { kind: 'you', at: '2026-10-22T12:00:00Z' } }] })).toBe('checked')
  })
})

describe('checkerText', () => {
  it('says who, and a date only for you or a Google that stopped answering', () => {
    expect(checkerText(G)).toBe('Google')
    expect(checkerText({ kind: 'google', at: '2026-09-10T12:00:00Z' })).toBe('Google · Sep 10')
    expect(checkerText(W)).toBe('Its website')
    expect(checkerText({ kind: 'you', at: '2026-10-22T12:00:00Z' })).toBe('You · Oct 22')
    expect(checkerText(N)).toBe('Nothing')
  })
})

describe('googlePill', () => {
  it('To check: Not on Google, one field by name, or how many', () => {
    expect(googlePill(place({ section: 'to_check', matched: false, fields: [f('name', N)] }))).toBe('Not on Google')
    expect(googlePill(place({ section: 'to_check', fields: [f('name', G), f('website', N)] }))).toBe('Website not checked')
    expect(googlePill(place({ section: 'to_check', fields: [f('name', N), f('hours', N), f('phone', G), f('website', N)] }))).toBe('3 not checked')
  })
  it('Can’t be read: since Google last answered', () => {
    expect(googlePill(place({ section: 'cant_read', readAt: '2026-09-10T12:00:00Z' }))).toBe('Not read since Sep 10')
  })
  it('Checked: who checks, or a closure Google reports', () => {
    expect(googlePill(place({ fields: [f('name', G), f('hours', W)] }))).toBe('Google · its website')
    expect(googlePill(place({ fields: [f('name', G)] }))).toBe('Google')
    expect(googlePill(place({ closure: { status: 'CLOSED_TEMPORARILY', shownOpen: false, since: null, readAt: null } }))).toBe('Closed for now')
    expect(googlePill(place({ closure: { status: 'CLOSED_PERMANENTLY', shownOpen: true, since: null, readAt: null } }))).toBe('Shown as open')
  })
})

describe('whoText', () => {
  it('in a fixed order, the first capitalised', () => {
    expect(whoText([{ by: { kind: 'you' } }, { by: W }])).toBe('Its website · you')
  })
})

describe('fieldsPill', () => {
  it('what was decided wins, then what a check found', () => {
    expect(fieldsPill(place({ decided: { what: 'used', at: '2026-10-22T12:00:00Z' } }))).toBe('Used Oct 22')
    expect(fieldsPill(place({ decided: { what: 'kept', at: '2026-10-22T12:00:00Z' } }))).toBe('Kept Oct 22')
    const rows = [
      { field: 'name' as const, label: 'Name', google: 'A', changed: true },
      { field: 'hours' as const, label: 'Hours', google: 'B', changed: true },
      { field: 'phone' as const, label: 'Phone', google: 'C', changed: false },
    ]
    expect(fieldsPill(place({ compare: { at: '2026-10-22T12:00:00Z', rows } }))).toBe('2 changes')
    expect(fieldsPill(place({ compare: { at: '2026-10-22T12:00:00Z', rows: rows.slice(2) } }))).toBe('Same as Google')
  })
  it('otherwise as its row says it', () => {
    expect(fieldsPill(place({ section: 'to_check', fields: [f('name', N), f('hours', N), f('phone', G)] }))).toBe('2 not checked')
    expect(fieldsPill(place({ section: 'to_check', matched: false, fields: [f('name', N)] }))).toBe('Not on Google')
    expect(fieldsPill(place({ section: 'cant_read', readAt: '2026-09-10T12:00:00Z' }))).toBe('Not read since Sep 10')
    expect(fieldsPill(place({ fields: [f('name', G)] }))).toBe('Google')
  })
})

describe('streetOf', () => {
  it('the first part, without its number', () => {
    expect(streetOf('2200 Huntingdon Pike, Huntingdon Valley, PA')).toBe('Huntingdon Pike')
    expect(streetOf('Citizens Bank Way, Philadelphia')).toBe('Citizens Bank Way')
    expect(streetOf('1001-29 S Broad St, Philadelphia, PA')).toBe('S Broad St')
    expect(streetOf(null)).toBeNull()
  })
})

describe('googleCounts', () => {
  it('each tab, and nothing that didn’t load', () => {
    expect(googleCounts([{ section: 'checked' }, { section: 'to_check' }, { section: 'to_check' }, { section: 'cant_read' }])).toEqual({ checked: 1, toCheck: 2, cantRead: 1, didntLoad: 0 })
  })
})
