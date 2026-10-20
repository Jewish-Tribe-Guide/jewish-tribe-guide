import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import { menuHash } from './menuWatch'
import { LISTING_PAGE_WATCH_NAME } from './listingPageWatch'
import type { TimesUpdate } from './scheduleUpdate'

const m = vi.hoisted(() => ({
  listCategoriesUncached: vi.fn(),
  getResourceRowById: vi.fn(),
  fetchPublic: vi.fn(),
  readShulWeek: vi.fn(),
  readMessage: vi.fn(),
  submitListingUpdate: vi.fn(),
  sendWatchDigest: vi.fn(),
  confirmFromSource: vi.fn(),
  pending: [] as unknown[],
  earlier: [] as unknown[],
  writes: [] as string[],
}))
vi.mock('@/lib/categoryStore', () => ({ listCategoriesUncached: m.listCategoriesUncached }))
vi.mock('@/lib/resourceStore', () => ({
  getResourceRowById: m.getResourceRowById,
  normalizeRow: (r: { details?: Record<string, unknown> }) => ({ ...r, ...(r.details ?? {}) }),
}))
vi.mock('@/lib/menuReader', async (orig) => ({ ...(await orig<typeof import('./menuReader')>()), fetchPublic: m.fetchPublic }))
vi.mock('@/lib/shulWeekReading', () => ({ readShulWeek: m.readShulWeek }))
vi.mock('@/lib/messageReader', async (orig) => ({ ...(await orig<typeof import('./messageReader')>()), readMessage: m.readMessage }))
vi.mock('@/lib/submissionStore', () => ({ submitListingUpdate: m.submitListingUpdate }))
vi.mock('@/lib/email', () => ({ sendWatchDigest: m.sendWatchDigest }))
// Never called: a page the AI read never dates a listing. Mocked so a call
// would be seen, not made.
vi.mock('@/lib/sourceConfirm', () => ({ confirmFromSource: m.confirmFromSource }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = {}
      const result = () => ({
        data: table === 'community' ? { name: 'Philadelphia' } : filters.status === 'pending' ? m.pending : m.earlier,
        error: null,
      })
      const write = () => {
        m.writes.push(table)
        return q
      }
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (k: string, v: unknown) => ((filters[k] = v), q),
        in: () => q,
        is: () => q,
        limit: () => q,
        update: write,
        insert: write,
        upsert: write,
        maybeSingle: () => Promise.resolve(result()),
        then: (ok: (v: unknown) => unknown) => Promise.resolve(result()).then(ok),
      }
      return q
    },
  }),
}))

const { runListingPageWatch } = await import('./listingPageRun')
const { newMenuReadBudget } = await import('./menuWatchRun')

const shulCategory = makeCategory({ id: 'synagogue', detailFields: [{ key: 'minyanim', label: 'Davening Times', type: 'minyanim' }] })
const mikvahCategory = makeCategory({ id: 'mikvah', detailFields: [{ key: 'women_s_hours', label: 'Women’s Hours', type: 'hours' }] })
const URL_ = 'https://lms.example/davening'
const minyan = { id: 'm1', tefillah: 'mincha', days: ['sun'], time: '6:15pm' }
const shul = { id: 's1', category: 'synagogue', name: 'Lower Merion Synagogue', status: 'approved', details: { minyanim: [minyan] } }
const html = `<html><body><h1>Davening times</h1><p>Sunday Mincha 6:05pm. ${'Our shul welcomes everyone to daven with us. '.repeat(6)}</p></body></html>`
const page = { url: URL_, type: 'html', body: html }
const watch = { communityId: 'philly', url: URL_, resourceId: 's1', pageHash: null as string | null }
const changed = { ...watch, pageHash: 'old' }
const NOW = Date.parse('2026-10-20T11:00:00Z')

/** What the schedule reader makes of the page: Sunday's Mincha moved. */
const moved: TimesUpdate = {
  kind: 'schedule',
  complete: false,
  season: null,
  title: null,
  startsOn: null,
  from: null,
  to: null,
  rows: [{ id: 'r', day: 'sun', tefillah: 'mincha', time: '6:05pm', status: 'changed', was: '6:15pm', rowId: 'm1', quote: 'Sunday Mincha 6:05pm' }],
  otherSeason: 0,
}
const agrees: TimesUpdate = { ...moved, rows: [{ ...moved.rows[0], time: '6:15pm', status: 'same', was: undefined }] }

async function hashOfPage() {
  const { htmlToText } = await import('./menuReader')
  return menuHash({ url: URL_, text: htmlToText(html), pdf: null })
}

beforeEach(() => {
  vi.clearAllMocks()
  m.pending = []
  m.earlier = []
  m.writes = []
  m.listCategoriesUncached.mockResolvedValue([shulCategory, mikvahCategory])
  m.getResourceRowById.mockResolvedValue(shul)
  m.fetchPublic.mockResolvedValue(page)
  m.readShulWeek.mockResolvedValue({ update: moved, model: 'cheap' })
  m.sendWatchDigest.mockResolvedValue(undefined)
})

describe('runListingPageWatch: a shul’s page of times', () => {
  it('the first read only sets the fingerprint: no AI', async () => {
    expect(await runListingPageWatch(watch, undefined, { apiKey: 'k' })).toEqual({ ok: true, filed: 0, pageHash: await hashOfPage() })
    expect(m.readShulWeek).not.toHaveBeenCalled()
  })

  it('an unchanged page is left alone: no AI, nothing filed, the listing not dated', async () => {
    const out = await runListingPageWatch({ ...watch, pageHash: await hashOfPage() }, undefined, { apiKey: 'k' })
    expect(out).toEqual({ ok: true, filed: 0, pageHash: await hashOfPage() })
    expect(m.readShulWeek).not.toHaveBeenCalled()
    expect(m.confirmFromSource).not.toHaveBeenCalled()
    expect(m.writes).toEqual([])
  })

  it('a changed page is read by the AI, and a changed time goes to the queue as from their website', async () => {
    const out = await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })
    expect(out).toEqual({
      ok: true,
      filed: 1,
      pageHash: await hashOfPage(),
      check: { what: 'times', from: 'page', result: 'differs', read: ['Mincha Sun 6:05 PM'], differences: ['Changed: mincha · Sun · 6:05pm, was 6:15pm'], queue: 'filed' },
    })
    expect(m.readShulWeek).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), 'minyanim', { text: expect.stringContaining('Sunday Mincha 6:05pm') }, 'k')
    const [community, target, payload, note, by] = m.submitListingUpdate.mock.calls[0]
    expect([community, target, by]).toEqual(['philly', 's1', { name: LISTING_PAGE_WATCH_NAME }])
    expect(payload.details.minyanim).toEqual([expect.objectContaining({ tefillah: 'mincha', days: ['sun'], time: '6:05pm' })])
    expect(note).toBe(`From their website, changed Oct 20: ${URL_}\n\nChanged: mincha · Sun · 6:05pm, was 6:15pm`)
    expect(payload.source).toMatchObject({ readBy: 'ai', from: 'Lower Merion Synagogue’s website', note: `From their website, changed Oct 20: ${URL_}` })
    expect(payload.source.original).toContain('Sunday Mincha 6:05pm')
  })

  // The user's rule (Oct 19): the AI reads, it never confirms.
  it('a changed page that agrees with the listing files nothing, and doesn’t date it', async () => {
    m.readShulWeek.mockResolvedValue({ update: agrees, model: 'cheap' })
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k' })).toEqual({
      ok: true,
      filed: 0,
      pageHash: await hashOfPage(),
      check: { what: 'times', from: 'page', result: 'agrees', read: ['Mincha Sun 6:15 PM'], differences: [], queue: null },
    })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
    expect(m.confirmFromSource).not.toHaveBeenCalled()
    expect(m.writes).toEqual([])
  })

  // The user, Oct 20: "the website reader should also take dated services
  // and calendars, and the newsletter wins when they disagree".
  const week: TimesUpdate = {
    ...moved,
    kind: 'week',
    from: '2026-10-25',
    to: '2026-10-25',
    rows: [{ id: 'r', day: '2026-10-25', tefillah: 'mincha', time: '6:05pm', status: 'changed', was: '6:15pm', rowId: 'm1', quote: 'Sunday Mincha 6:05pm' }],
  }
  const newsletterWeek = { id: 'w1', name: 'Times for Oct 25', from: '2026-10-25', to: '2026-10-25', mode: 'replace', kind: 'week', minyanim: [{ id: 'x', tefillah: 'mincha', on: ['2026-10-25'], time: '6:10pm' }] }

  it('a page of one week’s times goes to the queue as that week’s times, marked as from the website', async () => {
    m.readShulWeek.mockResolvedValue({ update: week, model: 'cheap' })
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })).toMatchObject({ ok: true, filed: 1 })
    const payload = m.submitListingUpdate.mock.calls[0][2]
    expect(payload.details.minyanim).toEqual([expect.objectContaining({ days: ['sun'], time: '6:15pm' })])
    expect(payload.details.minyanim_schedules).toEqual([
      expect.objectContaining({ kind: 'week', postedBy: 'website', from: '2026-10-25', minyanim: [expect.objectContaining({ on: ['2026-10-25'], time: '6:05pm' })] }),
    ])
  })

  it('a week the newsletter already gave wins: the website’s week for those days is left out', async () => {
    m.getResourceRowById.mockResolvedValue({ ...shul, details: { minyanim: [minyan], minyanim_schedules: [newsletterWeek] } })
    m.readShulWeek.mockResolvedValue({ update: week, model: 'cheap' })
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })).toMatchObject({
      ok: true,
      filed: 0,
      pageHash: await hashOfPage(),
      check: { result: 'agrees', note: 'Some days differ, but the newsletter has given those days, and it wins.' },
    })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  // A calendar's entries come as dated one-offs (calendarFeed.ts).
  const calendar = (rows: TimesUpdate['rows']): TimesUpdate => ({ ...moved, rows })
  const dated = (day: string, time: string) => ({ id: day + time, day, tefillah: 'mincha' as const, time, status: 'new' as const, quote: `${day} ${time}: Mincha` })

  it('a calendar’s service at a new time goes to the queue as that day’s; one at the usual time doesn’t', async () => {
    m.readShulWeek.mockResolvedValue({ update: calendar([dated('2026-10-25', '6:15pm'), dated('2026-11-01', '5:00pm')]), model: 'cheap' })
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })).toMatchObject({ ok: true, filed: 1 })
    const payload = m.submitListingUpdate.mock.calls[0][2]
    expect(payload.details.minyanim_schedules).toEqual([
      expect.objectContaining({ from: '2026-11-01', mode: 'add', postedBy: 'website', minyanim: [expect.objectContaining({ time: '5:00pm' })] }),
    ])
  })

  // Rodeph Shalom's calendar, Oct 20: its Thursday morning minyan listed on
  // each Thursday, and its Shabbos times, which the listing has.
  it('a calendar’s weekly minyan is a usual time, not a one-off each week; its dates at the usual time stay out', async () => {
    const thu = (day: string) => ({ ...dated(day, '8:10am'), tefillah: 'shacharis' as const })
    m.readShulWeek.mockResolvedValue({ update: calendar([thu('2026-10-22'), dated('2026-10-25', '6:15pm'), thu('2026-10-29'), dated('2026-11-01', '6:15pm')]), model: 'cheap' })
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })).toMatchObject({ ok: true, filed: 1 })
    const [, , payload, note] = m.submitListingUpdate.mock.calls[0]
    expect(note).toBe(`From their website, changed Oct 20: ${URL_}\n\nNew: shacharis · Thu · 8:10am`)
    expect(payload.details.minyanim).toEqual(
      expect.arrayContaining([expect.objectContaining({ tefillah: 'shacharis', days: ['thu'], time: '8:10am' }), expect.objectContaining({ tefillah: 'mincha', days: ['sun'], time: '6:15pm' })]),
    )
    expect(payload.details.minyanim_schedules ?? []).toEqual([])
  })

  it('a calendar’s new time for the shul’s one minyan that weekday, every week, is a change to it', async () => {
    m.readShulWeek.mockResolvedValue({ update: calendar([dated('2026-10-25', '6:05pm'), dated('2026-11-01', '6:05pm'), dated('2026-11-08', '6:05pm')]), model: 'cheap' })
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })).toMatchObject({ ok: true, filed: 1 })
    const [, , payload, note] = m.submitListingUpdate.mock.calls[0]
    expect(note).toContain('Changed: mincha · Sun · 6:05pm, was 6:15pm')
    expect(payload.details.minyanim).toEqual([expect.objectContaining({ tefillah: 'mincha', days: ['sun'], time: '6:05pm' })])
  })

  it('a calendar’s service on a day the newsletter has given is left out, and so is one already on a schedule', async () => {
    const filed = { id: 'w2', name: 'Sun, Nov 1', from: '2026-11-01', to: '2026-11-01', mode: 'add', postedBy: 'website', minyanim: [{ id: 'y', tefillah: 'mincha', on: ['2026-11-01'], time: '5:00pm' }] }
    m.getResourceRowById.mockResolvedValue({ ...shul, details: { minyanim: [minyan], minyanim_schedules: [newsletterWeek, filed] } })
    m.readShulWeek.mockResolvedValue({ update: calendar([dated('2026-10-25', '5:30pm'), dated('2026-11-01', '5:00pm')]), model: 'cheap' })
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })).toMatchObject({ ok: true, filed: 0, pageHash: await hashOfPage(), check: { result: 'agrees' } })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  it('never files again what it filed before, whatever became of it', async () => {
    m.earlier = [{ payload: { details: { minyanim: [{ id: 'other-id', tefillah: 'mincha', days: ['sun'], time: '6:05pm' }] } } }]
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k' })).toMatchObject({ ok: true, filed: 0, pageHash: await hashOfPage(), check: { result: 'differs', queue: 'before' } })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  it('leaves a listing with a suggestion in the queue, and keeps the change as news for later', async () => {
    m.pending = [{ id: 'sub1' }]
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k' })).toEqual({ ok: true, filed: 0 })
    expect(m.readShulWeek).not.toHaveBeenCalled()
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  it('shares the run’s AI reads: with them spent, the change waits for tomorrow', async () => {
    const budget = newMenuReadBudget()
    budget.aiReads = 0
    expect(await runListingPageWatch(changed, budget, { apiKey: 'k' })).toEqual({ ok: true, filed: 0 })
    expect(m.readShulWeek).not.toHaveBeenCalled()
  })

  it('says why when it can’t do its job', async () => {
    expect(await runListingPageWatch({ ...watch, resourceId: null })).toEqual({ ok: false, error: 'Tie this watch to the listing it keeps current' })
    m.fetchPublic.mockResolvedValue(null)
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k' })).toEqual({ ok: false, error: 'Couldn’t read the page (blocked, moved, or built in the browser)' })
    m.fetchPublic.mockResolvedValue(page)
    m.readShulWeek.mockRejectedValue(new Error('Schedule reader: 500'))
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k' })).toEqual({ ok: false, error: 'The page changed, and the AI couldn’t read it (Schedule reader: 500)' })
  })

  // Society Hill's Monday-minyan page, read as the whole week (Oct 19).
  it('takes a time off only where the page gives that tefillah on that day', async () => {
    const shabbos = { id: 'm2', tefillah: 'shacharis', days: ['sat'], time: '9:30am' }
    const late = { id: 'm3', tefillah: 'mincha', days: ['sun'], time: '7:30pm' }
    m.getResourceRowById.mockResolvedValue({ ...shul, details: { minyanim: [minyan, shabbos, late] } })
    m.readShulWeek.mockResolvedValue({
      update: {
        ...moved,
        complete: true,
        rows: [
          ...moved.rows,
          { id: 'g1', day: 'sat', tefillah: 'shacharis', time: '9:30am', status: 'gone', rowId: 'm2' },
          { id: 'g2', day: 'sun', tefillah: 'mincha', time: '7:30pm', status: 'gone', rowId: 'm3' },
        ],
      },
      model: 'cheap',
    })
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })).toMatchObject({ ok: true, filed: 1 })
    const [, , payload, note] = m.submitListingUpdate.mock.calls[0]
    expect(payload.details.minyanim).toHaveLength(2)
    expect(payload.details.minyanim).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tefillah: 'mincha', days: ['sun'], time: '6:05pm' }),
        expect.objectContaining({ tefillah: 'shacharis', days: ['sat'], time: '9:30am' }),
      ]),
    )
    expect(note).not.toContain('shacharis')
    expect(note).toContain('Off: mincha · Sun · 7:30pm')
  })

  // Mekor Habracha's page gives both seasons; its winter Maariv is on the
  // listing as winter's (Oct 19). And the AI names a minyan its own way.
  it('files nothing for a time the listing already has that day, whatever season or name', async () => {
    const listed = [
      minyan,
      { id: 'w', tefillah: 'maariv', days: ['sun'], time: '6:30pm', season: 'winter' },
      { id: 'f', tefillah: 'mincha_maariv', days: ['fri'], time: '7:00pm', season: 'summer' },
      { id: 'k', tefillah: 'shacharis', days: ['sat'], time: '10:00am' },
    ]
    m.getResourceRowById.mockResolvedValue({ ...shul, details: { minyanim: listed } })
    const fresh = (id: string, day: string, tefillah: string, time: string) => ({ id, day, tefillah, time, status: 'new' as const, quote: time })
    m.readShulWeek.mockResolvedValue({
      update: {
        ...moved,
        rows: [
          ...moved.rows,
          fresh('n1', 'sun', 'maariv', '6:30pm'),
          fresh('n2', 'fri', 'kabbalas_shabbos', '7:00pm'),
          fresh('n3', 'sat', 'other', '10:00am'),
          fresh('n4', 'mon', 'maariv', '9:00pm'),
          fresh('n5', 'sat', 'shacharis', '10:00pm'),
        ],
      },
      model: 'cheap',
    })
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })).toMatchObject({ ok: true, filed: 1 })
    const [, , , note] = m.submitListingUpdate.mock.calls[0]
    expect(note.split('\n\n')[1].split('\n')).toEqual(['Changed: mincha · Sun · 6:05pm, was 6:15pm', 'New: maariv · Mon · 9:00pm', 'New: shacharis · Shabbos · 10:00pm'])
  })

  it('reads the page without its menus', async () => {
    m.fetchPublic.mockResolvedValue({ ...page, body: html.replace('<body>', '<body><nav><a>Monday Evening Minyan</a><a>Donate</a></nav>') })
    expect(await runListingPageWatch(watch, undefined, { apiKey: 'k' })).toEqual({ ok: true, filed: 0, pageHash: await hashOfPage() })
  })
})

// The user, Oct 20: after "Check now" an admin couldn't tell a watch that
// reads the right things from one that only opened the page. A check has
// the AI read it, changed or not, and says what it read.
describe('runListingPageWatch: "Check now", the full check', () => {
  const full = { apiKey: 'k', now: NOW, full: true }

  it('reads an unchanged page with the AI and says it agrees, filing and dating nothing', async () => {
    m.readShulWeek.mockResolvedValue({ update: agrees, model: 'cheap' })
    const out = await runListingPageWatch({ ...watch, pageHash: await hashOfPage() }, undefined, full)
    expect(out).toEqual({
      ok: true,
      filed: 0,
      pageHash: await hashOfPage(),
      check: { what: 'times', from: 'page', result: 'agrees', read: ['Mincha Sun 6:15 PM'], differences: [], queue: null },
    })
    expect(m.readShulWeek).toHaveBeenCalled()
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
    expect(m.confirmFromSource).not.toHaveBeenCalled()
  })

  it('files a difference on an unchanged page as the daily run would, saying it was read, not changed', async () => {
    const out = await runListingPageWatch({ ...watch, pageHash: await hashOfPage() }, undefined, full)
    expect(out).toMatchObject({ ok: true, filed: 1, pageHash: await hashOfPage(), check: { result: 'differs', differences: ['Changed: mincha · Sun · 6:05pm, was 6:15pm'], queue: 'filed' } })
    const [, , payload, note, by] = m.submitListingUpdate.mock.calls[0]
    expect(by).toEqual({ name: LISTING_PAGE_WATCH_NAME })
    expect(note).toBe(`From their website, read Oct 20: ${URL_}\n\nChanged: mincha · Sun · 6:05pm, was 6:15pm`)
    expect(payload.source.note).toBe(`From their website, read Oct 20: ${URL_}`)
  })

  it('reads a page on its first check too, and sets its fingerprint', async () => {
    expect(await runListingPageWatch(watch, undefined, full)).toMatchObject({ ok: true, filed: 1, pageHash: await hashOfPage(), check: { queue: 'filed' } })
  })

  it('never files the same suggestion twice', async () => {
    m.earlier = [{ payload: { details: { minyanim: [{ id: 'x', tefillah: 'mincha', days: ['sun'], time: '6:05pm' }] } } }]
    expect(await runListingPageWatch({ ...watch, pageHash: await hashOfPage() }, undefined, full)).toMatchObject({ filed: 0, check: { result: 'differs', queue: 'before' } })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  it('with a suggestion already in the queue, says what differs, files nothing, and keeps a change as news', async () => {
    m.pending = [{ id: 'sub1' }]
    const out = await runListingPageWatch(changed, undefined, full)
    expect(out).toEqual({ ok: true, filed: 0, check: expect.objectContaining({ result: 'differs', queue: 'waiting' }) })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  it('isn’t held to the daily run’s AI reads', async () => {
    const budget = newMenuReadBudget()
    budget.aiReads = 0
    expect(await runListingPageWatch(changed, budget, full)).toMatchObject({ filed: 1 })
    expect(budget.aiReads).toBe(0)
  })

  it('says when the AI found no times on the page, and when the page wouldn’t open', async () => {
    m.readShulWeek.mockResolvedValue({ update: { ...moved, rows: [] }, model: 'cheap' })
    expect(await runListingPageWatch(changed, undefined, full)).toMatchObject({ ok: true, filed: 0, check: { result: 'nothing', read: [], differences: [] } })
    m.fetchPublic.mockResolvedValue(null)
    expect(await runListingPageWatch(changed, undefined, full)).toEqual({
      ok: false,
      error: 'Couldn’t read the page (blocked, moved, or built in the browser)',
      check: { what: 'times', from: null, result: 'unreadable', read: [], differences: [], queue: null },
    })
  })

  it('says it read the calendar when the page has one', async () => {
    const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART;TZID=America/New_York:20261025T181500', 'SUMMARY:Mincha', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
    m.fetchPublic.mockResolvedValue({ url: URL_, type: 'html', body: ics })
    m.readShulWeek.mockResolvedValue({ update: agrees, model: 'cheap' })
    expect(await runListingPageWatch(watch, undefined, full)).toMatchObject({ check: { from: 'calendar' } })
  })
})

describe('runListingPageWatch: a mikvah’s page of hours', () => {
  const mikvah = { id: 'mk1', category: 'mikvah', name: 'Mikvah Ohel Leah', status: 'approved', details: { women_s_hours: { sun: { open: '19:00', close: '22:00' } } } }
  const reading = (open: string) => ({
    proposals: [
      {
        kind: 'fields',
        listingId: 'mk1',
        asWritten: 'Mikvah Ohel Leah',
        ask: null,
        changes: [
          { key: 'women_s_hours', hours: { days: ['sun'], open, close: '22:00', closed: false, when: 'every_week' } },
          { key: 'e', value: 'someone@else.org' },
        ],
        note: null,
        quote: 'Sunday',
        checked: true,
      },
    ],
    model: 'cheap',
  })

  beforeEach(() => m.getResourceRowById.mockResolvedValue(mikvah))

  it('reads its hours with the any-field reader, and files only the hours that differ', async () => {
    m.readMessage.mockResolvedValue(reading('19:30'))
    const out = await runListingPageWatch({ ...changed, resourceId: 'mk1' }, undefined, { apiKey: 'k', now: NOW })
    expect(out).toMatchObject({ ok: true, filed: 1 })
    const [, target, payload, note] = m.submitListingUpdate.mock.calls[0]
    expect(target).toBe('mk1')
    expect(payload.details.women_s_hours).toEqual({ sun: { open: '19:30', close: '22:00' } })
    expect(payload.details.e).toBeUndefined()
    expect(note).toContain('Women’s Hours, Sunday: 7:00 PM–10:00 PM → 7:30 PM–10:00 PM')
  })

  it('a check says which hours it read', async () => {
    m.readMessage.mockResolvedValue(reading('19:00'))
    expect(await runListingPageWatch({ ...changed, resourceId: 'mk1' }, undefined, { apiKey: 'k', full: true })).toMatchObject({
      check: { what: 'hours', result: 'agrees', read: ['Women’s Hours, Sun: 7:00 PM–10:00 PM'] },
    })
  })

  it('files nothing, and dates nothing, when the hours agree', async () => {
    m.readMessage.mockResolvedValue(reading('19:00'))
    expect(await runListingPageWatch({ ...changed, resourceId: 'mk1' }, undefined, { apiKey: 'k' })).toMatchObject({ ok: true, filed: 0 })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
    expect(m.confirmFromSource).not.toHaveBeenCalled()
    expect(m.writes).toEqual([])
  })
})

// The user, Oct 20: a shul with its services on a calendar, not a page of
// times (Leyv Ha-Ir, Rodeph Shalom). calendarFeed.test.ts reads the formats.
describe('readListingPage: a page with a calendar', () => {
  const OCT_20 = Date.parse('2026-10-20T15:00:00Z')
  const feed = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;TZID=America/New_York:20261030T180000\r\nSUMMARY:Shabbat Evening Service\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'

  it('reads the feed the page links to, its coming entries ahead of the page’s words', async () => {
    const { readListingPage } = await import('./listingPageRun')
    const { CALENDAR_HEADING } = await import('./calendarFeed')
    m.fetchPublic.mockImplementation(async (url: string) =>
      url === URL_ ? { url, type: 'html', body: '<a href="/events/?ical=1">Export</a><p>Month view</p>' } : { url, type: 'html', body: feed },
    )
    const got = await readListingPage(URL_, { now: OCT_20 })
    expect(m.fetchPublic).toHaveBeenCalledWith('https://lms.example/events/?ical=1', expect.anything())
    expect(got?.text).toBe(`${CALENDAR_HEADING}\n2026-10-30 (Fri) 6:00 PM: Shabbat Evening Service\n\nExport Month view`)
  })

  it('reads a watch whose address is the feed itself, and an event list in the page’s scripts', async () => {
    const { readListingPage } = await import('./listingPageRun')
    m.fetchPublic.mockResolvedValue({ url: URL_, type: 'html', body: feed })
    expect((await readListingPage(URL_, { now: OCT_20 }))?.text).toContain('2026-10-30 (Fri) 6:00 PM: Shabbat Evening Service')
    m.fetchPublic.mockResolvedValue({ url: URL_, type: 'html', body: '<script>x = [{"title":"10:30 AM Shabbat Morning Service","start":"2026-11-07","allDay":true}]</script>' })
    expect((await readListingPage(URL_, { now: OCT_20 }))?.text).toContain('2026-11-07 (Sat) 10:30 AM: Shabbat Morning Service')
  })

  it('a page with no calendar and next to no words isn’t readable', async () => {
    const { readListingPage } = await import('./listingPageRun')
    m.fetchPublic.mockResolvedValue({ url: URL_, type: 'html', body: '<header>Leyv Ha-Ir</header><footer>Philadelphia</footer>' })
    expect(await readListingPage(URL_, { now: OCT_20 })).toBeNull()
  })
})
