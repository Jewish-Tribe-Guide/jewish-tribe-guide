import { describe, expect, it } from 'vitest'
import { googleCounts, googleSection, streetOf, type Checker } from './googleJob'

const G: Checker = { kind: 'google' }
const W: Checker = { kind: 'website' }
const N: Checker = { kind: 'nothing' }

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
