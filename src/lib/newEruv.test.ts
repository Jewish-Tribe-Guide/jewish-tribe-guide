import { describe, expect, it } from 'vitest'
import { readNewEruv } from './newEruv'

// A new eruv as a visitor sends it from the Eruv page's "+" (Nov 9).
describe('readNewEruv', () => {
  const listed = [{ id: 'center-city', name: 'Center City Eruv' }]
  const errors = (raw: object) => {
    const r = readNewEruv(raw, listed)
    return r.ok ? [] : r.errors
  }

  it('gives it the id adding it would, and tidies what it gives', () => {
    const r = readNewEruv({ name: '  Overbrook   Eruv ', covers: ' Overbrook. ', website: 'overbrookeruv.org', hotline: '', map: 'overbrookeruv.org/map.kml' }, listed)
    expect(r).toEqual({
      ok: true,
      suggestion: expect.objectContaining({ eruvId: 'overbrook', name: 'Overbrook Eruv', covers: 'Overbrook.', website: 'https://overbrookeruv.org', hotline: null, statusAt: null, map: 'https://overbrookeruv.org/map.kml' }),
    })
  })

  it('needs a name that’s more than "Eruv", and not too long', () => {
    expect(errors({})).toEqual(['Give the eruv a name.'])
    expect(errors({ name: 'Eruv' })).toEqual(['Give the eruv a name.'])
    expect(errors({ name: 'A'.repeat(121) })).toEqual(['The name is too long.'])
  })

  it('refuses one already listed, by its id or its name', () => {
    expect(errors({ name: 'Center City' })).toEqual(['Center City Eruv is already listed. Suggest an edit to it instead.'])
    expect(errors({ name: 'CENTER CITY ERUV' })).toEqual(['Center City Eruv is already listed. Suggest an edit to it instead.'])
  })

  it('keeps where its status is: a page, or the address its emails come from', () => {
    const at = (statusAt: string) => {
      const r = readNewEruv({ name: 'Overbrook', statusAt }, listed)
      return r.ok ? r.suggestion.statusAt : r.errors
    }
    expect(at('overbrookeruv.org/status')).toBe('https://overbrookeruv.org/status')
    expect(at('Status@OverbrookEruv.org')).toBe('status@overbrookeruv.org')
    expect(at('"Eruv Committee" <status@overbrookeruv.org>')).toBe('status@overbrookeruv.org')
    expect(at('call Moshe')).toEqual(['Status isn’t a web address or an email address.'])
  })
})
