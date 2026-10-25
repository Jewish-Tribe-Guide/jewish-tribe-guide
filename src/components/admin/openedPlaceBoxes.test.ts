import { describe, expect, it } from 'vitest'
import { openedPlace } from './openedPlaceBoxes'
import type { Jobs } from './useWatchJobs'
import type { Watch, WatchCheck } from '@/lib/watches'
import type { GooglePlace } from '@/lib/googleJob'
import type { Minyan } from '@/lib/davening'

const NOW = Date.parse('2026-10-25T12:00:00Z')
const AT = '2026-10-23T08:00:00Z'

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
    { field: 'website', label: 'Website', value: 'http://www.ccshul.com/', by: { kind: 'google' } },
  ],
  readAt: '2026-10-19T08:00:00Z',
  failedAt: null,
  notOnGoogle: null,
  closure: null,
  compare: null,
  ...over,
})
const shul = (over: Record<string, unknown> = {}) => ({
  id: 'p',
  name: 'Mekor Habracha',
  href: '/philly/synagogue/mekor',
  website: 'https://mekorhabracha.org',
  pages: [{ watch: watch('w1', 'https://mekorhabracha.org/davening', { lastCheck: check({ parts: [{ part: 'weekday', size: 2 }, { part: 'shabbos', size: 1 }] }) }) }],
  off: false,
  offSince: null,
  reason: null,
  fields: ['Minyanim'],
  times: { key: 'minyanim', minyanim: [minyan('a', 'shacharis', ['mon', 'tue', 'wed', 'thu', 'fri'], '6:45 AM'), minyan('b', 'shacharis', ['sat'], '9:15 AM')], schedules: [] },
  ...over,
})
const jobs = (over: Jobs): Jobs => ({ categories: [], dishes: [], hospitals: [], hours: { name: 'Mikvah hours', places: [] }, times: { name: 'Shul times', places: [] }, eruvim: null, kosher: null, google: { counts: { checked: 0, toCheck: 0, cantRead: 0, didntLoad: 0 }, places: [] }, ...over })
const foot = (o: ReturnType<typeof openedPlace>, key: string) => o.boxes.find((b) => b.key === key)?.foot

describe('openedPlace', () => {
  it('opens a shul in boxes: its times from the page that gives them, its contact from Google', () => {
    const o = openedPlace('p', jobs({ times: { name: 'Shul times', places: [shul() as never] }, google: { counts: { checked: 1, toCheck: 0, cantRead: 0, didntLoad: 0 }, places: [google()] } }), NOW)
    expect(o.boxes.map((b) => b.title)).toEqual(['Usual weekday times', 'Usual Shabbos times', 'Name and contact'])
    expect(foot(o, 'weekday')).toEqual({ lead: 'Same as', links: [{ text: 'mekorhabracha.org/davening', url: 'https://mekorhabracha.org/davening' }], when: 'read Oct 23', change: { kind: 'page', job: 'times', replaces: 'w1' } })
    // Google's has no Change: Google is matched, not given.
    expect(foot(o, 'google')).toEqual({ lead: 'Same as', links: [{ text: 'its Google listing', url: null }], when: 'read Oct 19' })
    const rows = o.boxes.find((b) => b.key === 'google')!
    expect(rows.kind === 'rows' && rows.groups[0].rows.at(-1)).toEqual({ name: 'Website', right: 'ccshul.com' })
    expect(o.reads).toEqual([{ job: 'times', resourceId: 'p' }])
    expect(o.pages).toBe(1)
    expect(o.add).toEqual({ job: 'times', email: true, label: 'A web page, or the email its newsletter comes from' })
  })

  it('shows this week’s from its newsletter, and has nothing to read now with only Google and a newsletter', () => {
    const news = watch('n1', 'mailto:admin@mekorhabracha.org', { pageChangedAt: '2026-10-25T07:48:00Z', lastCheck: null })
    const week = { id: 's', name: 'Week', from: '2026-10-23', to: '2026-10-30', mode: 'add' as const, kind: 'week' as const, minyanim: [{ id: 'm', tefillah: 'shacharis' as const, on: ['2026-10-24'], time: '9:15 AM' }] }
    const place = shul({ pages: [], newsletters: [news], times: { key: 'minyanim', minyanim: [], schedules: [week] } })
    const o = openedPlace('p', jobs({ times: { name: 'Shul times', places: [place as never] } }), NOW)
    expect(o.boxes.map((b) => b.title)).toEqual(['This week’s schedule, Oct 23–30'])
    expect(foot(o, o.boxes[0].key)).toMatchObject({ mail: true, links: [{ text: 'its newsletter, admin@mekorhabracha.org', url: null }], when: 'read Oct 25', change: { kind: 'newsletter', replaces: 'n1' } })
    expect(o.pages).toBe(0)
  })

  it('opens a food place: its dishes from its menu, its hechsher from the lists, its hours from Google', () => {
    const dishes = [{ id: 'p', name: 'Cherry Grill', href: '/x', dishes: ['Schnitzel', 'Steak'], sometimes: ['Steak'], website: 'https://cherrygrill88.com', menuUrl: 'https://cherrygrill88.com/menu', reading: { status: 'approved' as const, readAt: '2026-10-20T08:00:00Z', sourceUrl: 'https://cherrygrill88.com/menu' } }]
    const kosher = {
      available: true,
      lists: [{ list: 'keystone' as const, url: 'https://keystonek.example/list', watch: watch('k', 'https://keystonek.example/list', { lastOkAt: '2026-10-24T07:47:00Z' }), error: null, entries: 1, updated: null }],
      counts: { checked: 1, toCheck: 0, cantRead: 0, didntLoad: 0, notListed: 0 },
      places: [{ id: 'p', name: 'Cherry Grill', category: 'restaurant', certs: ['Keystone-K'], levels: [], on: [{ list: 'keystone' as const, name: 'Cherry Grill', url: '', says: '' }], differences: [], href: '/x' }],
      newPlaces: [],
    }
    const g = google({ fields: [{ field: 'hours', label: 'Hours', value: 'Sun 12–9 PM', by: { kind: 'google' } }] })
    const o = openedPlace('p', jobs({ dishes, kosher, google: { counts: { checked: 1, toCheck: 0, cantRead: 0, didntLoad: 0 }, places: [g] } }), NOW)
    expect(o.boxes.map((b) => b.title)).toEqual(['Dishes', 'Kosher', 'Hours and contact'])
    const d = o.boxes[0]
    expect(d.kind === 'rows' && d.groups[0].rows).toEqual([{ name: 'Schnitzel' }, { name: 'Steak', sub: 'Not always' }])
    expect(d.foot).toEqual({ lead: 'Same as', links: [{ text: 'its menu', url: 'https://cherrygrill88.com/menu' }], when: 'read Oct 20', change: { kind: 'menu' } })
    expect(foot(o, 'kosher')).toEqual({ lead: 'Same as', links: [{ text: 'Keystone-K’s list', url: 'https://keystonek.example/list' }], when: 'read Oct 24' })
    expect(o.reads).toEqual([{ job: 'dishes', resourceId: 'p' }])
    // It has a menu link, changed on its Dishes box: nothing to add.
    expect(o.add).toBeNull()
  })

  it('offers a menu page to a food place with none', () => {
    const dishes = [{ id: 'p', name: 'Joy Cafe', href: '/x', dishes: [], website: 'https://joy.example', menuUrl: null, reading: null }]
    expect(openedPlace('p', jobs({ dishes }), NOW).add).toEqual({ job: 'dishes', email: false, label: 'Its menu page' })
  })

  it('opens a hospital in its listing’s boxes, from Refuah', () => {
    const w = watch('r', 'https://refuah.com/hospitals/12')
    const hospitals = [{ id: 'p', name: 'CHOP', href: '/x', watch: w, notOnRefuah: false, source: 'match' as const, line: '', refuah: null, nearby: [], boxes: [{ title: 'Bikur Cholim', keys: ['bikur'], labels: ['Bikur Cholim'], now: { bikur: [] } }] }]
    const o = openedPlace('p', jobs({ hospitals }), NOW)
    expect(o.boxes.map((b) => [b.title, b.kind])).toEqual([['Bikur Cholim', 'people']])
    expect(o.boxes[0].foot).toEqual({ lead: 'Same as', links: [{ text: 'Refuah', url: 'https://refuah.com/hospitals/12' }], when: 'read Oct 23', change: { kind: 'refuah' } })
    expect(o.reads).toEqual([{ job: 'refuah', watchId: 'r' }])
    expect(o.pages).toBe(1)
  })
})
