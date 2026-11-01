import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import type { GooglePlace } from '@/lib/googleJob'
import { waitingNotQueued } from './todoWaiting'
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
    expect(got.find((w) => w.id === 'r')).toEqual({ id: 'r', name: 'Rita’s', kind: 'Food', line: `Closed for now, says Google · ${day(AT)}` })
    expect(got.find((w) => w.id === 'c')).toEqual({ id: 'c', name: 'Cherry Grill', kind: 'Food', line: 'Google has a change' })
  })

  it('leaves out what waits only in the queue', () => {
    const at = AT
    const finding = { id: 'f1', operation: 'update', targetId: 'g', name: 'GIANT', from: 'its website', says: 'Its page says', named: null, at, notes: [], page: 'https://giant.example/store', section: 'contact', values: { phone: '215-555-0199' }, lines: [{ key: 'phone', label: 'Phone', before: '215-555-0100', after: '215-555-0199' }] }
    const sites = { places: [{ id: 'g', name: 'GIANT', category: 'food', href: '/philly/food/g', pages: [], findings: [finding] }] }
    expect(waitingNotQueued(jobs({ google: { places: [place('g', 'GIANT')] } as never, sites: sites.places as never }), NOW)).toEqual([])
  })

  it('counts nothing until every job has answered', () => {
    const j = jobs({ google: { places: [place('r', 'Rita’s', { closure } as never)] } as never })
    delete j.times
    expect(waitingNotQueued(j, NOW)).toEqual([])
  })
})
