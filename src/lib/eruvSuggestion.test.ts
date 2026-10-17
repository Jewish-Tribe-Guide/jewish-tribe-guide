import { describe, expect, it } from 'vitest'
import type { Eruv } from './eruv'
import { eruvChanges, readEruvSuggestion } from './eruvSuggestion'

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
