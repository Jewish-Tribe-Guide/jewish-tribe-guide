import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import type { GooglePlace } from '@/lib/googleJob'
import { notBeingRead, waitingNotQueued } from './todoWaiting'
import { day } from './watchText'
import type { Jobs } from './useWatchJobs'

const NOW = Date.parse('2026-10-31T12:00:00Z')
const AT = '2026-10-31T07:48:00Z'

const place = (id: string, name: string, over: Partial<GooglePlace> = {}) =>
  ({ id, name, street: null, address: null, category: 'food', categoryLabel: 'Food', href: `/philly/food/${id}`, matched: true, section: 'checked', fields: [{ field: 'name', label: 'Name', value: name, by: { kind: 'google' } }], readAt: AT, failedAt: null, notOnGoogle: null, closure: null, compare: null, ...over }) as unknown as GooglePlace

const jobs = (over: Partial<Jobs> = {}): Jobs => ({
  categories: [makeCategory({ id: 'food', pluralLabel: 'Food', kind: 'listing' })] as never,
  google: { places: [] } as never,
  dishes: null, hospitals: null, hours: null, times: null, sites: null, eruvim: null, kosher: null, links: null,
  ...over,
})

const closure = { status: 'CLOSED_TEMPORARILY', shownOpen: false, since: AT, readAt: AT, kept: null }
const compare = { at: AT, rows: [{ field: 'phone', label: 'Phone', google: '610-555-0199', changed: true }] }

// The user, Oct 31: To do should show everything waiting on a decision.
// Rita's "Closed for now" was only on the three-tab page; a list's finding is
// a submission, so To do has it already and it mustn't count twice.
describe('what To do adds to the queue', () => {
  it('a closure and a change from Google, each under its kind, saying what it is', () => {
    const got = waitingNotQueued(jobs({ google: { places: [place('r', 'Rita’s', { closure } as never), place('c', 'Cherry Grill', { compare } as never), place('k', 'Kesher')] } as never }), NOW)
    expect(got.map((w) => w.id).sort()).toEqual(['c', 'r'])
    expect(got.find((w) => w.id === 'r')).toEqual({ id: 'r', name: 'Rita’s', kind: 'Food', line: `Closed for now, says Google · ${day(AT)}`, at: AT })
    // The user, Nov 3: dated though its line has no day, by when Google was
    // read, so it doesn't sink to the foot of To do.
    expect(got.find((w) => w.id === 'c')).toEqual({ id: 'c', name: 'Cherry Grill', kind: 'Food', line: 'Google has a change', at: AT })
  })

  it('leaves out what waits only in the queue', () => {
    const at = AT
    const finding = { id: 'f1', operation: 'update', targetId: 'g', name: 'GIANT', from: 'its website', says: 'Its page says', named: null, at, notes: [], page: 'https://giant.example/store', section: 'contact', values: { phone: '215-555-0199' }, lines: [{ key: 'phone', label: 'Phone', before: '215-555-0100', after: '215-555-0199' }] }
    const sites = { places: [{ id: 'g', name: 'GIANT', category: 'food', href: '/philly/food/g', pages: [], findings: [finding] }] }
    expect(waitingNotQueued(jobs({ google: { places: [place('g', 'GIANT')] } as never, sites: sites.places as never }), NOW)).toEqual([])
  })

  // Look again (board Found, Nov 3): what it found waits on To do.
  it('what Look again found: a status page, a place on Google; a menu read again is a reading', () => {
    const found = { placeId: 'P', name: 'The Kosher Grill', address: '3601 S Broad St', at: AT }
    const page = { url: 'https://yiep.org/eruv-status', status: 'up', words: 'The eruv is up', at: AT }
    const item = (kind: string, id: string, name: string, f: unknown) => ({ kind, id, name, why: '', note: null, lastTry: AT, found: f, stopped: null })
    const lookAgain = { available: true, leftOut: [], items: [item('eruv', 'ep', 'Elkins Park Eruv', page), item('google', 'kg', 'The Kosher Grill', found), item('google', 'r', 'Rita’s', found), item('google', 'x', 'Not yet', null)] }
    const got = waitingNotQueued(jobs({ google: { places: [place('r', 'Rita’s', { closure } as never)] } as never, lookAgain: lookAgain as never }), NOW)
    expect(got).toEqual([
      { id: 'r', name: 'Rita’s', kind: 'Food', line: `Closed for now, says Google · ${day(AT)}`, at: AT, found: true },
      { id: 'ep', name: 'Elkins Park Eruv', kind: 'Eruv', line: 'Status page found', at: AT, found: true },
      { id: 'kg', name: 'The Kosher Grill', kind: 'Google', line: 'Found on Google', at: AT, found: true },
    ])
  })

  it('counts nothing until every job has answered', () => {
    const j = jobs({ google: { places: [place('r', 'Rita’s', { closure } as never)] } as never })
    delete j.times
    expect(waitingNotQueued(j, NOW)).toEqual([])
  })
})

describe('notBeingRead (Todo10, EmailTodo12)', () => {
  const letter = (at: string) => ({ id: 'n', url: 'mailto:o@s.org', active: true, pageChangedAt: at, createdAt: at })
  const shul = (over = {}) => ({ id: 's', name: 'Bnai Abraham', href: '/s', pages: [], off: false, newsletters: [letter('2026-10-01T00:00:00Z')], ...over })

  it('a shul whose email has gone quiet for three weeks', () => {
    expect(notBeingRead(jobs({ times: { places: [shul()] } as never }), NOW)).toEqual([{ id: 's', name: 'Bnai Abraham', line: 'Their email came 4 weeks ago', since: ['2026-10-01T00:00:00Z'] }])
  })

  it('an email from this month isn’t quiet', () => {
    expect(notBeingRead(jobs({ times: { places: [shul({ newsletters: [letter('2026-10-20T00:00:00Z')] })] } as never }), NOW)).toEqual([])
  })

  it('a job turned off isn’t reported', () => {
    expect(notBeingRead(jobs({ runs: { kinds: [], off: ['newsletters'] } as never, times: { places: [shul()] } as never }), NOW)).toEqual([])
  })

  it('an eruv whose status emails have stopped', () => {
    const eruvim = { eruvim: [{ id: 'e', name: 'Center City Eruv', statusEmail: 'a@b.org', statusCheckedAt: '2026-10-01T00:00:00Z' }], findings: [], watches: [], timezone: 'America/New_York' }
    expect(notBeingRead(jobs({ eruvim: eruvim as never }), NOW)).toEqual([{ id: 'e', name: 'Center City Eruv', line: 'Their email came 4 weeks ago', since: ['2026-10-01T00:00:00Z'] }])
  })

  it('nothing until every job has answered', () => {
    expect(notBeingRead(jobs({ times: undefined as never }), NOW)).toEqual([])
  })

  // N1List, P1Every: every row is dated, a place with only a broken check
  // too, by when that check started failing.
  it('dates a website that didn’t load by its first failure', () => {
    const watch = { id: 'w', url: 'https://soi.example', active: true, lastRunAt: '2026-10-31T07:00:00Z', lastOkAt: '2026-10-20T07:00:00Z', failingSince: '2026-10-22T07:00:00Z', lastError: 'HTTP 503' }
    const got = notBeingRead(jobs({ times: { places: [shul({ newsletters: [], pages: [{ watch }] })] } as never }), NOW)
    expect(got).toEqual([{ id: 's', name: 'Bnai Abraham', line: 'Website didn’t load', since: ['2026-10-22T07:00:00Z'] }])
  })
})
