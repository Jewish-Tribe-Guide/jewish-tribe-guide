import { describe, expect, it } from 'vitest'
import { eruvIdFor, readEruvEdit, readingsToReset } from './eruvEdit'

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
  it('whether its markers are hidden: only a real yes hides them', () => {
    expect(readEruvEdit({ lineHidePoints: true })).toEqual({ ok: true, edit: { lineHidePoints: true } })
    expect(readEruvEdit({ lineHidePoints: 'yes' })).toEqual({ ok: true, edit: { lineHidePoints: false } })
  })
  it('a line colour: a colour, tidied, or none for its own', () => {
    expect(readEruvEdit({ lineColor: '#1D4ED8' })).toEqual({ ok: true, edit: { lineColor: '#1d4ed8' } })
    expect(readEruvEdit({ lineColor: ' #0af ' })).toEqual({ ok: true, edit: { lineColor: '#00aaff' } })
    expect(readEruvEdit({ lineColor: null })).toEqual({ ok: true, edit: { lineColor: null } })
    expect(readEruvEdit({ lineColor: '' })).toEqual({ ok: true, edit: { lineColor: null } })
    expect(readEruvEdit({ lineColor: 'blue' })).toMatchObject({ ok: false })
    expect(readEruvEdit({ lineColor: 'red;background:url(x)' })).toMatchObject({ ok: false })
    expect(readEruvEdit({ lineColor: 7 })).toMatchObject({ ok: false })
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
