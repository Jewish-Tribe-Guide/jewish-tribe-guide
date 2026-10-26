import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import { waitingGroups } from './waitingGroups'
import type { Jobs } from './useWatchJobs'
import type { Watch, WatchCheck } from '@/lib/watches'
import type { GooglePlace } from '@/lib/googleJob'
import type { Minyan } from '@/lib/davening'
import type { Finding } from '@/lib/watchFindings'

const NOW = Date.parse('2026-10-25T12:00:00Z')
const AT = '2026-10-25T07:48:00Z'

const check = (over: Partial<WatchCheck> = {}): WatchCheck => ({ at: AT, what: 'times', from: 'page', result: 'agrees', read: [], differences: [], queue: null, ...over })
const watch = (id: string, url: string, over: Partial<Watch> = {}): Watch => ({
  id,
  communityId: 'philly',
  kind: 'website',
  url,
  resourceId: 'p',
  label: null,
  active: true,
  createdAt: AT,
  createdBy: null,
  lastRunAt: AT,
  lastOkAt: AT,
  lastError: null,
  failingSince: null,
  lastFiled: null,
  pageHash: 'h',
  pageChangedAt: null,
  lastCheck: check(),
  ...over,
})
const minyan = (id: string, tefillah: Minyan['tefillah'], days: Minyan['days'], time: string): Minyan => ({ id, tefillah, days, time })
const google = (over: Partial<GooglePlace> = {}): GooglePlace => ({
  id: 'p',
  name: 'Mekor Habracha',
  street: null,
  address: null,
  category: 'synagogue',
  categoryLabel: 'Synagogues',
  href: '/philly/synagogue/mekor',
  matched: true,
  section: 'checked',
  fields: [
    { field: 'name', label: 'Name', value: 'Mekor Habracha', by: { kind: 'google' } },
    { field: 'phone', label: 'Phone', value: '(215) 525-4246', by: { kind: 'google' } },
    { field: 'website', label: 'Website', value: 'https://mekorhabracha.org/', by: { kind: 'google' } },
  ],
  readAt: '2026-10-19T08:00:00Z',
  failedAt: null,
  notOnGoogle: null,
  closure: null,
  compare: null,
  ...over,
})
const finding = (over: Partial<Finding> = {}): Finding => ({ id: 'f1', operation: 'update', targetId: 'p', name: 'Mekor Habracha', from: 'its website', says: 'Its page says', named: null, at: AT, notes: [], lines: [], ...over })
const counts = { checked: 0, toCheck: 0, cantRead: 0, didntLoad: 0 }
const jobs = (over: Jobs): Jobs => ({ categories: [], dishes: [], hospitals: [], hours: { name: 'Mikvah hours', places: [] }, times: { name: 'Shul times', places: [] }, eruvim: null, kosher: null, google: { counts, places: [] }, ...over })

// As dev's restaurants are set up, their hechsher alone.
const restaurant = (certs: string[]) =>
  makeCategory({
    id: 'restaurant',
    detailFields: [{ key: 'kosherCert', label: 'Kosher Certification', type: 'select', renderAs: 'badge', caveat: { flagField: 'kosherPartial', noteField: 'kosherNote' }, options: certs.map((v) => ({ label: v, value: v })) }],
  } as never)

const WEEKDAY = [minyan('a', 'shacharis', ['mon', 'tue', 'wed', 'thu', 'fri'], '6:45 AM')]
const shul = (findings: Finding[]) => ({
  id: 'p',
  name: 'Mekor Habracha',
  href: '/philly/synagogue/mekor',
  website: 'https://mekorhabracha.org',
  pages: [{ watch: watch('w1', 'https://mekorhabracha.org/davening', { lastCheck: check({ parts: [{ part: 'weekday', size: 1 }, { part: 'shabbos', size: 1 }] }) }) }],
  off: false,
  offSince: null,
  reason: null,
  fields: ['Minyanim'],
  times: { key: 'minyanim', minyanim: [...WEEKDAY, minyan('b', 'shacharis', ['sat'], '9:15 AM')], schedules: [] },
  findings,
})

describe('waitingGroups', () => {
  it('groups a shul’s changes by where they came from, and lists the rest up to date', () => {
    const times = finding({
      page: 'https://mekorhabracha.org/davening',
      part: 'weekday',
      times: { field: {} as never, current: WEEKDAY, proposed: [minyan('a', 'shacharis', ['mon', 'tue', 'wed', 'thu', 'fri'], '6:30 AM')], currentSchedules: [], proposedSchedules: [] },
    })
    const g = google({ compare: { at: '2026-10-24T08:00:00Z', rows: [{ field: 'phone', label: 'Phone', google: '(215) 525-4247', changed: true }, { field: 'name', label: 'Name', google: 'Mekor Habracha', changed: false }] } })
    const w = waitingGroups('p', jobs({ times: { name: 'Shul times', places: [shul([times]) as never] }, google: { counts, places: [g] } }), NOW)
    expect(w.groups.map((x) => [x.key, x.page?.text, x.when])).toEqual([
      ['times:https://mekorhabracha.org/davening', 'mekorhabracha.org/davening', 'Oct 25'],
      ['google', 'its Google listing', 'Oct 24'],
    ])
    expect(w.groups[0].lines).toEqual([{ label: 'Shacharis · Mon–Fri', value: '6:30 AM', old: '6:45 AM' }])
    expect(w.groups[0].decide).toEqual({ kind: 'findings', ids: ['f1'] })
    expect(w.groups[1].lines).toEqual([{ label: 'Phone', value: '(215) 525-4247', old: '(215) 525-4246' }])
    expect(w.groups[1].decide).toEqual({ kind: 'google' })
    // Its weekday times and its phone are in the groups; the rest is up to date.
    expect(w.checked.map((l) => l.label)).toEqual(['Usual Shabbos times', 'Name', 'Website'])
  })

  // Oct 25 (the user): "grocery should go to grocery". A grocery's own
  // website, read for the phone Google doesn't have, waits here.
  it('a grocery’s website finding: its page, what it would change, Accept or Keep as is', () => {
    const phone = finding({ name: 'GIANT', page: 'https://giantfoodstores.com/stores/1', section: 'contact', lines: [{ key: 'phone', label: 'Phone', before: '(215) 555-0100', after: '(215) 555-0199' }] as never })
    const store = { id: 'p', name: 'GIANT', category: 'grocery', href: '/philly/grocery/giant', pages: [{ watch: watch('w1', 'https://giantfoodstores.com/stores/1') }], findings: [phone] }
    const w = waitingGroups('p', jobs({ sites: [store], google: { counts, places: [google({ name: 'GIANT', category: 'grocery' })] } }), NOW)
    expect(w.groups.map((x) => [x.key, x.job, x.page?.text, x.when])).toEqual([['sites:https://giantfoodstores.com/stores/1', 'sites', 'giantfoodstores.com/stores/1', 'Oct 25']])
    expect(w.groups[0].lines).toEqual([{ label: 'Phone', value: '(215) 555-0199', old: '(215) 555-0100' }])
    expect(w.groups[0].decide).toEqual({ kind: 'findings', ids: ['f1'] })
  })

  it('puts off a list first, then Google’s closure, then the changes', () => {
    const off = finding({ id: 'k1', operation: 'delete', from: 'Keystone-K’s list', name: 'Stephen’s Cafe' })
    const hours = finding({ id: 'h1', page: 'https://stephens.example/hours', lines: [{ key: 'hours', label: 'Hours', before: 'Sun–Thu 11 AM–9 PM', after: 'Sun–Thu 11 AM–10 PM', choosable: true }] })
    const kosher = {
      available: true,
      categories: [restaurant(['Keystone-K'])],
      lists: [{ list: 'keystone' as const, url: 'https://keystonek.example/list', watch: null, error: null, entries: 1, updated: null }],
      counts: { ...counts, notListed: 0 },
      places: [{ id: 'p', name: 'Stephen’s Cafe', category: 'restaurant', certs: ['Keystone-K'], levels: [], on: [], differences: [], href: '/x', box: { kosherCert: ['Keystone-K'] }, findings: [off] }],
      newPlaces: [],
    }
    const g = google({
      name: 'Stephen’s Cafe',
      fields: [{ field: 'website', label: 'Website', value: 'https://stephens.example/home', by: { kind: 'google' } }],
      closure: { status: 'CLOSED_TEMPORARILY', shownOpen: false, since: '2026-10-12T08:00:00Z', readAt: '2026-10-25T06:00:00Z', kept: null },
    })
    const mikvah = { id: 'p', name: 'Stephen’s Cafe', href: '/x', website: null, pages: [], off: false, offSince: null, reason: null, fields: [], findings: [hours] }
    const w = waitingGroups('p', jobs({ kosher: kosher as never, google: { counts, places: [g] }, hours: { name: 'Mikvah hours', places: [mikvah as never] } }), NOW)
    expect(w.groups.map((x) => x.key)).toEqual(['off:k1', 'closure', 'hours:https://stephens.example/hours'])
    const [o, c, h] = w.groups
    expect(o.lines).toEqual([{ label: 'Hechsher', value: 'None', old: 'Keystone-K' }])
    expect(o.page).toEqual({ text: 'Keystone-K’s list', url: 'https://keystonek.example/list' })
    expect(o.decide).toEqual({ kind: 'off', id: 'k1' })
    // A website by its address alone, as drawn.
    expect(o.facts).toEqual([
      { label: 'Its website', value: 'stephens.example', url: 'https://stephens.example/home' },
      { label: 'Google', value: 'Closed for now' },
    ])
    expect(c.lines).toEqual([{ label: 'Open or closed', value: 'Closed for now', old: 'Open' }])
    expect(c.facts[0]).toEqual({ label: 'On the site', value: 'Shown closed since Oct 12' })
    expect(c.decide).toEqual({ kind: 'closure' })
    expect(h.lines).toEqual([{ label: 'Hours', value: 'Sun–Thu 11 AM–10 PM', old: 'Sun–Thu 11 AM–9 PM' }])
  })

  it('a hechsher change that leaves others takes only the box’s keys', () => {
    const off = finding({ id: 'k1', operation: 'delete', from: 'Keystone-K’s list' })
    const kosher = {
      available: true,
      categories: [restaurant(['IKC', 'Keystone-K'])],
      lists: [],
      counts: { ...counts, notListed: 0 },
      places: [{ id: 'p', name: 'Cafe', category: 'restaurant', certs: [], levels: [], on: [], differences: [], href: '/x', box: { kosherCert: ['IKC', 'Keystone-K'] }, findings: [off] }],
      newPlaces: [],
    }
    const [g] = waitingGroups('p', jobs({ kosher: kosher as never }), NOW).groups
    expect(g.lines).toEqual([{ label: 'Hechsher', value: 'IKC', old: 'IKC, Keystone-K' }])
    expect(g.decide).toEqual({ kind: 'findings', ids: ['k1'], only: { k1: ['kosherCert'] } })
  })

  it('a place only a list has: what it would add, and the archived one it may be', () => {
    const lines = [
      { key: 'name', label: 'Name', before: '—', after: 'Rita’s', choosable: false },
      { key: 'website', label: 'Website', before: '—', after: 'https://www.ritas.example/', choosable: false },
      { key: 'kosherCert', label: 'Kosher Certification', before: '—', after: 'Keystone-K', choosable: false },
    ]
    const f = { ...finding({ id: 'n1', operation: 'create', targetId: null, from: 'Mekor Habracha’s list', name: 'Rita’s', lines, values: { kosherCert: ['Keystone-K'] } }), address: '1 Main St', category: 'restaurant' }
    const kosher = {
      available: true,
      categories: [restaurant(['Keystone-K'])],
      lists: [{ list: 'mekor' as const, url: 'https://mekor.example/list', watch: null, error: null, entries: 1, updated: null }],
      counts: { ...counts, notListed: 0 },
      places: [],
      newPlaces: [{ name: 'Rita’s', address: '1 Main St', on: [], archived: 'Rita’s Water Ice', filed: 'queued', findings: [f] }],
    }
    const w = waitingGroups('new:Rita’s', jobs({ kosher: kosher as never }), NOW)
    expect(w.groups).toHaveLength(1)
    expect(w.groups[0]).toMatchObject({
      key: 'new',
      page: { text: 'Mekor Habracha’s list', url: 'https://mekor.example/list' },
      // Its name is the heading; its hechsher as its Kosher box names it.
      lines: [
        { label: 'Address', value: '1 Main St', old: null },
        { label: 'Website', value: 'ritas.example', old: null },
        { label: 'Hechsher', value: 'Keystone-K', old: null },
      ],
      facts: [{ label: 'In the guide', value: 'Archived, as “Rita’s Water Ice”' }],
      decide: { kind: 'new', id: 'n1' },
    })
    expect(w.checked).toEqual([])
  })

  it('a list’s new place not filed yet: what the list has, and when it will be', () => {
    const kosher = {
      available: true,
      lists: [{ list: 'mekor' as const, url: 'https://mekor.example/list', watch: null, error: null, entries: 1, updated: null }],
      counts: { ...counts, notListed: 0 },
      places: [],
      newPlaces: [{ name: 'Z Candy Bar', address: '2 Main St', on: [{ list: 'mekor' as const, name: 'Z Candy Bar', url: '', says: '' }], archived: null, filed: 'next' }],
    }
    const [g] = waitingGroups('new:Z Candy Bar', jobs({ kosher: kosher as never }), NOW).groups
    expect(g).toMatchObject({
      page: { text: 'Mekor Habracha’s list', url: 'https://mekor.example/list' },
      lines: [{ label: 'Address', value: '2 Main St', old: null }],
      note: 'Suggested after tomorrow morning’s read, if Google says it’s open.',
      decide: { kind: 'later' },
    })
  })

  it('an eruv’s details from its website, taking only what changes', () => {
    const eruv = { id: 'p', name: 'Lower Merion', website: 'https://eruv.example', hotline: '610-555-0100', alertsUrl: null }
    const eruvim = { eruvim: [eruv], findings: [{ id: 'e1', eruvId: 'p', at: AT, hotline: '610-555-0199', alertsUrl: 'https://eruv.example/alerts' }], watches: [], timezone: 'America/New_York' }
    const [g] = waitingGroups('p', jobs({ eruvim: eruvim as never }), NOW).groups
    expect(g.page).toEqual({ text: 'eruv.example', url: 'https://eruv.example' })
    expect(g.lines.map((l) => [l.value, l.old])).toEqual([
      ['610-555-0199', '610-555-0100'],
      ['eruv.example/alerts', null],
    ])
    expect(g.decide).toEqual({ kind: 'findings', ids: ['e1'], only: { e1: ['hotline', 'alertsUrl'] } })
  })
})
