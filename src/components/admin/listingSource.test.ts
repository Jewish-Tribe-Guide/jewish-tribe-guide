import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import type { EditorRow } from '@/lib/editorRows'
import { eruvSources, listingSources } from './listingSource'
import type { Jobs } from './useWatchJobs'
import { day } from './watchText'

const at = new Date(2026, 9, 20, 12).toISOString()
const now = new Date(2026, 10, 1, 12).getTime()
const fieldBy = (field: string, kind: string, extra = {}) => ({ field, label: field, value: 'x', by: { kind, ...extra } })
const google = (fields: unknown[], matched = true) => ({ counts: {}, places: [{ id: 'a', name: 'A', street: null, address: null, category: 'food', categoryLabel: 'Food', href: '/x', matched, section: 'checked', fields, readAt: at, failedAt: null, notOnGoogle: null, closure: null, compare: null }] })
const jobs = (over: Partial<Jobs>): Jobs => ({ runs: { kinds: [], off: [] }, ...over }) as unknown as Jobs
const row = (over: Partial<EditorRow>): EditorRow => ({ id: 'x', title: 'x', kind: 'fields', fields: [], ...over })
const fieldRow = (key: string, type: string, extra = {}) => row({ id: `field:${key}`, fields: [{ key, label: key, type, ...extra }] as never })
const phone = row({ id: 'contact:phone', kind: 'contact', part: 'phone' })
const hours = fieldRow('hours', 'hours')
const website = fieldRow('website', 'url')
const email = fieldRow('email', 'text')
const whatsapp = fieldRow('whatsapp', 'url')
const food = makeCategory({ id: 'food', detailFields: [{ key: 'website', label: 'Website', type: 'url' }, { key: 'email', label: 'Email', type: 'text' }] as never })
const listing = { id: 'a', email: 'a@b.co' }
const sourceOf = (j: Jobs, r: EditorRow, category = food) => listingSources('a', j, now, category, listing)(r)
const page = { id: 'w', url: 'https://a.example/', active: true, lastRunAt: at, lastOkAt: at, lastError: null, failingSince: null, createdAt: at, lastCheck: null }

describe('a listing row’s job (Listing6, States6, GoogleListing7)', () => {
  it('Google keeps a field: its name, the day, and Stop', () => {
    const got = sourceOf(jobs({ google: google([fieldBy('phone', 'google')]) as never }), phone)
    expect(got).toMatchObject({ job: 'Google', amber: false, line: { text: 'Google', when: day(at), googleStop: 'phone' } })
    expect(got?.line.change).toBeUndefined()
  })

  it('Google off for a field that nothing else reads: Nothing, amber, Use Google’s', () => {
    const got = sourceOf(jobs({ google: google([fieldBy('hours', 'nothing')]) as never }), hours)
    expect(got).toMatchObject({ job: 'Nothing', amber: true, line: { text: 'Nothing reads this', useGoogle: 'hours' } })
  })

  it('a food place’s plain hours are Google’s, not its website’s (FoodListing12)', () => {
    const plain = makeCategory({ id: 'food', detailFields: [{ key: 'hours', label: 'Hours', type: 'hours' }] })
    const got = sourceOf(jobs({ google: google([fieldBy('hours', 'google')]) as never }), hours, plain)
    expect(got).toMatchObject({ job: 'Google', line: { text: 'Google', googleStop: 'hours' } })
  })

  it('the Google job turned off: nothing keeps it, and it doesn’t offer Stop', () => {
    const got = sourceOf(jobs({ runs: { kinds: [], off: ['google'] } as never, google: google([fieldBy('phone', 'google')]) as never }), phone)
    expect(got?.job).toBe('Nothing')
    expect(got?.line.googleStop).toBeUndefined()
  })

  it('a field Google stopped keeping, read off its website: the Website job', () => {
    const sites = [{ id: 'a', pages: [{ watch: page }] }]
    const got = sourceOf(jobs({ google: google([fieldBy('phone', 'website', { at })]) as never, sites: sites as never }), phone)
    expect(got).toMatchObject({ job: 'Website', amber: false, line: { text: 'Its website', when: day(at) } })
  })

  it('a website kept by the link check: Links, with no control', () => {
    const got = sourceOf(jobs({ google: google([fieldBy('website', 'links', { at })]) as never }), website)
    expect(got).toMatchObject({ job: 'Link check', line: { text: 'Link check', when: day(at) } })
    expect(got?.line.change).toBeUndefined()
    expect(got?.line.googleStop).toBeUndefined()
  })

  it('an email: Website when a page is read, else Nothing', () => {
    expect(sourceOf(jobs({ sites: [{ id: 'a', pages: [{ watch: page }] }] as never }), email)?.job).toBe('Website')
    expect(sourceOf(jobs({}), email)).toMatchObject({ job: 'Nothing', amber: true })
  })

  it('a link nothing can read: Nothing, with no control', () => {
    const got = sourceOf(jobs({}), whatsapp)
    expect(got).toMatchObject({ job: 'Nothing', amber: true, line: { text: 'Nothing reads this' } })
    expect(got?.line.add).toBeUndefined()
  })

  it('a week read from both: Website, Email, one line each, the email first', () => {
    const news = { id: 'n', url: 'mailto:office@a.example', active: true, pageChangedAt: at }
    const times = { places: [{ id: 'a', pages: [{ watch: page }], newsletters: [news], stopped: [] }] }
    const got = sourceOf(jobs({ times: times as never }), row({ id: 'minyans:this_week', kind: 'minyans' }))
    expect(got).toMatchObject({ job: 'Website, Email', amber: false, line: { text: 'Its email', when: day(at) }, also: { url: page.url } })
  })

  it('a week read only from its email: Email', () => {
    const news = { id: 'n', url: 'mailto:office@a.example', active: true, pageChangedAt: at }
    const times = { places: [{ id: 'a', pages: [], newsletters: [news], stopped: [] }] }
    const got = sourceOf(jobs({ times: times as never }), row({ id: 'minyans:this_week', kind: 'minyans' }))
    expect(got).toMatchObject({ job: 'Email', line: { text: 'Its email' } })
    expect(got?.also).toBeUndefined()
  })

  it('a row like it no job reads has no job at all', () => {
    expect(sourceOf(jobs({}), row({ id: 'contact:address', kind: 'contact', part: 'address' }))).toBeNull()
  })

  it('a menu: Menus, from its menu’s page, with Change', () => {
    const dishes = [{ id: 'a', dishes: [], menuUrl: 'https://a.example/menu', reading: { status: 'approved', readAt: at, sourceUrl: 'https://a.example/menu', dishes: [] } }]
    const items = row({ id: 'items', kind: 'items', fields: [{ key: 'd', label: 'd', type: 'tags', countLabel: 'dish' }] as never })
    const got = sourceOf(jobs({ dishes: dishes as never }), items)
    expect(got?.job).toBe('Website')
    expect(got?.line.change?.value).toBe('https://a.example/menu')
  })

  it('a menu with its job turned off: Nothing, though its link is there', () => {
    const dishes = [{ id: 'a', dishes: [], menuUrl: 'https://a.example/menu', reading: null }]
    const items = row({ id: 'items', kind: 'items', fields: [{ key: 'd', label: 'd', type: 'tags', countLabel: 'dish' }] as never })
    expect(sourceOf(jobs({ dishes: dishes as never, runs: { kinds: [], off: ['menus'] } as never }), items)?.job).toBe('Nothing')
  })
})

describe('an eruv’s rows (EruvListing6)', () => {
  const eruv = { id: 'lm', name: 'LM', website: 'https://lm.org/', statusUrl: 'https://lm.org/status', status: 'up', statusWords: 'Up', statusCheckedAt: at, statusEmail: null, statusEmailKept: null, lineUrl: 'https://lm.org/m.kml', lineReadAt: at, lineError: null, active: true, statusDated: false, hotline: null, alertsUrl: null, covers: null, statusPostedOn: null, statusErrorAt: null, statusError: null }
  const watch = { id: 'w-lm', kind: 'website', url: 'https://lm.org/', resourceId: null, active: true, lastRunAt: at, lastOkAt: at, lastError: null, failingSince: null, createdAt: at, lastCheck: null, createdBy: 'eruv website' }
  const eruvJobs = (over = {}, w: unknown = watch) => jobs({ eruvim: { available: true, timezone: 'America/New_York', eruvim: [{ ...eruv, ...over }], findings: [], watches: [w] } as never })

  it('everything is the Eruvs job’s but its Website', () => {
    const got = eruvSources('lm', eruvJobs(), now)
    expect([got.status.job, got.map.job, got.details.job, got.website.job]).toEqual(['Website', 'Website', 'Website', 'Nothing'])
    expect(got.website.amber).toBe(true)
    expect(got.website.line.add).toBeUndefined()
    expect(got.status.line.text).toBe('Its status page')
    expect(got.map.line.text).toBe('Its map')
    expect(got.details.line).toMatchObject({ text: 'Its website', when: day(at), change: { act: { kind: 'eruv-website', id: 'lm' } } })
  })

  it('no map: Nothing, with Add a source', () => {
    const got = eruvSources('lm', eruvJobs({ lineUrl: null }), now)
    expect(got.map).toMatchObject({ job: 'Nothing', amber: true, line: { add: { run: { kind: 'eruv-map', id: 'lm' } } } })
  })

  it('its website’s read paused: Stopped, with Start reading', () => {
    expect(eruvSources('lm', eruvJobs({}, { ...watch, active: false }), now).details).toMatchObject({ job: 'Stopped', amber: true, line: { start: { value: 'https://lm.org/' } } })
  })

  it('the Eruvs job turned off: all Nothing', () => {
    const j = { ...eruvJobs(), runs: { kinds: [], off: ['eruvs'] } } as never
    const got = eruvSources('lm', j, now)
    expect([got.status.job, got.map.job, got.details.job]).toEqual(['Nothing', 'Nothing', 'Nothing'])
  })
})
