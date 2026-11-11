import { describe, expect, it } from 'vitest'
import type { Eruv } from './eruv'
import { eruvAsDecided, eruvChanges, readEruvSuggestion, type EruvSuggestion } from './eruvSuggestion'
import type { CategoryField } from './categories'

// A visitor's fix to an eruv's listing: tidied, checked, and only when it
// changes something.

const eruv: Eruv = {
  id: 'center-city', name: 'Center City Eruv', covers: 'Center City and South Philadelphia.', website: 'https://www.centercityeruv.com/', hotline: null, alertsUrl: null,
  statusUrl: null, statusDated: false, status: null, statusWords: null, statusPostedOn: null, statusCheckedAt: null, statusErrorAt: null, statusError: null,
}
const same = { covers: eruv.covers, website: eruv.website, hotline: '', alertsUrl: '' }

describe('readEruvSuggestion', () => {
  it('keeps the four rows as suggested, the eruv’s id and name with them', () => {
    const read = readEruvSuggestion({ ...same, hotline: ' (215) 555-0100 ' }, eruv)
    expect(read).toEqual({ ok: true, suggestion: { eruvId: 'center-city', name: 'Center City Eruv', covers: eruv.covers, website: eruv.website, hotline: '(215) 555-0100', alertsUrl: null } })
  })

  it('a website typed without https:// gets it', () => {
    const read = readEruvSuggestion({ ...same, website: 'centercityeruv.org' }, eruv)
    expect(read.ok && read.suggestion.website).toBe('https://centercityeruv.org')
  })

  it('refuses a link that isn’t a web address', () => {
    expect(readEruvSuggestion({ ...same, alertsUrl: 'javascript:alert(1)' }, eruv)).toEqual({ ok: false, errors: ['Email alerts isn’t a web address.'] })
  })

  it('refuses what changes nothing, spacing included', () => {
    expect(readEruvSuggestion(same, eruv)).toEqual({ ok: false, errors: ['Nothing was changed.'] })
    expect(readEruvSuggestion({ ...same, covers: '  Center City  and South Philadelphia. ' }, eruv)).toEqual({ ok: false, errors: ['Nothing was changed.'] })
  })

  it('refuses a row far too long for it', () => {
    expect(readEruvSuggestion({ ...same, hotline: '1'.repeat(200) }, eruv)).toEqual({ ok: false, errors: ['Hotline is too long.'] })
  })

  it('ignores anything else sent with it', () => {
    const read = readEruvSuggestion({ ...same, hotline: '215', statusUrl: 'https://evil.example', name: 'Renamed' }, eruv)
    expect(read.ok && read.suggestion).toEqual({ eruvId: 'center-city', name: 'Center City Eruv', covers: eruv.covers, website: eruv.website, hotline: '215', alertsUrl: null })
  })
})

describe('eruvChanges', () => {
  it('each row changed, before and after; a row emptied counts', () => {
    expect(eruvChanges(eruv, { ...same, website: null, hotline: '215' })).toEqual([
      { key: 'website', label: 'Website', before: 'https://www.centercityeruv.com/', after: null },
      { key: 'hotline', label: 'Hotline', before: null, after: '215' },
    ])
  })
})

// Nov 9: the Eruv page's own fields (eruvFields.ts), suggested like its rows.
describe('the page’s own fields', () => {
  const certified: CategoryField = { key: 'certifiedBy', label: 'Certified by', type: 'text' }
  const map: CategoryField = { key: 'mapPdf', label: 'Printed map', type: 'url' }
  const kind: CategoryField = { key: 'kind', label: 'Kind', type: 'select', options: [{ value: 'city', label: 'City eruv' }] }
  const own = [certified, map, kind]
  const has: Eruv = { ...eruv, details: { certifiedBy: 'Rabbi A', kind: 'city' } }
  const blank = { ...same, details: { certifiedBy: 'Rabbi A', mapPdf: '', kind: 'city' } }

  it('keeps the ones it changes, each with how the page named it', () => {
    const read = readEruvSuggestion({ ...blank, details: { ...blank.details, certifiedBy: 'Rabbi B', mapPdf: 'eruv.org/map.pdf' } }, has, own)
    expect(read.ok && read.suggestion).toMatchObject({ details: { certifiedBy: 'Rabbi B', mapPdf: 'https://eruv.org/map.pdf' }, detailFields: [certified, map] })
  })

  it('an emptied one is null; one not sent, or not on the page, is left alone', () => {
    const read = readEruvSuggestion({ ...same, details: { certifiedBy: '', other: 'x' } }, has, own)
    expect(read.ok && read.suggestion.details).toEqual({ certifiedBy: null })
  })

  it('counts as a change on its own, and changing nothing is still refused', () => {
    expect(readEruvSuggestion({ ...same, details: { kind: [] } }, has, own)).toMatchObject({ ok: true })
    expect(readEruvSuggestion(blank, has, own)).toEqual({ ok: false, errors: ['Nothing was changed.'] })
  })

  it('refuses a link that isn’t a web address', () => {
    expect(readEruvSuggestion({ ...same, details: { mapPdf: 'javascript:alert(1)' } }, has, own)).toEqual({ ok: false, errors: ['Printed map isn’t a web address.'] })
  })

  it('without the page’s fields, sends none', () => {
    const read = readEruvSuggestion({ ...same, hotline: '215', details: { certifiedBy: 'Rabbi B' } }, has)
    expect(read.ok && read.suggestion).not.toHaveProperty('details')
  })

  it('the queue words each one before and after, a choice by its name', () => {
    expect(eruvChanges(has, { ...same, details: { certifiedBy: 'Rabbi B', kind: null }, detailFields: [certified, kind] })).toEqual([
      { key: 'certifiedBy', label: 'Certified by', before: 'Rabbi A', after: 'Rabbi B' },
      { key: 'kind', label: 'Kind', before: 'City eruv', after: null },
    ])
  })

  it('Use this takes one only when it’s given', () => {
    const sent: EruvSuggestion = { eruvId: eruv.id, name: eruv.name, covers: eruv.covers, website: eruv.website, hotline: null, alertsUrl: null, details: { certifiedBy: 'Rabbi B', kind: null }, detailFields: [certified, kind] }
    const decided = eruvAsDecided(sent, has, { only: ['kind'] })
    expect(decided.ok && decided.suggestion).toMatchObject({ details: { kind: null }, detailFields: [kind] })
    expect(eruvAsDecided(sent, has, { only: ['website'] })).toMatchObject({ ok: true, suggestion: expect.not.objectContaining({ details: expect.anything() }) })
  })
})
