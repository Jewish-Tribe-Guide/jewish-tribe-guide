import { describe, expect, it } from 'vitest'
import { makeListing } from '@/test/providerFixtures'
import type { DateFacts } from './schedules'
import { dayIndexFor, readMinyanimSearch, shulMatches, tefillosLabel } from './minyanimSearch'

const day = (date: string, weekday: DateFacts['weekday'], name: string | null = null, festival: string | null = null): DateFacts => ({ date, weekday, yomTov: false, cholHamoed: false, festival, name })
const WEEK = [
  day('2026-10-01', 'thu', 'Chol HaMoed', 'Sukkos'),
  day('2026-10-02', 'fri', 'Hoshana Rabbah', 'Sukkos'),
  day('2026-10-03', 'sat', 'Shemini Atzeres', 'Sukkos'),
  day('2026-10-04', 'sun', 'Simchas Torah', 'Sukkos'),
  day('2026-10-05', 'mon'),
]

describe('searching on the Minyanim tab', () => {
  it('reads the tab’s own suggestions', () => {
    expect(readMinyanimSearch('mincha tonight')).toEqual({ tefillos: ['mincha', 'mincha_maariv'], named: true, when: null, nearMe: false, terms: [] })
    expect(readMinyanimSearch('shacharis tomorrow')).toMatchObject({ tefillos: ['shacharis'], when: { day: 'tomorrow' } })
    expect(readMinyanimSearch('Shabbos morning')).toMatchObject({ tefillos: ['shacharis', 'shabbos_mussaf'], named: false, when: { day: 'sat', label: 'Shabbos morning' } })
    expect(readMinyanimSearch('maariv near me')).toMatchObject({ tefillos: ['maariv', 'mincha_maariv'], nearMe: true, terms: [] })
    expect(readMinyanimSearch('  ')).toBeNull()
  })

  it('a day alone is a day here, with no tefillah word needed', () => {
    expect(readMinyanimSearch('shabbos')).toMatchObject({ tefillos: null, when: { day: 'sat' } })
    // Kabbalas Shabbos is Friday's.
    expect(readMinyanimSearch('kabbalas shabbos')).toMatchObject({ tefillos: ['kabbalas_shabbos'], when: { day: 'fri' } })
  })

  it('finds the day typed in the week', () => {
    const at = (q: string) => dayIndexFor(readMinyanimSearch(q)!.when, WEEK)
    expect(at('shacharis tomorrow')).toBe(1)
    expect(at('shabbos')).toBe(2)
    expect(at('hoshana rabbah')).toBe(1)
    expect(at('simchas torah night')).toBe(2)
    expect(at('monday')).toBe(4)
    expect(at('mincha')).toBe(-1)
    expect(at('pesach')).toBe(-1)
  })

  it('a shul by its name, denomination or address', () => {
    const mekor = makeListing({ id: 'm', name: 'Mekor Habracha', address: '1500 Walnut St' })
    expect(shulMatches(mekor, readMinyanimSearch('mekor')!.terms)).toBe(true)
    expect(shulMatches(mekor, readMinyanimSearch('orthodox')!.terms, 'Orthodox (Ashkenazi)')).toBe(true)
    expect(shulMatches(mekor, readMinyanimSearch('walnut')!.terms)).toBe(true)
    expect(shulMatches(mekor, readMinyanimSearch('kesher')!.terms)).toBe(false)
  })

  it('names what was asked', () => {
    expect(tefillosLabel(['mincha', 'mincha_maariv'])).toBe('Mincha')
    expect(tefillosLabel(['mincha_maariv'])).toBe('Mincha & Maariv')
    expect(tefillosLabel(null)).toBe('Minyanim')
  })
})
