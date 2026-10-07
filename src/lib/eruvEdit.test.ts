import { describe, expect, it } from 'vitest'
import { eruvIdFor, readEruvEdit } from './eruvEdit'

describe('readEruvEdit', () => {
  it('keeps what an admin may set, tidied', () => {
    expect(readEruvEdit({ name: ' Lower Merion Eruv ', covers: '', website: 'lowermerioneruv.org', statusDated: true, sortOrder: '3', lineLeaveOut: ['Fall 2025 Reroute Alert', 'Fall 2025 Reroute Alert', ''], status: 'up' })).toEqual({
      ok: true,
      edit: { name: 'Lower Merion Eruv', covers: null, website: 'https://lowermerioneruv.org/', statusDated: true, sortOrder: 3, lineLeaveOut: ['Fall 2025 Reroute Alert'] },
    })
  })
  it('refuses what isn’t one', () => {
    expect(readEruvEdit({ name: '' })).toEqual({ ok: false, error: 'The eruv needs a name.' })
    expect(readEruvEdit({ statusUrl: 'not a site' })).toMatchObject({ ok: false })
    expect(readEruvEdit({ sortOrder: 'first' })).toMatchObject({ ok: false })
    expect(readEruvEdit(null)).toMatchObject({ ok: false })
  })
  it('an emptied address is cleared', () => {
    expect(readEruvEdit({ alertsUrl: '' })).toEqual({ ok: true, edit: { alertsUrl: null } })
  })
})

describe('eruvIdFor', () => {
  it('from the name', () => {
    expect(eruvIdFor('Center City Eruv')).toBe('center-city')
    expect(eruvIdFor('Cherry Hill (NJ) Eruv')).toBe('cherry-hill-nj')
  })
})
