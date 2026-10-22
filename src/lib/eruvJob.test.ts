import { describe, expect, it } from 'vitest'
import { eruvJobCounts, eruvStanding, findingFor, statusPill, updatesOf, websiteWatchOf, type EruvFinding } from './eruvJob'
import type { AdminEruv } from './eruvStore'
import type { Watch } from './watches'

// A Wednesday afternoon in Philadelphia.
const NOW = new Date('2026-10-21T18:00:00Z')
const TZ = 'America/New_York'
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString()

const BASE: AdminEruv = {
  id: 'lower-merion', name: 'Lower Merion Eruv', covers: 'Bala Cynwyd', website: 'https://lowermerioneruv.org/', hotline: '(610) 664-5626, option 3', alertsUrl: null,
  statusUrl: 'https://lowermerioneruv.org/', statusDated: false, status: 'up', statusWords: 'The eruv is up', statusPostedOn: null, statusCheckedAt: ago(1), statusErrorAt: null, statusError: null,
  lineUrl: null, sortOrder: 1, active: true, rawLine: null, lineReadAt: null, lineError: null, lineLeaveOut: [], lineHidePoints: false, lineMissing: [], lineColor: null,
  statusEmail: null, statusEmailKept: null,
}
const NO_SOURCE: AdminEruv = { ...BASE, id: 'northeast', name: 'Northeast Eruv', statusUrl: null, status: null, statusWords: null, statusCheckedAt: null }
const finding = (over: Partial<EruvFinding> = {}): EruvFinding => ({ id: 's1', eruvId: 'lower-merion', at: ago(2), hotline: '(610) 555-0199', alertsUrl: null, ...over })
const watch = (over: Partial<Watch> = {}) => ({ id: 'w1', url: 'https://lowermerioneruv.org/', active: true, lastError: null, ...over }) as Watch
const standing = (e: AdminEruv, f: EruvFinding | null = null, w: Watch | null = null) => eruvStanding(e, { finding: f, watch: w, now: NOW, timezone: TZ })

describe('its tab and pill', () => {
  it('an update from its website: To check, however its status reads', () => {
    expect(standing(BASE, finding())).toEqual({ tab: 'to_check', pill: { text: '1 update', tone: 'amber' } })
    expect(standing(NO_SOURCE, finding({ eruvId: 'northeast', alertsUrl: 'https://eepurl.com/x' }))).toMatchObject({ tab: 'to_check', pill: { text: '2 updates' } })
  })

  it('a finding that matches the listing is no update', () => {
    expect(standing(BASE, finding({ hotline: BASE.hotline }))).toMatchObject({ tab: 'checked' })
  })

  it('Can’t be read: no source, an email it couldn’t make out, or a page that didn’t load', () => {
    expect(standing(NO_SOURCE)).toEqual({ tab: 'cant_read', pill: { text: 'No status', tone: 'grey' } })
    const kept = { ...NO_SOURCE, statusEmail: 'eruv@groups.io', statusEmailKept: { messageId: 'm1', subject: 'Eruv', sentAt: ago(1), text: 'Hmm', words: 'Hmm' } }
    expect(standing(kept)).toMatchObject({ tab: 'cant_read', pill: { text: 'Email not read' } })
    expect(standing({ ...BASE, statusErrorAt: ago(0), statusError: '500' })).toMatchObject({ tab: 'cant_read', pill: { text: 'Status didn’t load' }, didntLoad: true })
    expect(standing({ ...BASE, lineUrl: 'https://maps/x.kml', lineError: 'The map answered 404' })).toMatchObject({ pill: { text: 'Map didn’t load' }, didntLoad: true })
    expect(standing(BASE, null, watch({ lastError: 'The page answered 503' }))).toMatchObject({ pill: { text: 'Website didn’t load' }, didntLoad: true })
  })

  it('a paused website that last failed is not a problem', () => {
    expect(standing(BASE, null, watch({ active: false, lastError: 'The page answered 503' }))).toMatchObject({ tab: 'checked' })
  })

  it('Checked: its status as visitors see it', () => {
    expect(standing(BASE)).toEqual({ tab: 'checked', pill: { text: 'Up', tone: 'green' } })
    expect(standing({ ...BASE, status: 'down' })).toMatchObject({ pill: { text: 'Down', tone: 'red' } })
  })
})

describe('the Status box’s pill', () => {
  it('No source; No word yet for an email eruv that has sent nothing', () => {
    expect(statusPill(NO_SOURCE, NOW, TZ)).toEqual({ text: 'No source', tone: 'grey' })
    expect(statusPill({ ...NO_SOURCE, statusEmail: 'eruv@groups.io', statusEmailed: true }, NOW, TZ)).toEqual({ text: 'No word yet', tone: 'grey' })
  })
})

describe('finding its pieces', () => {
  it('its website’s watch, however the address is written', () => {
    expect(websiteWatchOf({ website: 'http://www.lowermerioneruv.org' }, [watch()])).toMatchObject({ id: 'w1' })
    expect(websiteWatchOf({ website: null }, [watch()])).toBeNull()
  })

  it('its newest finding', () => {
    expect(findingFor([finding({ id: 'old', at: ago(9) }), finding({ id: 'new' }), finding({ id: 'other', eruvId: 'x', at: ago(0) })], 'lower-merion')?.id).toBe('new')
    expect(updatesOf(BASE, null)).toBe(0)
  })
})

it('the Watches tab’s counts come from the same standings', () => {
  const failing = { ...BASE, id: 'uc', website: null, statusErrorAt: ago(0) }
  const d = { eruvim: [BASE, NO_SOURCE, failing, { ...BASE, id: 'cc', website: null }], findings: [finding()], watches: [watch()], timezone: TZ }
  expect(eruvJobCounts(d, NOW)).toEqual({ checked: 1, toCheck: 1, cantRead: 1, didntLoad: 1 })
})
