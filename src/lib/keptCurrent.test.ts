import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import type { NightKindView } from './nightKinds'
import { keptCurrent } from './keptCurrent'

// Boards W1 and W2 (Nov 25): one list, by what's kept current.

const NOW = Date.parse('2026-11-25T15:00:00Z')
const LAST_NIGHT = '2026-11-25T08:00:00Z'
const view = (over: Partial<NightKindView>): NightKindView => ({ id: 'google', name: 'Google', about: '', when: null, count: '', trouble: null, misses: [], tracked: [], nights: [], fixes: [], lastAt: LAST_NIGHT, schedule: '', ...over })
const places = (...names: string[]) => names.map((name) => ({ name, status: '', bad: false, page: '' }))
const shuls = makeCategory({ id: 'synagogue', kind: 'listing', detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] } as never)

describe('keptCurrent', () => {
  it('a community with places: each row with where it’s read from and when (W1)', () => {
    const rows = keptCurrent(
      [shuls],
      [
        view({ id: 'google', tracked: places('A', 'B', 'C') }),
        view({ id: 'times', tracked: places('Mekor', 'Mekor', 'Kol Tzedek') }),
        view({ id: 'newsletters', tracked: places('Mekor', 'Sons of Israel', 'x@y.org') }),
        view({ id: 'sites', tracked: places('Deli') }),
        view({ id: 'kosher', tracked: places('Keystone-K', 'Mekor Habracha', 'KCL') }),
        view({ id: 'eruvs', tracked: places('Center City', 'Lower Merion') }),
        view({ id: 'links', tracked: places('a', 'b'), lastAt: '2026-10-25T10:00:00Z', fixes: [{ name: 'Links', why: 'Didn’t run since Oct 25', page: 'job/links', whole: true }] }),
      ],
      [],
      NOW,
    )
    const by = Object.fromEntries(rows.map((r) => [r.name, [r.from, r.when, r.tone]]))
    expect(by['Open or closed']).toEqual(['Google · 3 places', 'Last night', 'ok'])
    expect(by['Hours, phone and website']).toEqual(['Google · 3 places, weekly', 'Last night', 'ok'])
    // The shuls read by website or email, each once; a sender not linked isn't a shul.
    expect(by['Minyan times']).toEqual(['3 shuls’ websites and emails', 'Last night', 'ok'])
    expect(by['Phone, email and hours'][0]).toBe('1 place’s website')
    expect(by['Kosher certification'][0]).toBe('Keystone-K, Mekor Habracha and KCL')
    expect(by['Eruv up or down'][0]).toBe('2 eruvs’ pages and emails')
    expect(by['Links']).toEqual(['Every link nothing else reads, Sundays', 'Didn’t run since Oct 25', 'bad'])
    // No row for Shul emails, nor Look again: they're in the rows above.
    expect(rows.map((r) => r.name)).not.toContain('Shul emails')
    expect(rows.map((r) => r.job)).not.toContain('newsletters')
  })

  it('a new community: every row, with what it has none of (W2)', () => {
    const rows = keptCurrent([], [], [], NOW)
    expect(rows.map((r) => [r.name, r.from, r.when])).toEqual([
      ['Open or closed', 'Google', 'No places yet'],
      ['Hours, phone and website', 'Google', 'No places yet'],
      ['Minyan times', 'Shuls’ websites and emails', 'No shuls yet'],
      ['Mikvah hours', 'Mikvahs’ websites', 'No mikvahs yet'],
      ['Phone, email and hours', 'Places’ own websites', 'No places yet'],
      ['Menus', 'Restaurants’ menus', 'No menus yet'],
      ['Kosher certification', 'The agencies’ lists', 'No lists yet'],
      ['Eruv up or down', 'Eruvs’ pages and emails', 'No eruvs yet'],
      ['Hospitals', 'Refuah', 'No hospitals yet'],
      ['Links', 'Every link nothing else reads, Sundays', 'No links yet'],
    ])
    expect(rows.every((r) => r.tone === 'none')).toBe(true)
  })

  it('shuls with nothing read yet, and a job turned off', () => {
    const rows = keptCurrent([shuls], [view({ id: 'hours', tracked: places('Mikvah') })], ['hours'], NOW)
    expect(rows.find((r) => r.key === 'times')?.when).toBe('Nothing to read yet')
    expect(rows.find((r) => r.key === 'hours')).toMatchObject({ from: '1 mikvah’s website', when: 'Turned off', tone: 'none' })
  })
})
