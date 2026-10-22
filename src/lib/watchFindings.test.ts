import { describe, expect, it } from 'vitest'
import type { ResourceRow, SubmissionRow } from '@/types'
import type { CategoryField } from './categories'
import { findingFrom, findingPage, keepOnly, onAJobPage, pageOf } from './watchFindings'
import { LISTING_PAGE_WATCH_NAME } from './listingPageWatch'
import { REFUAH_WATCH_NAME } from './refuahWatch'
import { KEYSTONE_WATCH_NAME } from './keystoneWatch'

const FIELDS: CategoryField[] = [
  { key: 'women_s_hours', label: 'Women’s hours', type: 'text' },
  { key: 'call_before', label: 'Call before', type: 'text' },
]

const current: ResourceRow = {
  id: 'lmc',
  community_id: 'philly',
  category: 'mikvah',
  name: 'Lower Merion Community Mikvah',
  anchor_id: 'community',
  distance: null,
  address: '123 Montgomery Ave',
  phone: '610-555-0100',
  details: { women_s_hours: 'Sun–Thu 8:30–10:30 PM', call_before: '10:00 PM', e: 'x' },
  status: 'approved',
  submitted_by: null,
  created_at: '2026-10-01T00:00:00Z',
  reviewed_at: null,
}

const sub = (over: Partial<SubmissionRow> = {}): SubmissionRow =>
  ({
    id: 's1',
    community_id: 'philly',
    operation: 'update',
    target_type: 'listing',
    target_id: 'lmc',
    payload: {
      category: 'mikvah',
      name: current.name,
      address: current.address,
      phone: current.phone,
      details: { ...current.details, women_s_hours: 'Sun–Thu 7:30–9:30 PM', call_before: '9:00 PM' },
      source: { readBy: 'ai', from: 'Lower Merion Community Mikvah’s website', note: 'From their website, read Oct 21: https://lmcmikvah.org' },
    },
    note: null,
    status: 'pending',
    submitted_by: { name: LISTING_PAGE_WATCH_NAME },
    created_at: '2026-10-21T10:00:00Z',
    reviewed_at: null,
    reviewed_by: null,
    ...over,
  }) as SubmissionRow

describe('findingFrom', () => {
  it('a line per field it would change, each with what the listing says and what its source says', () => {
    const f = findingFrom(sub(), current, FIELDS)
    expect(f).toMatchObject({ from: 'its website', says: 'Its page says', named: null })
    expect(f.notes).toEqual(['From their website, read Oct 21: https://lmcmikvah.org'])
    expect(f.lines).toEqual([
      { key: 'women_s_hours', label: 'Women’s hours', before: 'Sun–Thu 8:30–10:30 PM', after: 'Sun–Thu 7:30–9:30 PM', choosable: true },
      { key: 'call_before', label: 'Call before', before: '10:00 PM', after: '9:00 PM', choosable: true },
    ])
  })

  it('a field what was read leaves empty is marked, and the date every approval sets isn’t a line', () => {
    const s = sub()
    const details = (s.payload as { details: Record<string, unknown> }).details
    // Filed before the listing gained its dishes, and dated then.
    details.confirmedAt = '2026-08-20T16:29:44.058Z'
    const listing = { ...current, details: { ...current.details, call_before: '9:00 PM', main_dishes: 'Omelettes', confirmedAt: '2026-10-21T13:05:11.179Z' } }
    const lines = findingFrom(s, listing, [...FIELDS, { key: 'main_dishes', label: 'Main dishes', type: 'text' }]).lines
    expect(lines.map((l) => l.key)).toEqual(['women_s_hours', 'main_dishes'])
    expect(lines[1]).toMatchObject({ before: 'Omelettes', after: '—', choosable: true, empties: true })
    expect(lines[0].empties).toBeUndefined()
  })

  it('a field the admin’s copy can’t carry comes with the rest, without a tick', () => {
    const s = sub()
    ;(s.payload as { details: Record<string, unknown> }).details.k = 'https://keystone-k.org/kosher/lmc/'
    expect(findingFrom(s, current, FIELDS).lines.find((l) => l.key === 'k')).toMatchObject({ choosable: false })
  })

  it('a removal has no lines, only the list’s note; a new place’s lines are what it would say', () => {
    const removal = findingFrom(sub({ operation: 'delete', payload: {}, note: 'Not on Keystone-K’s list any more.', submitted_by: { name: KEYSTONE_WATCH_NAME } }), current, FIELDS)
    expect(removal).toMatchObject({ from: 'Keystone-K’s list', says: 'Keystone-K says', named: 'Keystone-K', lines: [], notes: ['Not on Keystone-K’s list any more.'] })
    const add = findingFrom(sub({ operation: 'create', target_id: null }), null, FIELDS)
    expect(add.name).toBe('Lower Merion Community Mikvah')
    expect(add.lines.find((l) => l.key === 'women_s_hours')).toMatchObject({ before: '—', after: 'Sun–Thu 7:30–9:30 PM', choosable: false })
  })
})

describe('findingFrom: a shul’s times', () => {
  const TIMES: CategoryField[] = [{ key: 'minyanim', label: 'Davening times', type: 'minyanim' }]
  const was = [{ id: 'a', tefillah: 'shacharis', days: ['sun'], time: '8:00am' }]
  const shul = { ...current, category: 'shuls', details: { minyanim: was } }
  const read = (details: Record<string, unknown>) => sub({ payload: { category: 'shuls', name: shul.name, address: shul.address, phone: shul.phone, details } } as Partial<SubmissionRow>)

  it('carries the listing’s times and what was read, whole, when the times are all it changes', () => {
    const now = [{ id: 'a', tefillah: 'shacharis', days: ['sun'], time: '8:30am' }]
    const week = [{ id: 'w', name: 'Times for Oct 19 – Oct 25', from: '2026-10-19', to: '2026-10-25', mode: 'replace', kind: 'week', minyanim: [] }]
    const f = findingFrom(read({ minyanim: now, minyanim_schedules: week }), shul, TIMES)
    expect(f.times).toEqual({ field: TIMES[0], current: was, proposed: now, currentSchedules: [], proposedSchedules: week })
  })

  it('the part it updates and the page it was read from, so its box can say both', () => {
    const now = [{ id: 'a', tefillah: 'shacharis', days: ['sat'], time: '9:00am' }]
    const s = read({ minyanim: now })
    ;(s.payload as Record<string, unknown>).source = { readBy: 'ai', from: 'Sons of Israel’s website', note: 'From their website, read Oct 21: https://soi.example/tefillot', part: { part: 'shabbos', field: 'minyanim' } }
    expect(findingFrom(s, shul, TIMES)).toMatchObject({ part: 'shabbos', page: 'https://soi.example/tefillot' })
    // One filed before parts: neither.
    const old = findingFrom(read({ minyanim: now }), shul, TIMES)
    expect(old.part).toBeUndefined()
  })

  it('none when it would change something else too, so it’s shown line by line', () => {
    const f = findingFrom(read({ minyanim: was, rabbi: 'Rabbi Cohen' }), shul, [...TIMES, { key: 'rabbi', label: 'Rabbi', type: 'text' }])
    expect(f.lines.map((l) => l.key)).toEqual(['rabbi'])
    expect(f.times).toBeUndefined()
  })
})

describe('findingFrom: a mikvah’s section', () => {
  const SECTIONED: CategoryField[] = [
    { key: 'womenTevillah', label: 'Women’s Tevillah', type: 'boolean' },
    { key: 'menTevillah', label: 'Men’s Tevillah', type: 'boolean' },
    { key: 'women_s_hours', label: 'Women’s Hours', type: 'hours', audienceKey: 'womenTevillah' },
    { key: 'women_s_notes', label: 'Women’s Notes', type: 'textarea', audienceKey: 'womenTevillah' },
    { key: 'men_s_hours', label: 'Men’s Hours', type: 'hours', audienceKey: 'menTevillah' },
  ]
  const was = { mon: { open: '20:30', close: '22:30' } }
  const now = { mon: { open: '19:30', close: '21:30' } }
  const lmc = { ...current, details: { womenTevillah: true, menTevillah: true, women_s_hours: was, women_s_notes: 'By appointment.', men_s_hours: was } }
  const read = (details: Record<string, unknown>, source: Record<string, unknown> = {}) =>
    sub({ payload: { category: 'mikvah', name: lmc.name, address: lmc.address, phone: lmc.phone, details: { ...lmc.details, ...details }, source: { readBy: 'ai', from: 'x', note: 'From their website, read Oct 20: https://lmcmikvah.org', ...source } } } as Partial<SubmissionRow>)

  it('the section it was filed for, and that section’s hours and notes as it has them', () => {
    const f = findingFrom(read({ women_s_hours: now }, { section: { section: 'womenTevillah', keys: ['women_s_hours', 'women_s_notes'] } }), lmc, SECTIONED)
    expect(f).toMatchObject({ section: 'womenTevillah', values: { women_s_hours: now, women_s_notes: 'By appointment.' }, page: 'https://lmcmikvah.org' })
  })

  it('one filed before the sections is its section’s when all it changes is in one', () => {
    expect(findingFrom(read({ women_s_notes: 'Call ahead.' }), lmc, SECTIONED)).toMatchObject({ section: 'womenTevillah', values: { women_s_notes: 'Call ahead.' } })
    expect(findingFrom(read({ women_s_hours: now, men_s_hours: now }), lmc, SECTIONED).section).toBeUndefined()
  })
})

describe('keepOnly', () => {
  it('an unticked line goes back to what the listing says; a ticked one is as its source says', () => {
    const edited = keepOnly(sub().payload as never, current, ['women_s_hours'], FIELDS) as { details: Record<string, unknown>; name: string }
    expect(edited.details.women_s_hours).toBe('Sun–Thu 7:30–9:30 PM')
    expect(edited.details.call_before).toBe('10:00 PM')
    expect(edited.name).toBe(current.name)
  })

  it('a field the listing doesn’t have yet, unticked, stays empty', () => {
    const s = sub()
    ;(s.payload as { details: Record<string, unknown> }).details.call_before = '9:00 PM'
    const without = { ...current, details: { women_s_hours: current.details.women_s_hours } }
    expect((keepOnly(s.payload as never, without, [], FIELDS) as { details: Record<string, unknown> }).details.call_before).toBeNull()
  })
})

describe('onAJobPage', () => {
  const jobs = { hours: new Set(['mikvah']), times: new Set(['synagogue']) }
  it('a website’s finding is on a job page only when its place is one a job reads', () => {
    const s = sub()
    expect(onAJobPage(s, 'mikvah', jobs)).toBe(true)
    expect(onAJobPage(s, 'restaurant', jobs)).toBe(false)
  })
  it('Refuah’s and the kosher lists’ always are; a visitor’s never is', () => {
    expect(onAJobPage(sub({ submitted_by: { name: REFUAH_WATCH_NAME } }), 'hospital', {})).toBe(true)
    expect(onAJobPage(sub({ submitted_by: { name: KEYSTONE_WATCH_NAME }, target_id: null }), undefined, {})).toBe(true)
    expect(onAJobPage(sub({ submitted_by: { email: 'someone@example.com' } }), 'mikvah', jobs)).toBe(false)
    expect(onAJobPage(sub({ target_type: 'eruv' }), 'mikvah', jobs)).toBe(false)
  })
})

it('findingPage: the job’s admin page and its name', () => {
  expect(findingPage('philly', 'kosher')).toEqual({ path: '/philly/admin/watches/kosher', name: 'Kosher certification' })
  expect(findingPage('philly', 'hours', 'Mikvah hours')).toEqual({ path: '/philly/admin/watches/hours', name: 'Mikvah hours' })
})

describe('pageOf', () => {
  it('the page in a watch’s note, from its first line only', () => {
    expect(pageOf('From their website, read Oct 20: https://soi.example/cal.php')).toBe('https://soi.example/cal.php')
    expect(pageOf('From their website, changed Oct 20: https://soi.example/\n\nChanged: mincha · Sun')).toBe('https://soi.example/')
    expect(pageOf('Changed: mincha\nFrom: https://soi.example/')).toBeUndefined()
    expect(pageOf(null)).toBeUndefined()
  })
})
