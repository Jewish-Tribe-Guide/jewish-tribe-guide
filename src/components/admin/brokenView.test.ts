import { describe, expect, it } from 'vitest'
import { brokenKind, brokenRows, brokenView, googleRows, stoppedGoogleAnswers } from './brokenView'
import type { Jobs } from './useWatchJobs'

const NOW = Date.parse('2026-10-31T12:00:00Z')

const jobs = (over: Partial<Jobs> = {}): Jobs => ({
  google: { places: [] } as never,
  dishes: null, hospitals: null, hours: null, times: null, sites: null, eruvim: null, kosher: null, links: null,
  ...over,
})

const down = (id: string, url: string, lastError = 'HTTP 403') => ({ id, url, active: true, lastRunAt: '2026-10-31T07:00:00Z', lastOkAt: '2026-10-20T07:00:00Z', failingSince: '2026-10-22T07:00:00Z', lastError })

// The user, Nov 2: "Broken checks just asks to open the listing for some
// reason that I don't understand". Each kind gets the answers its board
// draws, acting on the place right there.
describe('a broken check on To do (R3Site, R2Menu, R2Google)', () => {
  it('knows every line placeTroubles and notBeingRead write', () => {
    for (const l of ['Website didn’t load', 'Menu didn’t load', 'Menu can’t be read', 'Google not found', 'Google stopped answering Oct 17', 'Times can’t be read', 'Hours can’t be read', 'Refuah didn’t load', 'Not found on Refuah', 'Link doesn’t open', 'Their email came 4 weeks ago'])
      expect(brokenKind(l), l).not.toBeNull()
  })

  it('a website: its pages, since when, and why, with Read it again and Stop reading it', () => {
    const pages = [down('a', 'https://soicherryhill.org/'), down('b', 'https://soicherryhill.org/minyanim')]
    const v = brokenView('s', 'Website didn’t load', jobs({ times: { places: [{ id: 's', name: 'SOI', pages: pages.map((watch) => ({ watch })), off: false }] } as never }), NOW)!
    expect(v.source).toEqual({ name: 'soicherryhill.org', rest: ' and 1 of its pages', failed: 'didn’t load since Oct 22', url: 'https://soicherryhill.org/', why: 'Their site turns away automatic visits, so it can’t be read' })
    expect(v.field).toBe('website')
    expect(v.answers.map((a) => a.label)).toEqual(['Read it again', 'Stop reading it'])
    expect(v.answers[0].act).toEqual({ kind: 'read', steps: [{ job: 'times', resourceId: 's' }] })
    expect(v.answers[1].act).toEqual({ kind: 'stop', stops: [{ kind: 'page', job: 'times', watchId: 'a', what: 'soicherryhill.org' }, { kind: 'page', job: 'times', watchId: 'b', what: 'soicherryhill.org/minyanim' }] })
  })

  it('a website with no job page of its own reads and stops its watches', () => {
    const v = brokenView('g', 'Website didn’t load', jobs({ sites: [{ id: 'g', name: 'GIANT', pages: [{ watch: down('w', 'https://giant.example/store', 'fetch failed') }] }] as never }), NOW)!
    expect(v.answers.map((a) => a.act)).toEqual([
      { kind: 'read', steps: [{ job: 'watch', watchId: 'w' }] },
      { kind: 'stop', stops: [{ kind: 'watch', watchId: 'w', what: 'giant.example/store' }] },
    ])
  })

  it('an eruv’s website reads and stops its watch', () => {
    const eruvim = { eruvim: [{ id: 'elkins-park', name: 'Elkins Park Eruv', website: 'https://www.yiep.org/eruv-map' }], findings: [], watches: [down('w', 'https://www.yiep.org/eruv-map', 'The page answered 404')], timezone: 'America/New_York' }
    const v = brokenView('elkins-park', 'Website didn’t load', jobs({ eruvim: eruvim as never }), NOW)!
    expect(v.source.failed).toBe('didn’t load since Oct 22')
    expect(v.answers.map((a) => a.act)).toEqual([
      { kind: 'read', steps: [{ job: 'watch', watchId: 'w' }] },
      { kind: 'stop', stops: [{ kind: 'watch', watchId: 'w', what: 'yiep.org/eruv-map' }] },
    ])
  })

  it('a menu that didn’t load: Read it again, Give its menu, No menu online', () => {
    const menuWatch = down('m', 'https://20thstreet.pizza/menu')
    const v = brokenView('p', 'Menu didn’t load', jobs({ dishes: [{ id: 'p', name: 'Pizza', dishes: [], menuUrl: 'https://20thstreet.pizza/menu', menuWatch, reading: null }] as never }), NOW)!
    expect(v.field).toBe('items')
    expect(v.answers.map((a) => a.label)).toEqual(['Read it again', 'Give its menu', 'No menu online'])
    expect(v.answers[2].act).toEqual({ kind: 'stop', stops: [{ kind: 'menu', action: 'no_menu', what: 'its menu' }] })
  })

  it('a menu that can’t be read has nothing to read again', () => {
    const v = brokenView('p', 'Menu can’t be read', jobs({ dishes: [{ id: 'p', name: 'Pizza', dishes: [], menuUrl: 'https://x.example/menu.jpg', reading: { status: 'failed', readAt: '2026-10-20T07:00:00Z' } }] as never }), NOW)!
    expect(v.answers.map((a) => a.label)).toEqual(['Give its menu', 'No menu online'])
    expect(v.source.failed).toBe('can’t be read')
  })

  it('Google: Find it on Google, and Not on Google or Stop using Google', () => {
    expect(brokenView('x', 'Google not found', jobs(), NOW)!.answers.map((a) => a.label)).toEqual(['Find it on Google', 'Not on Google'])
    const g = brokenView('x', 'Google stopped answering Oct 17', jobs({ google: { places: [{ id: 'x', failedAt: '2026-10-17T07:00:00Z', readAt: '2026-10-16T07:00:00Z' }] } as never }), NOW)!
    expect(g.answers.map((a) => a.label)).toEqual(['Find it on Google', 'Stop using Google'])
    expect(g.source.failed).toBe('hasn’t answered since Oct 17')
    expect(g.field).toBe('google')
  })

  // The user, Nov 2: "Instead of saying stop using it, should we say read
  // information from website". Stopping reads its website at once.
  it('Google stopped, with a website on the listing: Use its website instead', () => {
    const category = { id: 'food', detailFields: [{ key: 'website', type: 'url', label: 'Website' }] } as never
    const g = brokenView('x', 'Google stopped answering Oct 17', jobs({ google: { places: [{ id: 'x', failedAt: '2026-10-17T07:00:00Z' }] } as never }), NOW)!
    const labels = (item: object) => stoppedGoogleAnswers(g, item as never, category).map((a) => a.label)
    expect(labels({ id: 'x', name: 'Rita’s', website: 'https://ritas.com' })).toEqual(['Find it on Google', 'Use its website instead'])
    expect(labels({ id: 'x', name: 'Rita’s', website: ' ' })).toEqual(['Find it on Google', 'Stop using Google'])
    const missing = brokenView('x', 'Google not found', jobs(), NOW)!
    expect(stoppedGoogleAnswers(missing, { id: 'x', website: 'https://ritas.com' } as never, category).map((a) => a.label)).toEqual(['Find it on Google', 'Not on Google'])
  })

  it('times that can’t be read: give the page with them, or Still right', () => {
    const watch = { ...down('t', 'https://shul.example/'), lastError: null, failingSince: null }
    const v = brokenView('s', 'Times can’t be read', jobs({ times: { places: [{ id: 's', pages: [{ watch }], off: false }] } as never }), NOW)!
    expect(v.field).toBe('minyanim')
    expect(v.answers.map((a) => a.act)).toEqual([
      { kind: 'give', change: { kind: 'page', job: 'times', replaces: 't' }, label: 'The page with its times' },
      { kind: 'off', job: 'times' },
    ])
  })

  // Chabad of the Main Line, Nov 2: no page at all, so only Still right.
  it('times nothing reads: Add a source, or Still right', () => {
    const v = brokenView('c', 'Times can’t be read', jobs({ times: { places: [{ id: 'c', pages: [], off: false }] } as never }), NOW)!
    expect(v.source).toMatchObject({ name: 'Nothing', rest: ' reads its times', failed: null, url: null })
    expect(v.answers.map((a) => a.act)).toEqual([
      { kind: 'add', job: 'times', label: 'The page with its times' },
      { kind: 'off', job: 'times' },
    ])
    expect(v.answers[0].label).toBe('Add a source')
  })

  it('Refuah: read again when it didn’t load, give its page when it isn’t there', () => {
    const watch = down('r', 'https://refuah.example/jeff')
    expect(brokenView('h', 'Refuah didn’t load', jobs({ hospitals: [{ id: 'h', watch }] as never }), NOW)!.answers.map((a) => a.label)).toEqual(['Read it again', 'Stop reading it'])
    expect(brokenView('h', 'Not found on Refuah', jobs({ hospitals: [{ id: 'h', watch: null }] as never }), NOW)!.answers.map((a) => a.label)).toEqual(['Give its page on Refuah', 'Not on Refuah'])
  })

  it('a link: Check it again, the card showing the field it’s in', () => {
    const link = { resourceId: 'k', key: 'certificate', field: 'Kosher certificate', url: 'https://cert.example/a.pdf', error: 'HTTP 404', failingSince: '2026-10-12T07:00:00Z', checkedAt: '2026-10-31T07:00:00Z', status: 404, ok: false }
    const v = brokenView('k', 'Link doesn’t open', jobs({ links: [link] as never }), NOW)!
    expect(v.field).toEqual({ key: 'certificate' })
    expect(v.source.why).toBe('The page isn’t there any more')
    expect(v.answers).toEqual([{ label: 'Check it again', act: { kind: 'check-link', key: 'certificate' } }])
  })

  it('an email gone quiet: Give another address or Stop reading it', () => {
    const letter = { id: 'n', url: 'mailto:office@shul.org', active: true, pageChangedAt: '2026-10-01T16:00:00Z', createdAt: '2026-09-01T16:00:00Z' }
    const v = brokenView('s', 'Their email came 4 weeks ago', jobs({ times: { places: [{ id: 's', pages: [], off: false, newsletters: [letter] }] } as never }), NOW)!
    expect(v.source).toMatchObject({ name: 'office@shul.org', failed: 'last came Oct 1' })
    expect(v.answers.map((a) => a.act)).toEqual([
      { kind: 'give', change: { kind: 'newsletter', replaces: 'n' }, label: 'The address its emails come from' },
      { kind: 'stop', stops: [{ kind: 'watch', watchId: 'n', what: 'office@shul.org' }] },
    ])
  })
})

describe('which of the listing’s rows the card holds', () => {
  const f = (key: string, type: string, label = key) => ({ key, type, label }) as never
  const rows = [
    { id: 'name', title: 'Name', kind: 'name', fields: [] },
    { id: 'minyans:weekday', title: 'Usual weekday times', kind: 'minyans', fields: [f('minyanim', 'minyanim')], box: 'weekday' },
    { id: 'minyans:shabbos', title: 'Usual Shabbos times', kind: 'minyans', fields: [f('minyanim', 'minyanim')], box: 'shabbos' },
    { id: 'minyans:this_week', title: 'This week’s schedule', kind: 'minyans', fields: [f('minyanim', 'minyanim')], box: 'this_week', week: {} },
    { id: 'items', title: 'Main dishes', kind: 'items', fields: [f('dishes', 'tags')] },
    { id: 'box:contacts', title: 'Who to call', kind: 'fields', fields: [f('contacts', 'contacts')] },
    { id: 'field:website', title: 'Website', kind: 'fields', fields: [f('website', 'url', 'Website')] },
    { id: 'field:certificate', title: 'Certificate', kind: 'fields', fields: [f('certificate', 'url', 'Kosher certificate')] },
    { id: 'hours', title: 'Hours', kind: 'fields', fields: [f('hours', 'hours')] },
  ] as never
  it('picks each kind’s own', () => {
    expect(brokenRows('website', rows)).toEqual(['field:website'])
    expect(brokenRows('items', rows)).toEqual(['items'])
    expect(brokenRows('minyanim', rows)).toEqual(['minyans:weekday', 'minyans:shabbos'])
    expect(brokenRows('hours', rows)).toEqual(['hours'])
    expect(brokenRows('contacts', rows)).toEqual(['box:contacts'])
    expect(brokenRows({ key: 'certificate' }, rows)).toEqual(['field:certificate'])
    expect(brokenRows('google', rows)).toEqual([])
  })
})

describe('the Google card (R2Google)', () => {
  it('the listing’s name, address, phone, website and hours, in that order', () => {
    const category = { id: 'food', detailFields: [{ key: 'website', type: 'url', label: 'Website' }, { key: 'hours', type: 'hours', label: 'Hours' }] } as never
    const item = { id: 'm', name: 'Mike’s Chicken', address: '700 Cedar Bridge Avenue, Lakewood, NJ 08701', phone: '(469) 278-6249', website: 'https://mikeschicken.com/' } as never
    expect(googleRows(item, category)).toEqual([
      { label: 'Name', value: 'Mike’s Chicken' },
      { label: 'Address', value: '700 Cedar Bridge Avenue, Lakewood, NJ 08701' },
      { label: 'Phone', value: '(469) 278-6249' },
      { label: 'Website', value: 'mikeschicken.com' },
      { label: 'Hours', value: null },
    ])
  })

  // The user, Nov 2: "Short description doesn't need to be in google changes
  // screen". It's Google's own summary, which most places don't have.
  it('its short description only when Google gave it one', () => {
    const category = { id: 'food', detailFields: [] } as never
    const without = googleRows({ id: 'm', name: 'Mike’s', googleDescription: ' ' } as never, category)
    expect(without.map((r) => r.label)).not.toContain('Short Description')
    const withOne = googleRows({ id: 'm', name: 'Mike’s', googleDescription: 'Kosher chicken shop' } as never, category)
    expect(withOne.at(-1)).toEqual({ label: 'Short Description', value: 'Kosher chicken shop' })
  })
})
