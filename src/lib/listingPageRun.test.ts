import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import { menuHash } from './menuWatch'
import { LISTING_PAGE_FOUND_CREATOR, LISTING_PAGE_WATCH_NAME } from './listingPageWatch'
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
// Its `updates` (a page's usual times, then each dated week) are its one
// `update` unless a test gives them.
vi.mock('@/lib/shulWeekReading', () => ({
  readShulWeek: async (...args: unknown[]) => {
    const got = await m.readShulWeek(...args)
    return { updates: [got.update], ...got }
  },
}))
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

  // Oct 21: a page the hours or times job found would otherwise never be
  // read, so its job page could never say what it reads.
  it('a page the job found is read on its first morning, as read, not changed, under the run’s budget', async () => {
    const found = { ...watch, createdBy: LISTING_PAGE_FOUND_CREATOR }
    const out = await runListingPageWatch(found, newMenuReadBudget(), { apiKey: 'k', now: NOW })
    expect(out).toMatchObject({ ok: true, filed: 1, pageHash: await hashOfPage(), check: { result: 'differs', read: ['Mincha Sun 6:05 PM'] } })
    expect(m.submitListingUpdate.mock.calls[0][3]).toBe(`From their website, read Oct 20: ${URL_}\n\nChanged: mincha · Sun · 6:05pm, was 6:15pm`)
    // It waits on Shul times (step 6), and its email says so.
    expect(m.sendWatchDigest.mock.calls[0][3]).toEqual({ path: '/philly/admin/watches/times', name: 'Shul times' })
    // Its reads spent: left for a later morning, its fingerprint unset.
    m.readShulWeek.mockClear()
    expect(await runListingPageWatch(found, { ...newMenuReadBudget(), aiReads: 0 }, { apiKey: 'k' })).toEqual({ ok: true, filed: 0 })
    expect(m.readShulWeek).not.toHaveBeenCalled()
    // Once read, it's read again only when it changes.
    expect(await runListingPageWatch({ ...found, pageHash: await hashOfPage() }, undefined, { apiKey: 'k' })).toEqual({ ok: true, filed: 0, pageHash: await hashOfPage() })
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

  // A schedule with dated rows as one update, each date a one-off: what a
  // page's dated services were until Oct 21 (now their weeks, below), and
  // still how applyUpdate takes one. A calendar's are read a week at a time.
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
  // each Thursday. Leyv Ha-Ir's: Kabbalat Shabbat on a Friday a month. A
  // usual time is one the shul states; a calendar's dates stay dates (the
  // user, Oct 20), and an admin can make one a usual time if it is.
  it('a minyan a calendar shows every week goes to the queue date by date, never as a usual time', async () => {
    const thu = (day: string) => ({ ...dated(day, '8:10am'), tefillah: 'shacharis' as const })
    m.readShulWeek.mockResolvedValue({ update: calendar([thu('2026-10-22'), dated('2026-10-25', '6:15pm'), thu('2026-10-29'), dated('2026-11-01', '6:15pm')]), model: 'cheap' })
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })).toMatchObject({ ok: true, filed: 1 })
    const [, , payload, note] = m.submitListingUpdate.mock.calls[0]
    expect(note).not.toMatch(/New: shacharis · Thu/)
    expect(payload.details.minyanim).toEqual([expect.objectContaining({ tefillah: 'mincha', days: ['sun'], time: '6:15pm' })])
    const on = (payload.details.minyanim_schedules as { minyanim: { tefillah: string; on: string[]; time: string }[] }[]).flatMap((s) => s.minyanim)
    expect(on).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tefillah: 'shacharis', on: ['2026-10-22'], time: '8:10am' }),
        expect.objectContaining({ tefillah: 'shacharis', on: ['2026-10-29'], time: '8:10am' }),
      ]),
    )
  })

  it('a calendar’s new time for the shul’s minyan, every week, goes to those dates; the usual time is left alone', async () => {
    m.readShulWeek.mockResolvedValue({ update: calendar([dated('2026-10-25', '6:05pm'), dated('2026-11-01', '6:05pm'), dated('2026-11-08', '6:05pm')]), model: 'cheap' })
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })).toMatchObject({ ok: true, filed: 1 })
    const [, , payload, note] = m.submitListingUpdate.mock.calls[0]
    expect(note).not.toContain('Changed: mincha · Sun')
    expect(payload.details.minyanim).toEqual([expect.objectContaining({ tefillah: 'mincha', days: ['sun'], time: '6:15pm' })])
    const on = (payload.details.minyanim_schedules as { minyanim: { on: string[]; time: string }[] }[]).flatMap((s) => s.minyanim.flatMap((x) => x.on))
    expect(on.sort()).toEqual(['2026-10-25', '2026-11-01', '2026-11-08'])
  })

  it('a calendar’s service on a day the newsletter has given is left out, and so is one already on a schedule', async () => {
    const filed = { id: 'w2', name: 'Sun, Nov 1', from: '2026-11-01', to: '2026-11-01', mode: 'add', postedBy: 'website', minyanim: [{ id: 'y', tefillah: 'mincha', on: ['2026-11-01'], time: '5:00pm' }] }
    m.getResourceRowById.mockResolvedValue({ ...shul, details: { minyanim: [minyan], minyanim_schedules: [newsletterWeek, filed] } })
    m.readShulWeek.mockResolvedValue({ update: calendar([dated('2026-10-25', '5:30pm'), dated('2026-11-01', '5:00pm')]), model: 'cheap' })
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })).toMatchObject({ ok: true, filed: 0, pageHash: await hashOfPage(), check: { result: 'agrees' } })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  // Mikveh Israel's home page, Oct 21: its usual times, and "Shabbat Lekh
  // Lekha" Friday night at 6:00 PM. The user: "I don't want as well as the
  // regular times. If we have specific dates then it should all go on this
  // week" (datedAsWeeks).
  it('a page’s dated times go on as that week’s schedule, not as one day’s extra', async () => {
    const lekhLekha = { id: 'k', day: '2026-10-23', tefillah: 'kabbalas_shabbos' as const, time: '6:00pm', status: 'new' as const, occasion: 'Shabbat Lekh Lekha', quote: 'Friday Night Services 6:00PM' }
    const asRead = calendar([...agrees.rows, lekhLekha])
    const thisWeek: TimesUpdate = { ...moved, kind: 'week', title: 'Shabbat Lekh Lekha', from: '2026-10-23', to: '2026-10-24', rows: [lekhLekha] }
    m.readShulWeek.mockResolvedValue({ update: asRead, updates: [agrees, thisWeek], model: 'cheap' })
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })).toMatchObject({ ok: true, filed: 1 })
    const [, , payload, note] = m.submitListingUpdate.mock.calls[0]
    expect(note).not.toMatch(/that day only/)
    expect(payload.details.minyanim_schedules).toEqual([
      expect.objectContaining({ kind: 'week', mode: 'replace', postedBy: 'website', name: 'Shabbat Lekh Lekha', from: '2026-10-23', to: '2026-10-24', minyanim: [expect.objectContaining({ tefillah: 'kabbalas_shabbos', on: ['2026-10-23'], time: '6:00pm' })] }),
    ])
    // Read again once that week is on the listing: nothing more to file.
    m.submitListingUpdate.mockClear()
    m.getResourceRowById.mockResolvedValue({ ...shul, details: { minyanim: [minyan], minyanim_schedules: payload.details.minyanim_schedules } })
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })).toMatchObject({ ok: true, filed: 0, check: { result: 'agrees' } })
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
    const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART;TZID=America/New_York:20261023T181500', 'SUMMARY:Mincha', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
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
    expect(m.sendWatchDigest.mock.calls[0][3]).toEqual({ path: '/philly/admin/watches/hours', name: `${mikvahCategory.label} hours` })
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

// The user, Oct 20, on Lower Merion Community Mikvah's page ("open from
// 7:30PM – 9:30PM every weeknight"): the AI put that under the plain
// "Hours", or gave it no days, and the check said it agreed with women's
// hours of 8:30–10:30.
describe('runListingPageWatch: a mikvah with women’s, men’s and plain hours', () => {
  const lmcCategory = makeCategory({
    id: 'mikvah',
    detailFields: [
      { key: 'hours', label: 'Hours', type: 'hours' },
      { key: 'women_s_hours', label: 'Women’s Hours', type: 'hours' },
      { key: 'men_s_hours', label: 'Men’s Hours', type: 'hours' },
    ],
  })
  const evening = { open: '20:30', close: '22:30' }
  const lmc = {
    id: 'lmc',
    category: 'mikvah',
    name: 'Lower Merion Community Mikvah',
    status: 'approved',
    details: { women_s_hours: { mon: evening, tue: evening, wed: evening, thu: evening }, men_s_hours: { sun: { open: '04:30', close: '10:00' } } },
  }
  const reads = (key: string, days: string[] | 'all') => ({
    proposals: [
      {
        kind: 'fields',
        listingId: 'lmc',
        asWritten: 'Lower Merion Community Mikvah',
        ask: null,
        changes: [{ key, hours: { days, open: '19:30', close: '21:30', closed: false, when: 'every_week' } }],
        note: null,
        quote: 'The mikvah will be open from 7:30PM – 9:30PM every weeknight.',
        checked: false,
      },
    ],
    model: 'cheap',
  })

  beforeEach(() => {
    m.getResourceRowById.mockResolvedValue(lmc)
    m.listCategoriesUncached.mockResolvedValue([lmcCategory])
  })

  it('tells the AI what each hours field holds now, and offers it only the named ones', async () => {
    m.readMessage.mockResolvedValue(reads('women_s_hours', ['mon', 'tue', 'wed', 'thu']))
    await runListingPageWatch({ ...changed, resourceId: 'lmc' }, undefined, { apiKey: 'k', full: true })
    const [source, catalog] = m.readMessage.mock.calls[0]
    expect(source.text).toMatch(/Women’s Hours: Sun Closed · Mon–Thu 8:30 PM–10:30 PM · Fri–Sat Closed\nMen’s Hours: Sun 4:30 AM–10:00 AM/)
    expect(source.text).toMatch(/Give every weekly hours the page states, the ones that match the guide too/)
    expect(source.text).toMatch(/Leave out a day whose time is set by candle lighting/)
    expect(catalog.categories[0].fields.map((f: { key: string }) => f.key)).not.toContain('hours')
  })

  it('files the women’s hours the page changed', async () => {
    m.readMessage.mockResolvedValue(reads('women_s_hours', ['mon', 'tue', 'wed', 'thu']))
    const out = await runListingPageWatch({ ...changed, resourceId: 'lmc' }, undefined, { apiKey: 'k', full: true })
    expect(out).toMatchObject({ ok: true, filed: 1, check: { result: 'differs', read: ['Women’s Hours, Mon–Thu: 7:30 PM–9:30 PM'], queue: 'filed' } })
    expect(m.submitListingUpdate.mock.calls[0][3]).toContain('Women’s Hours, Monday: 8:30 PM–10:30 PM → 7:30 PM–9:30 PM')
  })

  it('never says it agrees when what it read couldn’t be compared', async () => {
    // "Every day" on hours the listing has none of leaves no days to set.
    m.readMessage.mockResolvedValue(reads('men_s_hours', 'all'))
    m.getResourceRowById.mockResolvedValue({ ...lmc, details: { ...lmc.details, men_s_hours: null } })
    const out = await runListingPageWatch({ ...changed, resourceId: 'lmc' }, undefined, { apiKey: 'k', full: true })
    expect(out).toMatchObject({ ok: true, filed: 0, check: { result: 'unsure', unread: ['Men’s Hours: opens 7:30 PM, closes 9:30 PM, but which days isn’t said'] } })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })
})

// The user, Oct 20: a shul with its services on a calendar, not a page of
// times (Leyv Ha-Ir, Rodeph Shalom). calendarFeed.test.ts reads the formats.
describe('readListingPage: a page with a calendar', () => {
  const OCT_20 = Date.parse('2026-10-20T15:00:00Z')
  const feed = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;TZID=America/New_York:20261023T180000\r\nSUMMARY:Shabbat Evening Service\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'

  it('reads the feed the page links to, its coming entries ahead of the page’s words', async () => {
    const { readListingPage } = await import('./listingPageRun')
    const { CALENDAR_HEADING } = await import('./calendarFeed')
    m.fetchPublic.mockImplementation(async (url: string) =>
      url === URL_ ? { url, type: 'html', body: '<a href="/events/?ical=1">Export</a><p>Month view</p>' } : { url, type: 'html', body: feed },
    )
    const got = await readListingPage(URL_, { now: OCT_20 })
    // A feed may be bigger than a page (Kol Tzedek's Google Calendar, 4.8 MB).
    expect(m.fetchPublic).toHaveBeenCalledWith('https://lms.example/events/?ical=1', expect.objectContaining({ maxBytes: 20_000_000 }))
    expect(got?.text).toBe(`${CALENDAR_HEADING}\n2026-10-23 (Fri) 6:00 PM: Shabbat Evening Service\n\nExport Month view`)
  })

  it('reads a watch whose address is the feed itself, and an event list in the page’s scripts', async () => {
    const { readListingPage } = await import('./listingPageRun')
    m.fetchPublic.mockResolvedValue({ url: URL_, type: 'html', body: feed })
    expect((await readListingPage(URL_, { now: OCT_20 }))?.text).toContain('2026-10-23 (Fri) 6:00 PM: Shabbat Evening Service')
    m.fetchPublic.mockResolvedValue({ url: URL_, type: 'html', body: '<script>x = [{"title":"10:30 AM Shabbat Morning Service","start":"2026-10-24","allDay":true}]</script>' })
    expect((await readListingPage(URL_, { now: OCT_20 }))?.text).toContain('2026-10-24 (Sat) 10:30 AM: Shabbat Morning Service')
  })

  it('a page with no calendar and next to no words isn’t readable', async () => {
    const { readListingPage } = await import('./listingPageRun')
    m.fetchPublic.mockResolvedValue({ url: URL_, type: 'html', body: '<header>Leyv Ha-Ir</header><footer>Philadelphia</footer>' })
    expect(await readListingPage(URL_, { now: OCT_20 })).toBeNull()
  })
})

// The user, Oct 20: a calendar is read "one week at a time so we just show
// this week's"; "if anything is dated it should go in this week's schedule
// even if it fully matches usual times"; "everything through the queue".
describe('runListingPageWatch: a shul’s calendar, a week at a time', () => {
  const THU = Date.parse('2026-10-22T14:00:00Z') // Thu Oct 22, 10 AM in Philadelphia
  const usual = [
    { id: 'k', tefillah: 'kabbalas_shabbos', days: ['fri'], time: '6:00pm' },
    { id: 's', tefillah: 'shacharis', days: ['sat'], time: '10:45am' },
    { id: 'mn', tefillah: 'mincha', days: ['sat'], time: '5:30pm' },
  ]
  const rodeph = { ...shul, id: 'rs', name: 'Congregation Rodeph Shalom', details: { minyanim: usual } }
  const event = (date: string, hhmm: string, title: string) => ['BEGIN:VEVENT', `DTSTART;TZID=America/New_York:${date.replace(/-/g, '')}T${hhmm}00`, `SUMMARY:${title}`, 'END:VEVENT']
  const ics = [
    'BEGIN:VCALENDAR',
    ...event('2026-10-20', '0810', 'Morning Minyan'), // this week, gone by
    ...event('2026-10-22', '0810', 'Morning Minyan'),
    ...event('2026-10-23', '1800', 'Kabbalat Shabbat'),
    ...event('2026-10-24', '1045', 'Shabbat Morning Service'),
    ...event('2026-10-30', '1800', 'Kabbalat Shabbat'),
    ...event('2026-10-31', '1045', 'Shabbat Morning Service'),
    ...event('2026-11-07', '1045', 'Two weeks on'),
    'END:VCALENDAR',
  ].join('\r\n')
  type Row = TimesUpdate['rows'][number]
  const row = (day: string, tefillah: Row['tefillah'], time: string, status: Row['status'], rowId?: string): Row => ({ id: `${day}${tefillah}`, day, tefillah, time, status, ...(rowId ? { rowId } : {}), quote: `${day} ${time}` })
  const weekOf = (from: string, to: string, rows: Row[]): TimesUpdate => ({ kind: 'week', complete: true, season: null, title: null, startsOn: null, from, to, rows, otherSeason: 0 })
  // The calendar's weeks as the reader would compare them: this week's
  // Thursday minyan is new; Shabbos is as usual; nothing says Mincha.
  const thisWeek = weekOf('2026-10-22', '2026-10-24', [
    row('2026-10-22', 'shacharis', '8:10am', 'new'),
    row('2026-10-23', 'kabbalas_shabbos', '6:00pm', 'same', 'k'),
    row('2026-10-24', 'shacharis', '10:45am', 'same', 's'),
    row('2026-10-24', 'mincha', '5:30pm', 'gone', 'mn'),
  ])
  const nextWeek = weekOf('2026-10-25', '2026-10-31', [
    row('2026-10-30', 'kabbalas_shabbos', '6:00pm', 'same', 'k'),
    row('2026-10-31', 'shacharis', '10:45am', 'same', 's'),
    row('2026-10-31', 'mincha', '5:30pm', 'gone', 'mn'),
  ])
  const byWeek = (weeks: Record<string, TimesUpdate>) =>
    m.readShulWeek.mockImplementation(async (_l: unknown, _k: unknown, _s: unknown, _a: unknown, opts: { week: { from: string } }) => ({ update: weeks[opts.week.from], model: 'cheap' }))
  const run = (over: object = {}) => runListingPageWatch(changed, undefined, { apiKey: 'k', now: THU, ...over })
  const schedulesFiled = () => m.submitListingUpdate.mock.calls[0][2].details.minyanim_schedules as { name: string; from: string; to: string; kind?: string; mode: string; postedBy?: string; minyanim: { tefillah: string; on: string[]; time: string }[] }[]

  beforeEach(() => {
    m.getResourceRowById.mockResolvedValue(rodeph)
    m.fetchPublic.mockResolvedValue({ url: URL_, type: 'html', body: ics })
    byWeek({ '2026-10-22': thisWeek, '2026-10-25': nextWeek })
  })

  it('reads this week and, from Thursday, next week, each on its own with only its days', async () => {
    await run()
    expect(m.readShulWeek).toHaveBeenCalledTimes(2)
    const [[, , first, , a], [, , second, , b]] = m.readShulWeek.mock.calls
    expect(a).toEqual({ week: expect.objectContaining({ from: '2026-10-22', to: '2026-10-24' }) })
    expect(b).toEqual({ week: expect.objectContaining({ from: '2026-10-25', to: '2026-10-31' }) })
    expect(first.text).toMatch(/2026-10-22 \(Thu\) 8:10 AM: Morning Minyan/)
    expect(first.text).not.toMatch(/2026-10-20|2026-10-30/)
    expect(second.text).toMatch(/2026-10-30 \(Fri\) 6:00 PM: Kabbalat Shabbat\n2026-10-31 \(Sat\) 10:45 AM: Shabbat Morning Service$/)
  })

  it('a week is this week’s schedule, its usual times and all, a usual minyan it doesn’t mention kept; filed though the next matches', async () => {
    expect(await run()).toMatchObject({ ok: true, filed: 1 })
    const [, , payload, note] = m.submitListingUpdate.mock.calls[0]
    expect(payload.details.minyanim).toEqual(usual.map((u) => expect.objectContaining({ tefillah: u.tefillah, days: u.days, time: u.time })))
    const [one, two] = schedulesFiled()
    expect(one).toMatchObject({ name: 'Times for Oct 18 – Oct 24', from: '2026-10-22', to: '2026-10-24', kind: 'week', mode: 'replace', postedBy: 'website' })
    expect(one.minyanim.map((x) => [x.on[0], x.tefillah, x.time])).toEqual([
      ['2026-10-22', 'shacharis', '8:10am'],
      ['2026-10-23', 'kabbalas_shabbos', '6:00pm'],
      ['2026-10-24', 'shacharis', '10:45am'],
      ['2026-10-24', 'mincha', '5:30pm'],
    ])
    expect(two).toMatchObject({ name: 'Times for Oct 25 – Oct 31', from: '2026-10-25', to: '2026-10-31', kind: 'week', postedBy: 'website' })
    expect(note).toContain('Times for Oct 18 – Oct 24: new, shacharis · Thu Oct 22 · 8:10am')
    expect(note).toContain('Times for Oct 25 – Oct 31: the same as their usual times, posted as this week’s schedule')
    expect(note).not.toMatch(/not held/)
  })

  it('files nothing for a week already on the listing as it would be', async () => {
    await run()
    const posted = m.submitListingUpdate.mock.calls[0][2].details
    vi.clearAllMocks()
    m.getResourceRowById.mockResolvedValue({ ...rodeph, details: posted })
    m.fetchPublic.mockResolvedValue({ url: URL_, type: 'html', body: ics })
    byWeek({ '2026-10-22': thisWeek, '2026-10-25': nextWeek })
    expect(await run({ full: true })).toMatchObject({ ok: true, filed: 0, check: { result: 'agrees' } })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  it('a week of the calendar read again on a later day replaces that week’s days, rather than making a second week', async () => {
    const earlier = { id: 'e', name: 'Times for Oct 18 – Oct 24', from: '2026-10-20', to: '2026-10-24', mode: 'replace', kind: 'week', postedBy: 'website', minyanim: [{ id: 'e1', tefillah: 'shacharis', on: ['2026-10-20'], time: '8:10am' }, { id: 'e2', tefillah: 'shacharis', on: ['2026-10-22'], time: '7:45am' }] }
    m.getResourceRowById.mockResolvedValue({ ...rodeph, details: { minyanim: usual, minyanim_schedules: [earlier] } })
    await run()
    const weeks = schedulesFiled().filter((x) => x.name === 'Times for Oct 18 – Oct 24')
    expect(weeks).toHaveLength(1)
    expect(weeks[0]).toMatchObject({ from: '2026-10-20', to: '2026-10-24' })
    expect(weeks[0].minyanim.filter((x) => x.on.includes('2026-10-22')).map((x) => x.time)).toEqual(['8:10am'])
  })

  // Leyv Ha-Ir's calendar: a Kabbalat Shabbat a month, and none of the
  // shul's usual minyanim. Taken as the week, it would hide them all.
  it('a calendar with none of the usual minyanim that week only adds what differs, each on its date, and says so', async () => {
    byWeek({
      '2026-10-22': weekOf('2026-10-22', '2026-10-24', [
        row('2026-10-23', 'kabbalas_shabbos', '7:30pm', 'new'),
        row('2026-10-23', 'kabbalas_shabbos', '6:00pm', 'gone', 'k'),
        row('2026-10-24', 'shacharis', '10:45am', 'gone', 's'),
        row('2026-10-24', 'mincha', '5:30pm', 'gone', 'mn'),
      ]),
      '2026-10-25': weekOf('2026-10-25', '2026-10-31', [row('2026-10-31', 'shacharis', '10:45am', 'gone', 's')]),
    })
    const out = await run({ full: true })
    expect(out).toMatchObject({ ok: true, filed: 1, check: { note: 'Their calendar for Oct 22–24 has none of their usual minyanim, so only its other services go on, each on its own date, and their usual times stay.' } })
    expect(schedulesFiled()).toEqual([expect.objectContaining({ from: '2026-10-23', to: '2026-10-23', mode: 'add', postedBy: 'website', minyanim: [expect.objectContaining({ tefillah: 'kabbalas_shabbos', time: '7:30pm' })] })])
    expect(schedulesFiled()[0]).not.toHaveProperty('kind')
  })

  it('the newsletter keeps the days it gave; the website’s week keeps its others', async () => {
    const newsletter = { id: 'n', name: 'Shabbos Noach', from: '2026-10-23', to: '2026-10-24', mode: 'replace', kind: 'week', minyanim: [{ id: 'n1', tefillah: 'kabbalas_shabbos', on: ['2026-10-23'], time: '5:55pm' }] }
    m.getResourceRowById.mockResolvedValue({ ...rodeph, details: { minyanim: usual, minyanim_schedules: [newsletter] } })
    const out = await run({ full: true })
    expect(out).toMatchObject({ filed: 1 })
    const site = schedulesFiled().find((x) => x.postedBy === 'website')!
    expect(site).toMatchObject({ from: '2026-10-22', to: '2026-10-22', minyanim: [expect.objectContaining({ on: ['2026-10-22'], time: '8:10am' })] })
    expect(schedulesFiled().find((x) => x.name === 'Shabbos Noach')).toMatchObject({ minyanim: [expect.objectContaining({ time: '5:55pm' })] })
  })

  it('its fingerprint stays the same all week, and changes when next week is added on Thursday', async () => {
    const { readListingPage } = await import('./listingPageRun')
    const at = async (iso: string) => menuHash((await readListingPage(URL_, { now: Date.parse(iso) }))!)
    expect(await at('2026-10-20T14:00:00Z')).toBe(await at('2026-10-21T14:00:00Z')) // Tue, Wed
    expect(await at('2026-10-21T14:00:00Z')).not.toBe(await at('2026-10-22T14:00:00Z')) // Thu
    const tue = await readListingPage(URL_, { now: Date.parse('2026-10-20T14:00:00Z') })
    expect(tue?.weeks).toEqual([{ sunday: '2026-10-18', from: '2026-10-20', to: '2026-10-24', lines: ['2026-10-20', '2026-10-22', '2026-10-23', '2026-10-24'].map((d) => expect.stringMatching(new RegExp(`^${d}`))) }])
  })
})

// Mikveh Israel, Oct 21: its calendar page's event list is empty, and the
// month is in pictures (calendarPictures.test.ts has which).
describe('a shul’s month posted as pictures', () => {
  const THU = Date.parse('2026-10-22T14:00:00Z')
  const OCT_PNG = 'https://images.squarespace-cdn.com/content/v1/mi/Oct.+High+Holiday+calendar+2026.png'
  const pictureHtml = (png = OCT_PNG) =>
    `<header><img src="/logo.png" alt="Congregation Mikveh Israel"></header><main><p>No results found</p><img data-image="${png}" data-image-dimensions="2550x3300" alt=""></main><footer>Office Hours Monday – Thursday 9 AM - 5 PM</footer>`
  const usual = [
    { id: 'sh', tefillah: 'shacharis', days: ['mon', 'thu'], time: '7:15am' },
    { id: 'sat', tefillah: 'shacharis', days: ['sat'], time: '9:00am' },
  ]
  const mikvehIsrael = { ...shul, id: 'mi', name: 'Congregation Mikveh Israel', details: { minyanim: usual } }
  type Row = TimesUpdate['rows'][number]
  const row = (day: string, tefillah: Row['tefillah'], time: string, status: Row['status'], rowId?: string): Row => ({ id: `${day}${tefillah}`, day, tefillah, time, status, ...(rowId ? { rowId } : {}), quote: time })
  const weekOf = (from: string, to: string, rows: Row[]): TimesUpdate => ({ kind: 'week', complete: true, season: null, title: null, startsOn: null, from, to, rows, otherSeason: 0 })
  const serve = (pictures: 'open' | 'gone' = 'open', html = pictureHtml()) =>
    m.fetchPublic.mockImplementation(async (url: string, o?: { pictures?: boolean }) =>
      url === URL_ ? { url, type: 'html', body: html } : pictures === 'open' && o?.pictures ? { url, type: 'picture', mime: 'image/png', body: `b64 of ${url}` } : null,
    )

  beforeEach(() => {
    m.getResourceRowById.mockResolvedValue(mikvehIsrael)
    serve()
    m.readShulWeek.mockImplementation(async (_l: unknown, _k: unknown, _s: unknown, _a: unknown, opts: { week: { from: string } }) => ({
      update:
        opts.week.from === '2026-10-22'
          ? weekOf('2026-10-22', '2026-10-24', [row('2026-10-22', 'shacharis', '7:15am', 'same', 'sh'), row('2026-10-23', 'other', '6:00pm', 'new'), row('2026-10-24', 'shacharis', '9:00am', 'same', 'sat')])
          : weekOf('2026-10-25', '2026-10-31', [row('2026-10-30', 'kabbalas_shabbos', '5:45pm', 'new'), row('2026-10-31', 'shacharis', '9:00am', 'same', 'sat')]),
      model: 'cheap',
    }))
  })

  it('a shul’s page with no calendar or times in its words is read for its calendar’s pictures', async () => {
    const { readListingPage, PICTURES_HEADING } = await import('./listingPageRun')
    const got = await readListingPage(URL_, { now: THU, pictures: true })
    expect(got).toMatchObject({ pdf: null, pictures: [`${OCT_PNG}?format=1500w`], weeks: [{ from: '2026-10-22', lines: [] }, { from: '2026-10-25', lines: [] }] })
    expect(got?.text?.startsWith(`${PICTURES_HEADING}\n${OCT_PNG}?format=1500w\nWeeks from 2026-10-18, 2026-10-25`)).toBe(true)
    // Not fetched to be found: only when the AI reads them.
    expect(m.fetchPublic).toHaveBeenCalledTimes(1)
    // A mikvah's page isn't looked at for one, and nor is a page that gives
    // its times in words.
    expect(await readListingPage(URL_, { now: THU })).toBeNull()
    serve('open', `${pictureHtml()}<p>Shacharit 7:15 AM Monday and Thursday. ${'Everyone is welcome to join us. '.repeat(6)}</p>`)
    expect((await readListingPage(URL_, { now: THU, pictures: true }))?.pictures).toBeUndefined()
  })

  it('its fingerprint changes when a picture is replaced, and from week to week', async () => {
    const { readListingPage } = await import('./listingPageRun')
    const at = async (iso: string) => menuHash((await readListingPage(URL_, { now: Date.parse(iso), pictures: true }))!)
    expect(await at('2026-10-20T14:00:00Z')).toBe(await at('2026-10-21T14:00:00Z')) // Tue, Wed
    expect(await at('2026-10-21T14:00:00Z')).not.toBe(await at('2026-10-22T14:00:00Z')) // Thu: next week added
    const before = await at('2026-10-22T14:00:00Z')
    serve('open', pictureHtml('https://images.squarespace-cdn.com/content/v1/mi/Oct.+calendar+2026+v2.png'))
    expect(await at('2026-10-22T14:00:00Z')).not.toBe(before)
  })

  it('reads the pictures a week at a time, and files each week as that week’s schedule', async () => {
    const out = await runListingPageWatch(changed, undefined, { apiKey: 'k', now: THU, full: true })
    expect(m.fetchPublic).toHaveBeenCalledWith(`${OCT_PNG}?format=1500w`, expect.objectContaining({ pictures: true }))
    expect(m.readShulWeek).toHaveBeenCalledTimes(2)
    for (const [, , source, , opts] of m.readShulWeek.mock.calls) {
      expect(source).toEqual({ images: [{ mime: 'image/png', b64: `b64 of ${OCT_PNG}?format=1500w` }] })
      expect(opts).toEqual({ week: expect.objectContaining({ lines: [] }) })
    }
    expect(out).toMatchObject({ ok: true, filed: 1, check: { from: 'pictures', result: 'differs' } })
    const weeks = m.submitListingUpdate.mock.calls[0][2].details.minyanim_schedules as { name: string; minyanim: { on: string[]; time: string }[] }[]
    expect(weeks.map((w) => [w.name, w.minyanim.map((x) => `${x.on[0]} ${x.time}`)])).toEqual([
      ['Times for Oct 18 – Oct 24', ['2026-10-22 7:15am', '2026-10-23 6:00pm', '2026-10-24 9:00am']],
      ['Times for Oct 25 – Oct 31', ['2026-10-30 5:45pm', '2026-10-31 9:00am']],
    ])
  })

  it('pictures that won’t open are said to, and nothing is read', async () => {
    serve('gone')
    const out = await runListingPageWatch(changed, undefined, { apiKey: 'k', now: THU, full: true })
    expect(out).toMatchObject({ ok: true, filed: 0, check: { from: 'pictures', note: 'Their calendar’s pictures couldn’t be opened.' } })
    expect(m.readShulWeek).not.toHaveBeenCalled()
  })
})

// A page that gives both seasons' times is compared season by season
// (compareTimes), each row marked with its season. Neither filter may
// cross seasons.
describe('both seasons on one page', () => {
  const row = (x: Partial<TimesUpdate['rows'][number]>): TimesUpdate['rows'][number] => ({ id: 'r', day: 'fri', tefillah: 'mincha_maariv', time: '7:00 PM', status: 'new', ...x })
  const update = (rows: TimesUpdate['rows']): TimesUpdate => ({ kind: 'schedule', complete: true, season: null, title: null, startsOn: null, from: null, to: null, rows, otherSeason: 0 })

  it('a page with only winter’s time takes no summer time off', async () => {
    const { keepUncovered } = await import('./listingPageRun')
    const u = keepUncovered(update([row({ status: 'gone', season: 'summer', rowId: 'a' }), row({ status: 'same', season: 'winter', rowId: 'b' })]))
    expect(u.rows.map((r) => r.status)).toEqual(['kept', 'same'])
  })

  it('winter’s 7:00 PM on the listing isn’t summer’s', async () => {
    const { dropListed } = await import('./listingPageRun')
    const listing = [{ id: 'w', tefillah: 'mincha_maariv' as const, days: ['fri' as const], time: '7:00pm', season: 'winter' as const }]
    expect(dropListed(update([row({ season: 'summer' })]), listing).rows).toHaveLength(1)
    expect(dropListed(update([row({ season: 'winter' })]), listing).rows).toHaveLength(0)
    expect(dropListed(update([row({})]), listing).rows).toHaveLength(0)
  })
})
