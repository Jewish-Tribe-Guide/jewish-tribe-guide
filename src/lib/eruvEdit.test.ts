import { describe, expect, it } from 'vitest'
import { eruvIdFor, readEruvEdit, readingsToReset } from './eruvEdit'

describe('readEruvEdit', () => {
  // An order and a line colour are no longer an admin's (Nov 9): eruvim
  // list by name, and a too-pale line is darkened by itself.
  it('keeps what an admin may set, tidied, and nothing else', () => {
    expect(readEruvEdit({ name: ' Lower Merion Eruv ', covers: '', website: 'lowermerioneruv.org', statusDated: true, sortOrder: '3', lineColor: '#1d4ed8', lineLeaveOut: ['Fall 2025 Reroute Alert', 'Fall 2025 Reroute Alert', ''], status: 'up' })).toEqual({
      ok: true,
      edit: { name: 'Lower Merion Eruv', covers: null, website: 'https://lowermerioneruv.org/', statusDated: true, lineLeaveOut: ['Fall 2025 Reroute Alert'] },
    })
  })
  it('refuses what isn’t one', () => {
    expect(readEruvEdit({ name: '' })).toEqual({ ok: false, error: 'The eruv needs a name.' })
    expect(readEruvEdit({ statusUrl: 'not a site' })).toMatchObject({ ok: false })
    expect(readEruvEdit(null)).toMatchObject({ ok: false })
  })
  it('whether its markers are hidden: only a real yes hides them', () => {
    expect(readEruvEdit({ lineHidePoints: true })).toEqual({ ok: true, edit: { lineHidePoints: true } })
    expect(readEruvEdit({ lineHidePoints: 'yes' })).toEqual({ ok: true, edit: { lineHidePoints: false } })
  })
  // Oct 19: an eruv with no status page, its status emailed instead.
  it('the address its status emails come from, tidied; never with a status page too', () => {
    expect(readEruvEdit({ statusEmail: ' JCOR-NE-Philadelphia@groups.io ' })).toEqual({ ok: true, edit: { statusEmail: 'jcor-ne-philadelphia@groups.io' } })
    expect(readEruvEdit({ statusEmail: '' })).toEqual({ ok: true, edit: { statusEmail: null } })
    expect(readEruvEdit({ statusEmail: 'https://groups.io/g/JCOR-NE-Philadelphia' })).toMatchObject({ ok: false, error: expect.stringMatching(/email address/) })
    expect(readEruvEdit({ statusUrl: 'https://www.centercityeruv.com/', statusEmail: 'eruv@example.org' })).toMatchObject({ ok: false, error: expect.stringMatching(/not both/) })
    expect(readEruvEdit({ statusUrl: '', statusEmail: 'eruv@example.org' })).toEqual({ ok: true, edit: { statusUrl: null, statusEmail: 'eruv@example.org' } })
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

describe('readingsToReset', () => {
  const stored = { statusUrl: 'https://www.pennocp.org/eruv', lineUrl: 'https://www.google.com/maps/d/viewer?mid=x' }
  it('a save that leaves the addresses as they were keeps the readings and the line waiting', () => {
    expect(readingsToReset({ ...stored, lineLeaveOut: ['Directions'] }, stored)).toEqual({ status: false, line: false })
  })
  it('a new address, or one taken away, starts afresh', () => {
    expect(readingsToReset({ ...stored, lineUrl: 'https://example.org/line.geojson' }, stored)).toEqual({ status: false, line: true })
    expect(readingsToReset({ statusUrl: null }, stored)).toEqual({ status: true, line: false })
  })
})
