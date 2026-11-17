import { describe, expect, it } from 'vitest'
import { nameNight, nightHours, nightLine, nightRow, nightsFrom, nightTitle, nightWhen, type NightRun } from './validatedNights'

// Activity's nightly row and page (the user, Nov 17; boards W1-W3, X4-X5).
// Philadelphia: Google runs at 1 AM (06:00 UTC in winter), the watches at 2.
const TZ = 'America/New_York'
const google = (day: string, validated: string[], over: Partial<NightRun> = {}): NightRun => ({
  job: 'sync-hours',
  startedAt: `${day}T06:00:00.000Z`,
  finishedAt: `${day}T06:20:00.000Z`,
  kinds: { google: { of: 9, read: 9, validated } },
  ...over,
})
const watches = (day: string, kinds: NightRun['kinds']): NightRun => ({ job: 'watches', startedAt: `${day}T07:00:00.000Z`, finishedAt: `${day}T07:40:00.000Z`, kinds })

describe('nightsFrom', () => {
  it('a night per date where the community is, its two jobs together, newest first', () => {
    const nights = nightsFrom(
      [
        google('2026-11-16', ['g1']),
        watches('2026-11-17', { kosher: { of: 3, read: 3, validated: ['k1', 'k2'] } }),
        google('2026-11-17', ['g1', 'g2']),
      ],
      TZ,
    )
    expect(nights.map((n) => [n.key, n.at, n.until, n.groups])).toEqual([
      ['2026-11-17', '2026-11-17T06:00:00.000Z', '2026-11-17T07:40:00.000Z', [{ id: 'google', ids: ['g1', 'g2'] }, { id: 'kosher', ids: ['k1', 'k2'] }]],
      ['2026-11-16', '2026-11-16T06:00:00.000Z', '2026-11-16T06:20:00.000Z', [{ id: 'google', ids: ['g1'] }]],
    ])
  })

  it('a job run twice in a night counts its latest run', () => {
    const [night] = nightsFrom([google('2026-11-17', ['old']), google('2026-11-17', ['new'], { startedAt: '2026-11-17T15:00:00.000Z' })], TZ)
    expect(night.groups).toEqual([{ id: 'google', ids: ['new'] }])
  })

  it('a night that validated nothing has no row, nor do runs saved before Nov 17', () => {
    expect(nightsFrom([google('2026-11-17', []), { ...google('2026-11-16', []), kinds: { google: { of: 9, read: 9 } } }, { ...google('2026-11-15', []), kinds: null }], TZ)).toEqual([])
  })

  it('the menus’ first reads are the night’s too; the links’ runs aren’t validations', () => {
    const firstReads: NightRun = { job: 'read-menus', startedAt: '2026-11-17T07:30:00.000Z', finishedAt: '2026-11-17T07:35:00.000Z', kinds: { menus: { of: 3, read: 3, validated: ['new'] } } }
    const [night] = nightsFrom([watches('2026-11-17', { menus: { of: 9, read: 9, validated: ['old', 'new'] } }), firstReads], TZ)
    expect(night.groups).toEqual([{ id: 'menus', ids: ['old', 'new'] }])
    expect(night.until).toBe('2026-11-17T07:40:00.000Z')
    expect(nightsFrom([{ ...firstReads, kinds: { menus: { of: 3, read: 3, validated: ['new'] } } }], TZ).map((n) => n.key)).toEqual(['2026-11-17'])
    expect(nightsFrom([{ ...google('2026-11-17', ['g']), job: 'check-links' }], TZ)).toEqual([])
  })

  it('a listing whose page agreed in full isn’t listed again for its phone; one whose phone alone did is', () => {
    const [night] = nightsFrom([watches('2026-11-17', { times: { of: 2, read: 2, validated: ['s1'], contact: ['s2'] }, sites: { of: 1, read: 1, contact: ['s1'] } })], TZ)
    expect(night.groups).toEqual([
      { id: 'times', ids: ['s1'] },
      { id: 'contact', ids: ['s2'] },
    ])
  })
})

describe('a night named, and its row', () => {
  const [night] = nightsFrom(
    [google('2026-11-17', ['g1', 'g2', 'gone']), watches('2026-11-17', { times: { of: 2, read: 2, validated: ['s1'] }, hours: { of: 1, read: 1, validated: ['m1', 'g1'] }, hospitals: { of: 1, read: 1, validated: ['h1'] }, kosher: { of: 1, read: 1, validated: ['g1'] } })],
    TZ,
  )
  const names: Record<string, string> = { g1: 'Zevi’s Bakery', g2: 'ACME Markets', s1: 'BZBI', m1: 'Mikvah Ohel Leah', h1: 'Pennsylvania Hospital' }
  const named = nameNight(night, (id) => names[id])

  it('each group’s listings by name; one no longer live is dropped, so a count is of names shown', () => {
    expect(named.groups.map((g) => [g.title, g.places.map((p) => p.name)])).toEqual([
      ['Open or closed, against Google', ['ACME Markets', 'Zevi’s Bakery']],
      ['Shul times, against their websites', ['BZBI']],
      ['Hours, against their websites', ['Mikvah Ohel Leah', 'Zevi’s Bakery']],
      ['Hospitals, against Refuah', ['Pennsylvania Hospital']],
      ['Hechsher, against the kosher agencies’ lists', ['Zevi’s Bakery']],
    ])
  })

  it('the row counts listings, once each: Google’s, and their own websites’ (not Refuah’s or the agencies’)', () => {
    expect(nightRow(named)).toEqual({ key: '2026-11-17', at: '2026-11-17T06:00:00.000Z', google: 2, own: 3 })
    expect(nightLine({ google: 132, own: 119 })).toEqual(['132 against Google', '119 against their own websites'])
    expect(nightLine({ google: 0, own: 5 })).toEqual(['5 against their own websites'])
  })

  it('menus and eruv websites are groups of their own, and count as their own websites', () => {
    const [n] = nightsFrom([watches('2026-11-17', { menus: { of: 2, read: 2, validated: ['g1'] }, eruvs: { of: 1, read: 1, validated: ['lm'] } })], TZ)
    const both = nameNight(n, (id) => ({ g1: 'Zevi’s Bakery', lm: 'Lower Merion Eruv' })[id])
    expect(both.groups.map((g) => [g.title, g.places.map((p) => p.name)])).toEqual([
      ['Dishes, against their menus', ['Zevi’s Bakery']],
      ['Eruv hotlines and alerts, against their websites', ['Lower Merion Eruv']],
    ])
    expect(nightRow(both)).toMatchObject({ google: 0, own: 2 })
  })

  it('no row for a night with only the agencies’ or Refuah’s', () => {
    const [only] = nightsFrom([watches('2026-11-17', { kosher: { of: 1, read: 1, validated: ['g1'] } })], TZ)
    expect(nightRow(nameNight(only, (id) => names[id]))).toBeNull()
  })

  it('its title and time: last night, or the day its row is under', () => {
    const at = (iso: string) => Date.parse(iso)
    expect(nightTitle(night, at('2026-11-17T15:00:00Z'), TZ)).toBe('Validated last night')
    expect(nightTitle(night, at('2026-11-18T15:00:00Z'), TZ)).toBe('Validated yesterday')
    expect(nightTitle(night, at('2026-11-20T15:00:00Z'), TZ)).toBe('Validated Tuesday, Nov 17')
    // Before the visitor's clock is read: the date, never "last night".
    expect(nightTitle(night, 0, TZ)).toBe('Validated Tuesday, Nov 17')
    expect(nightWhen(night, at('2026-11-17T15:00:00Z'), TZ)).toBe('Today, 1–3 AM')
    expect(nightHours({ at: '2026-11-17T06:00:00Z', until: '2026-11-17T06:00:00Z' }, TZ)).toBe('1 AM')
    expect(nightHours({ at: '2026-11-17T04:30:00Z', until: '2026-11-17T06:10:00Z' }, TZ)).toBe('11 PM–2 AM')
  })
})
