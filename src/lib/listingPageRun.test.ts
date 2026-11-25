import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import { menuHash } from './menuWatch'
import { LISTING_PAGE_FOUND_CREATOR, LISTING_PAGE_WATCH_NAME, NOTES_READ_FROM } from './listingPageWatch'
import type { WatchCheck } from './watches'
import type { TimesUpdate } from './scheduleUpdate'

const m = vi.hoisted(() => ({
  listCategoriesUncached: vi.fn(),
  getResourceRowById: vi.fn(),
  fetchPublic: vi.fn(),
  readShulWeek: vi.fn(),
  fetchDatesInfo: vi.fn(),
  otherShulReads: vi.fn(),
  otherShulPages: vi.fn(),
  left: [] as string[],
  readMessage: vi.fn(),
  submitListingUpdate: vi.fn(),
  replacePendingSuggestion: vi.fn(),
  confirmFromSource: vi.fn(),
  resolveCommunity: vi.fn(),
  pending: [] as unknown[],
  earlier: [] as unknown[],
  writes: [] as string[],
}))
// The watch's own community: its timezone and map centre are where its
// days are counted (not the static config's).
vi.mock('@/lib/communityStore', () => ({ resolveCommunity: m.resolveCommunity }))
vi.mock('@/lib/categoryStore', () => ({ listCategoriesUncached: m.listCategoriesUncached }))
vi.mock('@/lib/resourceStore', () => ({
  getResourceRowById: m.getResourceRowById,
  normalizeRow: (r: { details?: Record<string, unknown> }) => ({ ...r, ...(r.details ?? {}) }),
}))
vi.mock('@/lib/menuReader', async (orig) => ({ ...(await orig<typeof import('./menuReader')>()), fetchPublic: m.fetchPublic }))
// The reader is given what the old one was: a test says what the page
// reads as by its rows (`update`, or `updates`: a page's usual times, then
// each dated week), and the reader hands those back as the AI would, each
// time a page gives. `shape`, `heading` and `cancelled`: what the reader
// says the page is (shulTimes.ts). The days it's asked about stand in for
// the old reader's `week`.
vi.mock('@/lib/scheduleReader', async (orig) => ({
  ...(await orig<typeof import('./scheduleReader')>()),
  readRegular: async (source: unknown, days: { days: { date: string }[] }, name: string, opts: { apiKey: string }) => {
    const got = await m.readShulWeek({ name }, 'minyanim', source, opts.apiKey, { week: { from: days.days[0].date, to: days.days.at(-1)!.date } })
    m.left = got.elsewhere ?? []
    const updates: TimesUpdate[] = got.updates ?? [got.update]
    const first = updates[0]
    return {
      kind: first.kind,
      complete: first.complete,
      season: first.season,
      title: first.title,
      startsOn: first.startsOn,
      from: first.kind === 'week' ? first.from : null,
      to: first.kind === 'week' ? first.to : null,
      ...(got.shape ? { shape: got.shape } : {}),
      ...(got.heading ? { heading: got.heading } : {}),
      ...(got.cancelled ? { cancelled: got.cancelled } : {}),
      times: updates.flatMap((u) =>
        u.rows
          .filter((r) => r.status !== 'gone' && r.status !== 'kept')
          .map((r) => {
            const dated = /^\d{4}-\d{2}-\d{2}$/.test(r.day)
            return {
              id: r.id,
              tefillah: r.tefillah,
              days: dated ? [] : [r.day],
              ...(dated ? { date: r.day } : {}),
              time: r.time,
              ...(r.anchor ? { anchor: r.anchor, offsetMinutes: r.offsetMinutes } : {}),
              ...(r.notes ? { notes: r.notes } : {}),
              ...(r.season ? { notes: [r.notes, r.season === 'winter' ? 'Winter only' : 'Summer only'].filter(Boolean).join('; ') } : {}),
              quote: r.quote ?? '',
              checked: true,
            }
          }),
      ),
      model: 'cheap',
    }
  },
}))
// What it left out as another shul's: what the test said.
vi.mock('@/lib/heldElsewhere', () => ({ leaveOutHeldElsewhere: async (times: unknown[]) => ({ times: [...times], left: m.left }) }))
// Zmanim and the days' names: none needed, and none fetched.
vi.mock('@/lib/dateZmanim', () => ({ fetchDatesInfo: m.fetchDatesInfo }))
// No other page of the shul's has been read, unless a test says.
vi.mock('@/lib/watchStore', () => ({ otherShulReads: m.otherShulReads, otherShulPages: m.otherShulPages, getReadings: async () => ({}) }))
vi.mock('@/lib/messageReader', async (orig) => ({ ...(await orig<typeof import('./messageReader')>()), readMessage: m.readMessage }))
vi.mock('@/lib/submissionStore', () => ({ submitListingUpdate: m.submitListingUpdate, replacePendingSuggestion: m.replacePendingSuggestion }))
vi.mock('@/lib/email', () => ({}))
// A page that agrees dates the listing by name (Oct 23). Mocked so a call
// is seen, not made.
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

const { runListingPageWatch, listedAs, weeklyReadDue } = await import('./listingPageRun')
const { pageReadsFor } = await import('./listingPageWatch')
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
// Next week is read from Thursday on (calendarWeeks).
const THU_OCT_22 = Date.parse('2026-10-22T11:00:00Z')
/** NOW's week's Sunday: a shul's page read this week (readWeek), as
 *  checks before Oct 26 kept it. */
const THIS_WEEK = '2026-10-18'
/** NOW's day: what a read keeps as readWeek now. */
const TODAY = '2026-10-20'
/** The last check, made with the listing as it is now (listedAs). */
const lastRead = (row: { details?: Record<string, unknown> }, category: typeof shulCategory, result: WatchCheck['result'] = 'agrees'): WatchCheck => ({
  at: '2026-10-19T11:00:00Z',
  what: category === shulCategory ? 'times' : 'hours',
  from: 'page',
  result,
  read: [],
  differences: [],
  queue: null,
  listedAs: listedAs({ ...row, ...(row.details ?? {}) } as never, pageReadsFor(category)!),
  // Read this week (NOW's), so not due its weekly read.
  ...(category === shulCategory ? { readWeek: THIS_WEEK } : {}),
})

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

const PHILLY = { slug: 'philly', name: 'Philadelphia', timezone: 'America/New_York', mapCenter: { lat: 39.95, lng: -75.16 } }

beforeEach(() => {
  vi.clearAllMocks()
  // A run without its own `now` reads the week from the clock.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  m.pending = []
  m.earlier = []
  m.writes = []
  m.listCategoriesUncached.mockResolvedValue([shulCategory, mikvahCategory])
  m.getResourceRowById.mockResolvedValue(shul)
  m.fetchPublic.mockResolvedValue(page)
  m.readShulWeek.mockResolvedValue({ update: moved, model: 'cheap' })
  m.resolveCommunity.mockResolvedValue(PHILLY)
  m.fetchDatesInfo.mockResolvedValue({ zmanim: {}, names: {} })
  m.otherShulReads.mockResolvedValue([])
  m.otherShulPages.mockResolvedValue([])
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
    // It waits on the shul's own screen, and its email says so.
    // Its reads spent: left for a later morning, its fingerprint unset.
    m.readShulWeek.mockClear()
    expect(await runListingPageWatch(found, { ...newMenuReadBudget(), aiReads: 0, timesReads: 0 }, { apiKey: 'k' })).toEqual({ ok: true, filed: 0, skipped: true })
    expect(m.readShulWeek).not.toHaveBeenCalled()
    // Once read, it's read again only when it changes.
    expect(await runListingPageWatch({ ...found, pageHash: await hashOfPage(), lastCheck: lastRead(shul, shulCategory, 'differs') }, undefined, { apiKey: 'k' })).toEqual({ ok: true, filed: 0, pageHash: await hashOfPage() })
  })

  it('an unchanged page that differed is left alone: no AI, nothing filed, the listing not dated', async () => {
    const out = await runListingPageWatch({ ...watch, pageHash: await hashOfPage(), lastCheck: lastRead(shul, shulCategory, 'differs') }, undefined, { apiKey: 'k' })
    expect(out).toEqual({ ok: true, filed: 0, pageHash: await hashOfPage() })
    expect(m.readShulWeek).not.toHaveBeenCalled()
    expect(m.confirmFromSource).not.toHaveBeenCalled()
    expect(m.writes).toEqual([])
  })

  // Oct 26: a page that posts next week's times by changing nothing else
  // (or only on a calendar the text never shows) was never read again.
  it('an unchanged page last read in an earlier week is read again, files what differs, and says the week', async () => {
    const lastWeek = { ...lastRead(shul, shulCategory, 'differs'), at: '2026-10-13T11:00:00Z', readWeek: '2026-10-11' }
    const out = await runListingPageWatch({ ...watch, pageHash: await hashOfPage(), lastCheck: lastWeek }, newMenuReadBudget(), { apiKey: 'k', now: NOW })
    expect(out).toMatchObject({ ok: true, filed: 1, check: { result: 'differs', queue: 'filed', readWeek: TODAY } })
    expect(m.readShulWeek).toHaveBeenCalledTimes(1)
    // A check from before readWeek was kept is due too.
    m.readShulWeek.mockClear()
    await runListingPageWatch({ ...watch, pageHash: await hashOfPage(), lastCheck: { ...lastWeek, readWeek: undefined } }, newMenuReadBudget(), { apiKey: 'k', now: NOW })
    expect(m.readShulWeek).toHaveBeenCalledTimes(1)
  })

  // Oct 26: the week's read moved to Friday night (Saturday's run), so the
  // week after is up at havdalah, and Thursday night (Friday's) was added,
  // for this Shabbos's times.
  it('an unchanged page is read again Friday morning and Saturday morning, not between', async () => {
    const at = (iso: string) => Date.parse(iso)
    const read = (readWeek: string, now: number) =>
      runListingPageWatch({ ...watch, pageHash: hashed, lastCheck: { ...lastRead(shul, shulCategory, 'differs'), readWeek } }, newMenuReadBudget(), { apiKey: 'k', now })
    const hashed = await hashOfPage()
    // Read Sunday; Friday 3 AM (Thursday night) is due.
    expect(await read('2026-10-25', at('2026-10-30T07:00:00Z'))).toMatchObject({ check: { readWeek: '2026-10-30' } })
    expect(m.readShulWeek).toHaveBeenCalledTimes(1)
    // Read Friday; Saturday 3 AM (Friday night) is due again.
    expect(await read('2026-10-30', at('2026-10-31T07:00:00Z'))).toMatchObject({ check: { readWeek: '2026-10-31' } })
    expect(m.readShulWeek).toHaveBeenCalledTimes(2)
    // Read Saturday; not again Sunday to Thursday.
    for (const day of ['2026-11-01', '2026-11-03', '2026-11-05']) expect(await read('2026-10-31', at(`${day}T08:00:00Z`))).toEqual({ ok: true, filed: 0, pageHash: hashed })
    expect(m.readShulWeek).toHaveBeenCalledTimes(2)
  })

  it('weeklyReadDue: Friday and Saturday are their own; any other day, the Saturday before', () => {
    expect(['2026-10-25', '2026-10-26', '2026-10-29', '2026-10-30', '2026-10-31'].map(weeklyReadDue)).toEqual(['2026-10-24', '2026-10-24', '2026-10-24', '2026-10-30', '2026-10-31'])
  })

  it('a listing-moved compare is not the week’s read: it leaves readWeek as it was', async () => {
    const before = { ...lastRead({ ...shul, details: { minyanim: [{ ...minyan, time: '6:00pm' }] } }, shulCategory), readWeek: THIS_WEEK }
    m.readShulWeek.mockResolvedValue({ update: agrees, model: 'cheap' })
    const out = await runListingPageWatch({ ...watch, pageHash: await hashOfPage(), lastCheck: before }, newMenuReadBudget(), { apiKey: 'k', now: NOW })
    expect(out).toMatchObject({ ok: true, filed: 0, check: { result: 'agrees' } })
    expect((out as { check: WatchCheck }).check.readWeek).toBeUndefined()
  })


  // B'nai Abraham's and Society Hill's dates sat at their last approval
  // while their pages agreed every morning.
  it('an unchanged page that agreed, the listing as it was, dates the listing again without the AI', async () => {
    const out = await runListingPageWatch({ ...watch, pageHash: await hashOfPage(), lastCheck: lastRead(shul, shulCategory) }, undefined, { apiKey: 'k', now: NOW })
    expect(out).toEqual({ ok: true, filed: 0, pageHash: await hashOfPage() })
    expect(m.readShulWeek).not.toHaveBeenCalled()
    expect(m.confirmFromSource).toHaveBeenCalledWith('philly', ['s1'], 'Lower Merion Synagogue', ['weekday', 'shabbos', 'week'], '2026-10-20T11:00:00.000Z')
  })

  // The listing changed since (an approval, a newsletter): whether the page
  // agrees is about the listing as it stands, so it's read again, once.
  it('an unchanged page is read again once the listing moves, dating it if they agree and filing nothing if not', async () => {
    const before = lastRead({ ...shul, details: { minyanim: [{ ...minyan, time: '6:00pm' }] } }, shulCategory)
    m.readShulWeek.mockResolvedValue({ update: agrees, model: 'cheap' })
    const same = { ...watch, pageHash: await hashOfPage(), lastCheck: before }
    expect(await runListingPageWatch(same, newMenuReadBudget(), { apiKey: 'k', now: NOW })).toMatchObject({ ok: true, filed: 0, check: { result: 'agrees', listedAs: lastRead(shul, shulCategory).listedAs } })
    expect(m.confirmFromSource).toHaveBeenCalledTimes(1)
    // A standing difference is the listing being newer: said, never filed.
    m.confirmFromSource.mockClear()
    m.readShulWeek.mockResolvedValue({ update: moved, model: 'cheap' })
    expect(await runListingPageWatch(same, newMenuReadBudget(), { apiKey: 'k', now: NOW })).toMatchObject({ ok: true, filed: 0, check: { result: 'differs', queue: null } })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
    expect(m.confirmFromSource).not.toHaveBeenCalled()
    // Never compared yet (a check from before Oct 23): read once too.
    m.readShulWeek.mockClear()
    await runListingPageWatch({ ...same, lastCheck: { ...before, listedAs: undefined } }, newMenuReadBudget(), { apiKey: 'k', now: NOW })
    expect(m.readShulWeek).toHaveBeenCalledTimes(1)
    // From its own reads, never a changed page's.
    const budget = { aiReads: 1, compares: 0 }
    m.readShulWeek.mockClear()
    expect(await runListingPageWatch(same, budget, { apiKey: 'k', now: NOW })).toEqual({ ok: true, filed: 0, skipped: true })
    expect(m.readShulWeek).not.toHaveBeenCalled()
    expect(budget.aiReads).toBe(1)
  })

  it('a changed page is read by the AI, and a changed time goes to the queue as from their website', async () => {
    const out = await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })
    expect(out).toEqual({
      ok: true,
      filed: 1,
      pageHash: await hashOfPage(),
      check: { what: 'times', from: 'page', result: 'differs', read: ['Mincha Sun 6:05 PM'], differences: ['Changed: mincha · Sun · 6:05pm, was 6:15pm'], queue: 'filed', parts: [{ part: 'weekday', size: 1 }], listedAs: expect.any(String), readWeek: TODAY },
    })
    expect(m.readShulWeek).toHaveBeenCalledWith({ name: 'Lower Merion Synagogue' }, 'minyanim', { text: expect.stringContaining('Sunday Mincha 6:05pm') }, 'k', expect.anything())
    expect(m.fetchDatesInfo.mock.calls[0][0]).toEqual({ latitude: PHILLY.mapCenter.lat, longitude: PHILLY.mapCenter.lng, timezone: PHILLY.timezone })
    const [community, target, payload, note, by] = m.submitListingUpdate.mock.calls[0]
    expect([community, target, by]).toEqual(['philly', 's1', { name: LISTING_PAGE_WATCH_NAME }])
    expect(payload.details.minyanim).toEqual([expect.objectContaining({ tefillah: 'mincha', days: ['sun'], time: '6:05pm' })])
    expect(note).toBe(`From their website, changed Oct 20: ${URL_}\n\nChanged: mincha · Sun · 6:05pm, was 6:15pm`)
    expect(payload.source).toMatchObject({ readBy: 'ai', from: 'Lower Merion Synagogue’s website', note: `From their website, changed Oct 20: ${URL_}` })
    expect(payload.source.original).toContain('Sunday Mincha 6:05pm')
  })

  // A minyan the page says is held at another shul the guide already has
  // (Mekor's "Mincha at 1818 Market or Mikveh Israel", Oct 23): the reader
  // leaves it out, and the check says so.
  // Nov 18 review: every community's page was read on Philly's clock and
  // centre (community.config), whatever community the watch was in.
  it('reads a page in its own community’s timezone, and gives the reader that community’s centre', async () => {
    m.resolveCommunity.mockResolvedValue({ ...PHILLY, slug: 'hnl', name: 'Honolulu', timezone: 'Pacific/Honolulu', mapCenter: { lat: 21.3, lng: -157.86 } })
    await runListingPageWatch({ ...changed, communityId: 'hnl' }, undefined, { apiKey: 'k', now: NOW })
    expect(m.resolveCommunity).toHaveBeenCalledWith('hnl')
    expect(m.fetchDatesInfo.mock.calls[0][0]).toEqual({ latitude: 21.3, longitude: -157.86, timezone: 'Pacific/Honolulu' })
  })

  it('says what it left out as another shul’s', async () => {
    m.readShulWeek.mockResolvedValue({ update: moved, model: 'cheap', elsewhere: ['Left out: Mincha 2:00pm, already on Kahal Kadosh Mikveh Israel'] })
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })).toMatchObject({
      filed: 1,
      check: { note: 'Left out: Mincha 2:00pm, already on Kahal Kadosh Mikveh Israel.' },
    })
  })

  // The user, Oct 23 (it was "the AI reads, it never confirms", Oct 19):
  // "If the website shows it then the website shows it".
  it('a changed page that agrees with the listing files nothing, and dates it by name', async () => {
    m.readShulWeek.mockResolvedValue({ update: agrees, model: 'cheap' })
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })).toEqual({
      ok: true,
      filed: 0,
      pageHash: await hashOfPage(),
      check: { what: 'times', from: 'page', result: 'agrees', read: ['Mincha Sun 6:15 PM'], differences: [], queue: null, parts: [{ part: 'weekday', size: 1 }], listedAs: lastRead(shul, shulCategory).listedAs, readWeek: TODAY },
    })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
    expect(m.confirmFromSource).toHaveBeenCalledWith('philly', ['s1'], 'Lower Merion Synagogue', ['weekday', 'shabbos', 'week'], '2026-10-20T11:00:00.000Z')
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

  it('a page of one week’s times goes to the queue as that week’s times, marked as from the website', async () => {
    m.readShulWeek.mockResolvedValue({ update: week, model: 'cheap' })
    // Said of the page, so Reads names it "This week’s schedule".
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: THU_OCT_22 })).toMatchObject({ ok: true, filed: 1, check: { parts: [{ part: 'week', size: 1 }] } })
    const payload = m.submitListingUpdate.mock.calls[0][2]
    expect(payload.details.minyanim).toEqual([expect.objectContaining({ days: ['sun'], time: '6:15pm' })])
    expect(payload.details.minyanim_schedules).toEqual([
      expect.objectContaining({ kind: 'week', postedBy: 'website', from: '2026-10-25', minyanim: [expect.objectContaining({ on: ['2026-10-25'], time: '6:05pm' })] }),
    ])
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
    const budget = { ...newMenuReadBudget(), aiReads: 0, timesReads: 0 }
    expect(await runListingPageWatch(changed, budget, { apiKey: 'k' })).toEqual({ ok: true, filed: 0, skipped: true })
    expect(m.readShulWeek).not.toHaveBeenCalled()
    // Never the menus' own reads (MENU_READS_PER_RUN).
    expect(budget.menuReads).toBe(newMenuReadBudget().menuReads)
  })

  // Oct 26: a Sunday's new weeks waited days behind the menus for the
  // run's 3 reads. A shul's page takes its own first, then the run's.
  it('takes the run’s times reads first, then the run’s reads', async () => {
    const budget = { ...newMenuReadBudget(), aiReads: 1, timesReads: 1 }
    expect(await runListingPageWatch(changed, budget, { apiKey: 'k', now: NOW })).toMatchObject({ filed: 1 })
    expect(budget).toMatchObject({ timesReads: 0, aiReads: 1 })
    expect(await runListingPageWatch(changed, budget, { apiKey: 'k', now: NOW })).toMatchObject({ filed: 1 })
    expect(budget).toMatchObject({ timesReads: 0, aiReads: 0 })
  })

  it('says why when it can’t do its job', async () => {
    expect(await runListingPageWatch({ ...watch, resourceId: null })).toEqual({ ok: false, error: 'Tie this watch to the listing it keeps current' })
    m.fetchPublic.mockResolvedValue(null)
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k' })).toEqual({ ok: false, error: 'Couldn’t read the page (blocked, moved, or built in the browser)' })
    // What the site said, when it said something.
    m.fetchPublic.mockImplementation(async (_url: string, o: { trouble?: (t: unknown) => void }) => (o.trouble?.({ why: 'refused', status: 403 }), null))
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k' })).toEqual({ ok: false, error: 'Couldn’t read the page: it turned the reader away (403)' })
    m.fetchPublic.mockImplementation(async (_url: string, o: { trouble?: (t: unknown) => void }) => (o.trouble?.({ why: 'unreachable', timedOut: true }), null))
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k' })).toEqual({ ok: false, error: 'Couldn’t read the page: it didn’t answer in time' })
    m.fetchPublic.mockReset()
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
    // The weekdays and Shabbos, each its own finding (timesParts.ts).
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })).toMatchObject({ ok: true, filed: 2 })
    const notes = m.submitListingUpdate.mock.calls.map(([, , payload, note]) => [payload.source.part.part, note.split('\n\n')[1].split('\n')])
    expect(notes).toEqual([['weekday', ['Changed: Mincha · Sun, 6:05 PM, was 6:15 PM', 'New: Maariv · Mon, 9 PM']], ['shabbos', ['Changed: Shacharis · Sat, 10 PM, was 10 AM']]])
  })

  // The user, Oct 21: "There are three possible shul times it's changing.
  // Usual shabbos, usual weekday, this week. Readings should very clearly
  // fall into one of those." Sons of Israel had three whole proposals
  // waiting at once, one per page.
  describe('a part at a time', () => {
    const sat = (id: string, time: string) => ({ id, day: 'sat', tefillah: 'shacharis', time, status: 'new' as const, quote: time })
    const shabbosRead = (...rows: ReturnType<typeof sat>[]) => m.readShulWeek.mockResolvedValue({ update: { ...moved, rows: [...moved.rows, ...rows] }, model: 'cheap' })
    const shabbosPart = (rows: object[]) => ({
      id: 'p1',
      payload: { details: { minyanim: [minyan, ...rows] }, source: { readBy: 'ai', from: 'x', part: { part: 'shabbos', field: 'minyanim' } } },
    })

    it('files each part as its own finding, saying which, with only that part changed', async () => {
      shabbosRead(sat('n', '9:00am'))
      expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })).toMatchObject({ filed: 2 })
      const [weekday, shabbos] = m.submitListingUpdate.mock.calls.map(([, , payload]) => payload)
      expect(weekday.source.part).toEqual({ part: 'weekday', field: 'minyanim' })
      expect(weekday.details.minyanim).toEqual([expect.objectContaining({ tefillah: 'mincha', days: ['sun'], time: '6:05pm' })])
      expect(shabbos.source.part).toEqual({ part: 'shabbos', field: 'minyanim' })
      expect(shabbos.details.minyanim).toEqual([minyan, expect.objectContaining({ tefillah: 'shacharis', days: ['sat'], time: '9:00am' })])
    })

    // Nov 25, Sons of Israel's Tefillot page: "Maariv takes place within 5
    // minutes of the time for Havdalah", and its Teen Mincha/Maariv
    // "concurrent to the main sanctuary's schedule", filed in place of
    // the listing's times from Havdalah and sunset.
    it('a usual time in words, not a clock or a rule, isn’t filed', async () => {
      shabbosRead(
        { ...sat('h', 'within 5 minutes of the time for Havdalah'), tefillah: 'maariv' },
        { ...sat('c', 'concurrent to the main sanctuary’s schedule for Mincha and Maariv'), tefillah: 'mincha_maariv' },
      )
      expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })).toMatchObject({ filed: 1 })
      expect(m.submitListingUpdate.mock.calls.map(([, , p]) => p.source.part.part)).toEqual(['weekday'])
      // Nor does the listing's own minyan come off for it: the page still
      // has its Teen Mincha, in words.
      m.submitListingUpdate.mockClear()
      const teen = { id: 't', tefillah: 'mincha', days: ['sat'], time: '45 min before Sunset', anchor: 'sunset', offsetMinutes: -45, notes: 'Teen Mincha' }
      const main = { ...teen, id: 'u', notes: 'Followed by Seudah Shlishit.' }
      m.getResourceRowById.mockResolvedValue({ ...shul, details: { minyanim: [minyan, main, teen] } })
      // A whole schedule, as its Tefillot page is: what it leaves out goes.
      const whole = [
        { ...sat('s', '45 min before Sunset'), tefillah: 'mincha', anchor: 'sunset', offsetMinutes: -45, notes: 'Followed by Seudah Shlishit.' },
        { ...sat('c', 'concurrent to the main sanctuary’s schedule for Mincha and Maariv'), tefillah: 'mincha_maariv' },
      ]
      m.readShulWeek.mockResolvedValue({ update: { ...moved, complete: true, rows: [...moved.rows, ...whole] }, model: 'cheap' })
      await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })
      expect(m.submitListingUpdate.mock.calls.map(([, , p]) => p.source.part.part)).toEqual(['weekday'])
      m.getResourceRowById.mockResolvedValue(shul)
      // A rule from a zman is a time.
      m.submitListingUpdate.mockClear()
      shabbosRead({ ...sat('r', '5 min before Havdalah'), tefillah: 'maariv', anchor: 'havdalah', offsetMinutes: -5 } as ReturnType<typeof sat>)
      expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })).toMatchObject({ filed: 2 })
    })

    it('a part waiting from another page holds back only that part, unless this page gives more of it', async () => {
      m.pending = [shabbosPart([{ id: 'a', tefillah: 'shacharis', days: ['sat'], time: '9:00am' }, { id: 'b', tefillah: 'mincha', days: ['sat'], time: '5:00pm' }])]
      shabbosRead(sat('n', '8:30am'))
      expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })).toMatchObject({ filed: 1 })
      expect(m.submitListingUpdate.mock.calls.map(([, , p]) => p.source.part.part)).toEqual(['weekday'])
      expect(m.replacePendingSuggestion).not.toHaveBeenCalled()
    })

    it('a page giving more of a part waiting replaces it, still pending', async () => {
      m.pending = [shabbosPart([{ id: 'a', tefillah: 'shacharis', days: ['sat'], time: '9:00am' }])]
      m.replacePendingSuggestion.mockResolvedValue(true)
      shabbosRead(sat('n', '8:30am'), { ...sat('o', '5:00pm'), tefillah: 'mincha' })
      expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })).toMatchObject({ filed: 2 })
      const [community, id, payload] = m.replacePendingSuggestion.mock.calls[0]
      expect([community, id, payload.source.part.part, payload.details.minyanim.length]).toEqual(['philly', 'p1', 'shabbos', 3])
      expect(m.submitListingUpdate.mock.calls.map(([, , p]) => p.source.part.part)).toEqual(['weekday'])
    })

    // The user, Nov 23, on Sons of Israel: its home page's box of usual
    // times (a summary, out of date) and its Tefillot page each filed the
    // other's undoing, night after night. A shul's own schedule page is
    // where its usual times come from (docs/how-we-work.md).
    describe('the home page and the shul’s schedule page', () => {
      const HOME = 'https://lms.example/'
      const home = { ...changed, url: HOME }
      const fromHome = (rows: object[]) => {
        const p = shabbosPart(rows)
        return { ...p, payload: { ...p.payload, source: { ...p.payload.source, note: `From their website, changed Oct 19: ${HOME}` } } }
      }

      it('the home page doesn’t file a usual part another of its pages gives', async () => {
        m.otherShulPages.mockResolvedValue([{ url: URL_, parts: [{ part: 'shabbos', size: 6 }] }])
        shabbosRead(sat('n', '9:00am'))
        const o = await runListingPageWatch(home, undefined, { apiKey: 'k', now: NOW })
        expect(m.submitListingUpdate.mock.calls.map(([, , p]) => p.source.part.part)).toEqual(['weekday'])
        expect(o).toMatchObject({ filed: 1, check: { note: expect.stringContaining(URL_) } })
      })

      it('it still files a part no other page gives', async () => {
        m.otherShulPages.mockResolvedValue([{ url: URL_, parts: [{ part: 'week', size: 6 }] }])
        shabbosRead(sat('n', '9:00am'))
        expect(await runListingPageWatch(home, undefined, { apiKey: 'k', now: NOW })).toMatchObject({ filed: 2 })
      })

      it('another page that isn’t the home page doesn’t hold one back', async () => {
        m.otherShulPages.mockResolvedValue([{ url: 'https://lms.example/shabbat', parts: [{ part: 'shabbos', size: 6 }] }])
        shabbosRead(sat('n', '9:00am'))
        expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })).toMatchObject({ filed: 2 })
      })

      it('the schedule page replaces what the home page has waiting, whatever its size', async () => {
        m.pending = [fromHome([{ id: 'a', tefillah: 'shacharis', days: ['sat'], time: '9:00am' }, { id: 'b', tefillah: 'mincha', days: ['sat'], time: '5:00pm' }])]
        m.replacePendingSuggestion.mockResolvedValue(true)
        shabbosRead(sat('n', '8:30am'))
        expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })).toMatchObject({ filed: 2 })
        expect(m.replacePendingSuggestion.mock.calls.map(([, id]) => id)).toEqual(['p1'])
      })
    })

    it('the same part waiting as read here is left as it is', async () => {
      m.pending = [shabbosPart([{ id: 'z', tefillah: 'shacharis', days: ['sat'], time: '9:00am' }])]
      shabbosRead(sat('n', '9:00am'))
      await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })
      expect(m.submitListingUpdate.mock.calls.map(([, , p]) => p.source.part.part)).toEqual(['weekday'])
      expect(m.replacePendingSuggestion).not.toHaveBeenCalled()
    })

    it('a part filed before, as a part or inside a whole reading, isn’t filed again', async () => {
      shabbosRead(sat('n', '9:00am'))
      m.earlier = [{ payload: { details: { minyanim: [{ ...minyan, time: '6:05pm' }, { id: 'q', tefillah: 'shacharis', days: ['sat'], time: '9:00am' }] } } }]
      expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })).toMatchObject({ filed: 0 })
      expect(m.submitListingUpdate).not.toHaveBeenCalled()
    })

    it('anything else waiting, a person’s edit, still holds back the lot', async () => {
      m.pending = [{ id: 'x', payload: { details: {} } }]
      shabbosRead(sat('n', '9:00am'))
      expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW })).toEqual({ ok: true, filed: 0 })
      expect(m.readShulWeek).not.toHaveBeenCalled()
      expect((await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW, full: true })).check?.queue).toBe('waiting')
      expect(m.submitListingUpdate).not.toHaveBeenCalled()
    })
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

  it('reads an unchanged page with the AI and says it agrees, filing nothing and dating the listing', async () => {
    m.readShulWeek.mockResolvedValue({ update: agrees, model: 'cheap' })
    const out = await runListingPageWatch({ ...watch, pageHash: await hashOfPage() }, undefined, full)
    expect(out).toEqual({
      ok: true,
      filed: 0,
      pageHash: await hashOfPage(),
      check: { what: 'times', from: 'page', result: 'agrees', read: ['Mincha Sun 6:15 PM'], differences: [], queue: null, parts: [{ part: 'weekday', size: 1 }], listedAs: expect.any(String), readWeek: TODAY },
    })
    expect(m.readShulWeek).toHaveBeenCalled()
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
    expect(m.confirmFromSource).toHaveBeenCalledTimes(1)
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

  // Hours don't come a week at a time: an unchanged page stays unread.
  it('is not read again each week while its page is unchanged', async () => {
    const lastWeek = { ...lastRead(mikvah, mikvahCategory as typeof shulCategory, 'differs'), at: '2026-10-06T11:00:00Z' }
    const out = await runListingPageWatch({ ...watch, resourceId: 'mk1', pageHash: await hashOfPage(), lastCheck: lastWeek }, newMenuReadBudget(), { apiKey: 'k', now: NOW })
    expect(out).toEqual({ ok: true, filed: 0, pageHash: await hashOfPage() })
    expect(m.readMessage).not.toHaveBeenCalled()
  })

  // Oct 26: Lower Merion's men's page and Ohel Leah's what-to-expect waited
  // behind suggestions approved Oct 23, and said "Waiting for you" with
  // nothing to open.
  describe('a difference that waited behind a suggestion', () => {
    const behind = async () => ({ ...watch, resourceId: 'mk1', pageHash: await hashOfPage(), lastCheck: { ...lastRead(mikvah, mikvahCategory as typeof shulCategory, 'differs'), queue: 'waiting' as const } })

    it('is read again in full once nothing waits for the listing, and files what still differs', async () => {
      m.readMessage.mockResolvedValue(reading('19:30'))
      expect(await runListingPageWatch(await behind(), newMenuReadBudget(), { apiKey: 'k', now: NOW })).toMatchObject({ ok: true, filed: 1, check: { result: 'differs', queue: 'filed' } })
    })

    it('clears when the page now agrees', async () => {
      m.readMessage.mockResolvedValue(reading('19:00'))
      expect(await runListingPageWatch(await behind(), newMenuReadBudget(), { apiKey: 'k', now: NOW })).toMatchObject({ ok: true, filed: 0, check: { result: 'agrees' } })
    })

    it('is left alone while a suggestion still waits', async () => {
      m.pending = [{ id: 'p', payload: { details: {} } }]
      expect(await runListingPageWatch(await behind(), newMenuReadBudget(), { apiKey: 'k', now: NOW })).toEqual({ ok: true, filed: 0, pageHash: await hashOfPage() })
      expect(m.readMessage).not.toHaveBeenCalled()
    })
  })

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

  // Hours in no section are the contact box’s (pageReadBoxes).
  it('files nothing, and dates the hours’ box, when the hours agree', async () => {
    m.readMessage.mockResolvedValue(reading('19:00'))
    expect(await runListingPageWatch({ ...changed, resourceId: 'mk1' }, undefined, { apiKey: 'k', now: NOW })).toMatchObject({ ok: true, filed: 0 })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
    expect(m.confirmFromSource).toHaveBeenCalledWith('philly', ['mk1'], 'Mikvah Ohel Leah', ['contact'], '2026-10-20T11:00:00.000Z')
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

// Mikvah hours as drawn (Oct 21) shows a mikvah as its listing's sections,
// Use this taking one whole, so a reading is filed a section at a time; and
// it reads notes too (the user, Oct 22: "by appointment, 48 hours ahead").
describe('runListingPageWatch: a mikvah’s sections, each filed on its own', () => {
  const category = makeCategory({
    id: 'mikvah',
    detailFields: [
      { key: 'womenTevillah', label: 'Women’s Tevillah', type: 'boolean', filterLabel: 'Women’s' },
      { key: 'menTevillah', label: 'Men’s Tevillah', type: 'boolean', filterLabel: 'Men’s' },
      { key: 'women_s_hours', label: 'Women’s Hours', type: 'hours', audienceKey: 'womenTevillah' },
      { key: 'women_s_notes', label: 'Women’s Notes', type: 'textarea', audienceKey: 'womenTevillah' },
      { key: 'men_s_hours', label: 'Men’s Hours', type: 'hours', audienceKey: 'menTevillah' },
      { key: 'men_s_notes', label: 'Men’s Notes', type: 'textarea', audienceKey: 'menTevillah' },
    ],
  })
  const evening = { open: '20:30', close: '22:30' }
  const NOTE = 'Schedule your appointment (48 hours advance notice would be appreciated)'
  const place = {
    id: 'mk',
    category: 'mikvah',
    name: 'Mikvah Mei Shalva',
    status: 'approved',
    details: { womenTevillah: true, menTevillah: true, women_s_hours: { mon: evening }, women_s_notes: NOTE, men_s_hours: { sun: { open: '04:30', close: '10:00' } }, men_s_notes: '' },
  }
  const reading = (changes: unknown[]) => ({
    proposals: [{ kind: 'fields', listingId: 'mk', asWritten: 'Mikvah Mei Shalva', ask: null, changes, note: null, quote: '', checked: true }],
    model: 'cheap',
  })
  const women = { key: 'women_s_hours', hours: { days: ['mon'], open: '19:30', close: '21:30', closed: false, when: 'every_week' } }
  const men = { key: 'men_s_hours', hours: { days: ['sun'], open: '05:00', close: '10:00', closed: false, when: 'every_week' } }
  const SECTION = (section: string) => ({ section, keys: section === 'womenTevillah' ? ['women_s_hours', 'women_s_notes'] : ['men_s_hours', 'men_s_notes'] })
  const filedFor = (section: string, details: Record<string, unknown>, url = URL_) => ({ id: `f-${section}`, payload: { details, source: { readBy: 'ai', from: 'x', note: `From their website, read Oct 20: ${url}`, section: SECTION(section) } } })
  const run = () => runListingPageWatch({ ...changed, resourceId: 'mk' }, undefined, { apiKey: 'k', now: NOW, full: true })

  beforeEach(() => {
    m.getResourceRowById.mockResolvedValue(place)
    m.listCategoriesUncached.mockResolvedValue([category])
  })

  it('files each section the page changes as its own finding, saying which, with only that section changed', async () => {
    m.readMessage.mockResolvedValue(reading([women, men]))
    expect(await run()).toMatchObject({ ok: true, filed: 2, check: { result: 'differs', queue: 'filed' } })
    const [[, , w, wNote], [, , mn]] = m.submitListingUpdate.mock.calls
    expect(w.source.section).toEqual(SECTION('womenTevillah'))
    expect(w.details).toMatchObject({ women_s_hours: { mon: { open: '19:30', close: '21:30' } }, men_s_hours: place.details.men_s_hours })
    expect(wNote).toContain('Women’s Hours, Monday: 8:30 PM–10:30 PM → 7:30 PM–9:30 PM')
    expect(wNote).not.toContain('Men’s')
    expect(mn.source.section).toEqual(SECTION('menTevillah'))
    expect(mn.details).toMatchObject({ women_s_hours: place.details.women_s_hours, men_s_hours: { sun: { open: '05:00', close: '10:00' } } })
  })

  it('reads a section’s note: one that says what the listing does is read, not “can’t be read”', async () => {
    m.readMessage.mockResolvedValue(reading([{ key: 'women_s_notes', value: NOTE }]))
    expect(await run()).toMatchObject({ ok: true, filed: 0, check: { result: 'agrees', read: [`Women’s Notes: ${NOTE}`] } })
    const [source, catalog] = m.readMessage.mock.calls[0]
    expect(source.text).toContain(`Women’s Notes: ${NOTE}`)
    expect(catalog.categories[0].fields.map((f: { key: string }) => f.key)).toContain('women_s_notes')
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  it('files a changed note as its section’s', async () => {
    m.readMessage.mockResolvedValue(reading([{ key: 'women_s_notes', value: 'Appointments must be made at least 48 hours in advance.' }]))
    expect(await run()).toMatchObject({ ok: true, filed: 1 })
    const [, , payload] = m.submitListingUpdate.mock.calls[0]
    expect(payload.source.section.section).toBe('womenTevillah')
    expect(payload.details.women_s_notes).toBe('Appointments must be made at least 48 hours in advance.')
  })

  // Lower Merion's page sets its paragraphs a blank line apart (Oct 22).
  it('a note in the listing’s words, set out differently, is the same note', async () => {
    m.readMessage.mockResolvedValue(reading([{ key: 'women_s_notes', value: NOTE.replace(' (48', '\n\n(48 ') }]))
    expect(await run()).toMatchObject({ ok: true, filed: 0, check: { result: 'agrees', differences: [] } })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  // The user, Oct 22: "not viewing some notes as updates". Ohel Leah's
  // pages hadn't changed since notes began to be read, so the morning run
  // never read them for their notes.
  it('a page unchanged since before notes were read is read once more for them, then left alone', async () => {
    m.readMessage.mockResolvedValue(reading([{ key: 'women_s_notes', value: 'Contact us for daytime bridal appointments.' }]))
    const same = { ...watch, resourceId: 'mk', pageHash: await hashOfPage() }
    const daily = (w: typeof same & { lastCheck?: WatchCheck | null }) => runListingPageWatch(w, newMenuReadBudget(), { apiKey: 'k', now: NOW })
    expect(await daily(same)).toMatchObject({ ok: true, filed: 1, check: { result: 'differs' } })
    expect(m.submitListingUpdate.mock.calls[0][3]).toContain('read Oct 20')
    const check = (at: string): WatchCheck => ({ ...lastRead(place, category), at })
    expect(await daily({ ...same, lastCheck: check('2026-10-21T12:00:00Z') })).toMatchObject({ ok: true, filed: 1 })
    m.readMessage.mockClear()
    expect(await daily({ ...same, lastCheck: check(NOTES_READ_FROM) })).toEqual({ ok: true, filed: 0, pageHash: await hashOfPage() })
    expect(m.readMessage).not.toHaveBeenCalled()
  })

  it('a section waiting holds back only that section; from this page, it’s replaced by what the page says now', async () => {
    m.readMessage.mockResolvedValue(reading([women, men]))
    m.replacePendingSuggestion.mockResolvedValue(true)
    m.pending = [filedFor('menTevillah', { ...place.details, men_s_hours: { sun: { open: '06:00', close: '10:00' } } })]
    expect(await run()).toMatchObject({ ok: true, filed: 2 })
    expect(m.submitListingUpdate.mock.calls.map((c) => c[2].source.section.section)).toEqual(['womenTevillah'])
    expect(m.replacePendingSuggestion.mock.calls[0][1]).toBe('f-menTevillah')
  })

  it('one waiting from another page is left for the admin', async () => {
    m.readMessage.mockResolvedValue(reading([men]))
    m.pending = [filedFor('menTevillah', { ...place.details, men_s_hours: { sun: { open: '06:00', close: '10:00' } } }, 'https://other.example/')]
    expect(await run()).toMatchObject({ ok: true, filed: 0, check: { queue: 'waiting' } })
    expect(m.replacePendingSuggestion).not.toHaveBeenCalled()
  })

  it('a section filed before, as a section or inside a whole reading, isn’t filed again', async () => {
    m.readMessage.mockResolvedValue(reading([women]))
    const as = { ...place.details, women_s_hours: { mon: { open: '19:30', close: '21:30' } } }
    m.earlier = [{ payload: { details: as } }]
    expect(await run()).toMatchObject({ ok: true, filed: 0, check: { queue: 'before' } })
    m.earlier = [filedFor('womenTevillah', as)]
    expect(await run()).toMatchObject({ ok: true, filed: 0, check: { queue: 'before' } })
  })

  // A part waiting kept the old fingerprint, so the page read as changed,
  // and was AI-read, every night until an admin decided. Once nothing
  // waits, the page is read again (stoodBehind) (Nov 18 review).
  it('the nightly run reads a page once while a part of it waits, not every night', async () => {
    m.readMessage.mockResolvedValue(reading([men]))
    m.pending = [filedFor('menTevillah', { ...place.details, men_s_hours: { sun: { open: '06:00', close: '10:00' } } }, 'https://other.example/')]
    const daily = (w: Parameters<typeof runListingPageWatch>[0]) => runListingPageWatch(w, newMenuReadBudget(), { apiKey: 'k', now: NOW })
    const first = await daily({ ...changed, resourceId: 'mk' })
    expect(first).toMatchObject({ ok: true, filed: 0, pageHash: await hashOfPage(), check: { queue: 'waiting' } })
    m.readMessage.mockClear()
    // As the runner saves it, read since notes are (NOTES_READ_FROM).
    await daily({ ...changed, resourceId: 'mk', pageHash: first.ok ? first.pageHash! : null, lastCheck: first.ok && first.check ? { ...first.check, at: NOTES_READ_FROM } : null })
    expect(m.readMessage).not.toHaveBeenCalled()
  })

  it('anything else waiting, a person’s edit, still holds back the lot', async () => {
    m.readMessage.mockResolvedValue(reading([women]))
    m.pending = [{ id: 'p', payload: { details: {} } }]
    expect(await run()).toMatchObject({ ok: true, filed: 0, check: { queue: 'waiting' } })
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
    const got = await readListingPage(URL_, { timezone: 'America/New_York', now: OCT_20 })
    // A feed may be bigger than a page (Kol Tzedek's Google Calendar, 4.8 MB).
    expect(m.fetchPublic).toHaveBeenCalledWith('https://lms.example/events/?ical=1', expect.objectContaining({ maxBytes: 20_000_000 }))
    expect(got?.text).toBe(`${CALENDAR_HEADING}\n2026-10-23 (Fri) 6:00 PM: Shabbat Evening Service\n\nExport Month view`)
  })

  // Nov 5: a "Join our WhatsApp group" button, its address only behind it.
  it('gives the reader a WhatsApp group’s address beside its words', async () => {
    const { readListingPage } = await import('./listingPageRun')
    const times = 'Weekday Shacharis 6:45am and 7:30am. Mincha 1:30pm. Shabbos Shacharis 9:00am, Mincha 20 minutes before candle lighting. '.repeat(2)
    m.fetchPublic.mockResolvedValue({ url: URL_, type: 'html', body: `<p>${times}Maariv 8:00pm, if we have ten. <a href="https://chat.whatsapp.com/Ab12Cd34Ef56Gh">Join our WhatsApp group</a> <a href="/about">About</a></p>` })
    expect((await readListingPage(URL_, { timezone: 'America/New_York', now: OCT_20 }))?.text).toContain('Maariv 8:00pm, if we have ten. Join our WhatsApp group (https://chat.whatsapp.com/Ab12Cd34Ef56Gh) About')
  })

  // Sons of Israel (Nov 21–24): ShulCloud prints today's date on every
  // page, so the page "changed" each night and was read by the AI again.
  it('leaves out a line that only gives today’s date, so the page reads the same each day', async () => {
    const { readListingPage } = await import('./listingPageRun')
    const page = (stamp: string) => `<p>Sundays: 7:00am &amp; 8:00am</p><p>Weekdays: 6:45am &amp; 8:15am</p><div>${stamp}</div><p>${"Mincha and Maariv approximately 15 minutes before shkiah. ".repeat(4)}</p>`
    m.fetchPublic.mockResolvedValueOnce({ url: URL_, type: 'html', body: page('Tue, October 20, 2026 9 Cheshvan 5787') })
    const tue = (await readListingPage(URL_, { timezone: 'America/New_York', now: OCT_20 }))?.text
    m.fetchPublic.mockResolvedValueOnce({ url: URL_, type: 'html', body: page('Wed, October 21, 2026 10 Cheshvan 5787') })
    const wed = (await readListingPage(URL_, { timezone: 'America/New_York', now: OCT_20 + 86_400_000 }))?.text
    expect(tue).toBe(wed)
    expect(tue).toContain('Weekdays: 6:45am & 8:15am')
    expect(tue).not.toContain('5787')
  })

  it('reads a watch whose address is the feed itself, and an event list in the page’s scripts', async () => {
    const { readListingPage } = await import('./listingPageRun')
    m.fetchPublic.mockResolvedValue({ url: URL_, type: 'html', body: feed })
    expect((await readListingPage(URL_, { timezone: 'America/New_York', now: OCT_20 }))?.text).toContain('2026-10-23 (Fri) 6:00 PM: Shabbat Evening Service')
    m.fetchPublic.mockResolvedValue({ url: URL_, type: 'html', body: '<script>x = [{"title":"10:30 AM Shabbat Morning Service","start":"2026-10-24","allDay":true}]</script>' })
    expect((await readListingPage(URL_, { timezone: 'America/New_York', now: OCT_20 }))?.text).toContain('2026-10-24 (Sat) 10:30 AM: Shabbat Morning Service')
  })

  // The Little Shul (Oct 23): its Google Calendar's one service is the
  // first Shabbos of the month, so most weeks it has none, and the watch
  // said only that it couldn't find times.
  it('a calendar with no services in its weeks says so, and names its next', async () => {
    const { readListingPage, runListingPageWatch } = await import('./listingPageRun')
    const monthly = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:s\r\nDTSTART;TZID=America/New_York:20140705T100000\r\nRRULE:FREQ=MONTHLY;BYDAY=1SA\r\nSUMMARY:Sabbath Service\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'
    const words = `<iframe src="https://calendar.google.com/calendar/embed?src=thelittleshul%40gmail.com&amp;ctz=America%2FNew_York"></iframe><p>${'The Little Shul, a small egalitarian congregation in Queen Village. '.repeat(4)}</p>`
    m.fetchPublic.mockImplementation(async (url: string) => (url === URL_ ? { url, type: 'html', body: words } : { url, type: 'html', body: monthly }))
    expect((await readListingPage(URL_, { timezone: 'America/New_York', now: OCT_20 }))?.calendarEmpty).toEqual({ from: '2026-10-18', to: '2026-10-24', next: { date: '2026-11-07', time: '10:00 AM', title: 'Sabbath Service' } })
    m.readShulWeek.mockResolvedValue({ update: { ...moved, rows: [] }, model: 'cheap' })
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: OCT_20, full: true })).toMatchObject({
      check: { result: 'nothing', note: 'Their calendar has no services Oct 18 – Oct 24. Next: Sat Nov 7, 10:00 AM, Sabbath Service.' },
    })
  })

  // Saturday 11:30pm in Philadelphia is already Sunday in Jerusalem: a
  // community there reads the week starting that Sunday.
  it('counts the calendar’s weeks from the community’s own day', async () => {
    const { readListingPage } = await import('./listingPageRun')
    const monthly = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:s\r\nDTSTART;TZID=America/New_York:20140705T100000\r\nRRULE:FREQ=MONTHLY;BYDAY=1SA\r\nSUMMARY:Sabbath Service\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'
    const words = `<iframe src="https://calendar.google.com/calendar/embed?src=thelittleshul%40gmail.com"></iframe><p>${'The Little Shul, a small egalitarian congregation in Queen Village. '.repeat(4)}</p>`
    m.fetchPublic.mockImplementation(async (url: string) => (url === URL_ ? { url, type: 'html', body: words } : { url, type: 'html', body: monthly }))
    const SAT_NIGHT = Date.parse('2026-10-25T03:30:00Z')
    expect((await readListingPage(URL_, { timezone: 'America/New_York', now: SAT_NIGHT }))?.calendarEmpty?.from).toBe('2026-10-18')
    expect((await readListingPage(URL_, { timezone: 'Asia/Jerusalem', now: SAT_NIGHT }))?.calendarEmpty?.from).toBe('2026-10-25')
  })

  it('a page with no calendar and next to no words isn’t readable', async () => {
    const { readListingPage } = await import('./listingPageRun')
    m.fetchPublic.mockResolvedValue({ url: URL_, type: 'html', body: '<header>Leyv Ha-Ir</header><footer>Philadelphia</footer>' })
    expect(await readListingPage(URL_, { timezone: 'America/New_York', now: OCT_20 })).toBeNull()
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
  const schedulesFiled = () => m.submitListingUpdate.mock.calls[0][2].details.minyanim_schedules as { name: string; from: string; to: string; kind?: string; mode: string; postedBy?: string; whole?: boolean; minyanim: { tefillah: string; on: string[]; time: string }[] }[]

  beforeEach(() => {
    m.getResourceRowById.mockResolvedValue(rodeph)
    m.fetchPublic.mockResolvedValue({ url: URL_, type: 'html', body: ics })
    byWeek({ '2026-10-22': thisWeek, '2026-10-25': nextWeek })
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

  // Nov 19: what a page files is decided part by part (shulTimes.ts), and
  // filed as that part's week (shulWeekFiling.ts).
  it('files the weekdays’ change as the weekdays’ week, from the website, and keeps the read for the shul’s other pages', async () => {
    const out = await run()
    expect(out).toMatchObject({ ok: true, filed: 1 })
    const filed = schedulesFiled() as (ReturnType<typeof schedulesFiled>[number] & { parts?: string[] })[]
    expect(filed.map((w) => [w.parts, w.postedBy, w.kind, w.mode, w.minyanim.map((x) => `${x.on[0]} ${x.time}`)])).toEqual([[['weekdays'], 'website', 'week', 'replace', ['2026-10-22 8:10am']]])
    const reads = (out as { check: WatchCheck }).check.shulReads ?? []
    expect(reads.map((r) => [r.source.kind, r.shows.from])).toEqual([
      ['calendar', '2026-10-22'],
      ['calendar', '2026-10-25'],
    ])
  })

  it('a part the newsletter usually gives waits for it while it’s due, and says so', async () => {
    const letter = (sat: string) => ({ id: `l${sat}`, name: 'Shabbos', from: sat, to: sat, mode: 'replace', kind: 'week', minyanim: [{ id: `x${sat}`, tefillah: 'shacharis', time: '10:45am', on: [sat] }] })
    m.getResourceRowById.mockResolvedValue({ ...rodeph, details: { ...rodeph.details, minyanim_schedules: [letter('2026-10-10'), letter('2026-10-17')] } })
    byWeek({
      '2026-10-22': weekOf('2026-10-22', '2026-10-24', [row('2026-10-23', 'kabbalas_shabbos', '6:30pm', 'changed', 'k'), row('2026-10-24', 'shacharis', '10:45am', 'same', 's')]),
      '2026-10-25': weekOf('2026-10-25', '2026-10-31', []),
    })
    const out = await run()
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
    expect((out as { check: WatchCheck }).check.note).toContain('Their newsletter usually gives Shabbos')
  })

  it('its fingerprint stays the same all week, and changes when next week is added on Thursday', async () => {
    const { readListingPage } = await import('./listingPageRun')
    const at = async (iso: string) => menuHash((await readListingPage(URL_, { timezone: 'America/New_York', now: Date.parse(iso) }))!)
    expect(await at('2026-10-20T14:00:00Z')).toBe(await at('2026-10-21T14:00:00Z')) // Tue, Wed
    expect(await at('2026-10-21T14:00:00Z')).not.toBe(await at('2026-10-22T14:00:00Z')) // Thu
    const tue = await readListingPage(URL_, { timezone: 'America/New_York', now: Date.parse('2026-10-20T14:00:00Z') })
    expect(tue?.weeks).toEqual([{ sunday: '2026-10-18', from: '2026-10-20', to: '2026-10-24', lines: ['2026-10-20', '2026-10-22', '2026-10-23', '2026-10-24'].map((d) => expect.stringMatching(new RegExp(`^${d}`))) }])
  })

  // The user, Oct 22: the watch "didn't pick up on … zoom link for 8:10
  // minyan". Its feed gives the minyan's page, and the page the link.
  describe('a service’s join link, from its own page', () => {
    const PAGE = 'https://rodephshalom.org/event/community-morning-minyan-108-2-2-2/2026-10-22/'
    const POTLUCK = 'https://rodephshalom.org/event/potluck/2026-10-23/'
    const ZOOM = 'https://upenn.zoom.us/j/97084263584'
    const withPages = [
      'BEGIN:VCALENDAR',
      ...event('2026-10-22', '0810', 'Online Community Morning Minyan').slice(0, -1),
      `URL:${PAGE}`,
      `LOCATION:${PAGE}`,
      'END:VEVENT',
      ...event('2026-10-23', '1800', 'Kabbalat Shabbat'),
      ...event('2026-10-23', '1900', 'Sisterhood Potluck').slice(0, -1),
      `URL:${POTLUCK}`,
      'END:VEVENT',
      ...event('2026-10-24', '1045', 'Shabbat Morning Service'),
      'END:VCALENDAR',
    ].join('\r\n')
    const eventPage = `<main><p>Every Thursday from 8:10-8:40 a.m. on Zoom</p><p>Join Zoom <a href="${ZOOM}">here</a>.</p></main><footer><a href="https://www.youtube.com/c/RodephShalomPhiladelphia">Youtube</a></footer>`

    beforeEach(() => {
      m.fetchPublic.mockImplementation(async (url: string) => {
        if (url === URL_) return { url, type: 'html', body: withPages }
        if (url === PAGE || url === POTLUCK) return { url, type: 'html', body: eventPage }
        return null
      })
      byWeek({ '2026-10-22': thisWeek, '2026-10-25': weekOf('2026-10-25', '2026-10-31', []) })
    })

    it('files the minyan’s Zoom link on its date, the admin told; the reader is given the calendar’s lines alone', async () => {
      expect(await run()).toMatchObject({ ok: true, filed: 1 })
      const [one] = schedulesFiled() as { minyanim: { on: string[]; time: string; joinLink?: string }[] }[]
      // Its Shabbos is the usual one, so only Thursday's minyan is asked about.
      expect(one.minyanim.map((x) => [x.on[0], x.time, x.joinLink ?? null])).toEqual([['2026-10-22', '8:10am', ZOOM]])
      expect(m.submitListingUpdate.mock.calls[0][3]).toContain('Shacharis Thu Oct 22 8:10am')
      expect(m.readShulWeek.mock.calls[0][2].text).not.toContain('zoom')
    })

    it('opens only a service’s page, and its link is in the page’s fingerprint', async () => {
      const { readListingPage, JOINS_HEADING } = await import('./listingPageRun')
      const got = await readListingPage(URL_, { timezone: 'America/New_York', now: THU })
      const opened = m.fetchPublic.mock.calls.map(([u]) => u)
      expect(opened).toContain(PAGE)
      expect(opened).not.toContain(POTLUCK)
      expect(got?.text).toContain(`${JOINS_HEADING}\n2026-10-22 8:10 AM: ${ZOOM}`)
      expect(got?.weeks?.[0].joins).toEqual([{ date: '2026-10-22', time: '8:10 AM', link: ZOOM }])
      m.fetchPublic.mockImplementation(async (url: string) => (url === URL_ ? { url, type: 'html', body: withPages } : null))
      const unopened = await readListingPage(URL_, { timezone: 'America/New_York', now: THU })
      expect(menuHash(unopened!)).not.toBe(menuHash(got!))
      expect(unopened?.weeks?.[0]).not.toHaveProperty('joins')
    })
  })
})

// Nov 19: a shul's pages are weighed together. A calendar read on its own
// page last night speaks for the week over a homepage's box.
describe('runListingPageWatch: a shul’s other pages', () => {
  const THU = Date.parse('2026-10-22T14:00:00Z')
  const usual = [{ id: 's', tefillah: 'shacharis', days: ['sat'], time: '10:45am' }]
  const rodeph = { ...shul, id: 'rs', name: 'Congregation Rodeph Shalom', details: { minyanim: usual } }
  const box: TimesUpdate = {
    kind: 'week', complete: false, season: null, title: 'This Shabbat', startsOn: null, from: '2026-10-24', to: '2026-10-24', otherSeason: 0,
    rows: [{ id: 'b', day: '2026-10-24', tefillah: 'shacharis', time: '11:00am', status: 'changed', was: '10:45am', rowId: 's', quote: 'Shabbat 11:00am' }],
  }
  const calendar = {
    source: { id: 'https://rodephshalom.org/calendar', kind: 'calendar' as const, label: 'their calendar', at: '2026-10-22T09:00:00Z' },
    shape: 'schedule' as const,
    shows: { from: '2026-10-18', to: '2026-10-24' },
    times: [{ date: '2026-10-24', tefillah: 'shacharis' as const, time: '10:45am' }],
  }

  beforeEach(() => {
    m.getResourceRowById.mockResolvedValue(rodeph)
    m.readShulWeek.mockResolvedValue({ update: box, model: 'cheap', shape: 'highlight', heading: 'This Shabbat' })
  })

  it('a homepage’s different time is asked about on its own', async () => {
    expect(await runListingPageWatch(changed, undefined, { apiKey: 'k', now: THU })).toMatchObject({ ok: true, filed: 1 })
  })

  it('is left to the calendar another page gave for that week', async () => {
    m.otherShulReads.mockResolvedValue([calendar])
    const out = await runListingPageWatch(changed, undefined, { apiKey: 'k', now: THU })
    expect(m.otherShulReads).toHaveBeenCalledWith('philly', 'rs', URL_)
    expect(out).toMatchObject({ ok: true, filed: 0 })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
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
    const got = await readListingPage(URL_, { timezone: 'America/New_York', now: THU, pictures: true })
    expect(got).toMatchObject({ pdf: null, pictures: [`${OCT_PNG}?format=1500w`], weeks: [{ from: '2026-10-22', lines: [] }, { from: '2026-10-25', lines: [] }] })
    expect(got?.text?.startsWith(`${PICTURES_HEADING}\n${OCT_PNG}?format=1500w\nWeeks from 2026-10-18, 2026-10-25`)).toBe(true)
    // Not fetched to be found: only when the AI reads them.
    expect(m.fetchPublic).toHaveBeenCalledTimes(1)
    // A mikvah's page isn't looked at for one, and nor is a page that gives
    // its times in words.
    expect(await readListingPage(URL_, { timezone: 'America/New_York', now: THU })).toBeNull()
    serve('open', `${pictureHtml()}<p>Shacharit 7:15 AM Monday and Thursday. ${'Everyone is welcome to join us. '.repeat(6)}</p>`)
    expect((await readListingPage(URL_, { timezone: 'America/New_York', now: THU, pictures: true }))?.pictures).toBeUndefined()
  })

  it('its fingerprint changes when a picture is replaced, and from week to week', async () => {
    const { readListingPage } = await import('./listingPageRun')
    const at = async (iso: string) => menuHash((await readListingPage(URL_, { timezone: 'America/New_York', now: Date.parse(iso), pictures: true }))!)
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
      expect(opts).toEqual({ week: { from: expect.any(String), to: expect.any(String) } })
    }
    expect(out).toMatchObject({ ok: true, filed: 1, check: { from: 'pictures', result: 'differs' } })
    // This week agrees with the usual times (Friday's 6pm is a time the reader
    // couldn't name, so it's left out); next week's Kabbalas Shabbos is new.
    const weeks = m.submitListingUpdate.mock.calls[0][2].details.minyanim_schedules as { name: string; parts?: string[]; whole?: boolean; minyanim: { on: string[]; time: string }[] }[]
    expect(weeks.map((w) => [w.name, w.parts, w.whole, w.minyanim.map((x) => `${x.on[0]} ${x.time}`)])).toEqual([
      ['Times for Oct 25 – Oct 31', ['shabbos'], true, ['2026-10-30 5:45pm', '2026-10-31 9:00am']],
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
    const { keepUncovered } = await import('./shulPageRead')
    const u = keepUncovered(update([row({ status: 'gone', season: 'summer', rowId: 'a' }), row({ status: 'same', season: 'winter', rowId: 'b' })]))
    expect(u.rows.map((r) => r.status)).toEqual(['kept', 'same'])
  })

  it('winter’s 7:00 PM on the listing isn’t summer’s', async () => {
    const { dropListed } = await import('./shulPageRead')
    const listing = [{ id: 'w', tefillah: 'mincha_maariv' as const, days: ['fri' as const], time: '7:00pm', season: 'winter' as const }]
    expect(dropListed(update([row({ season: 'summer' })]), listing).rows).toHaveLength(1)
    expect(dropListed(update([row({ season: 'winter' })]), listing).rows).toHaveLength(0)
    expect(dropListed(update([row({})]), listing).rows).toHaveLength(0)
  })
})

// The user, Oct 22, on Sons of Israel: its calendar gives this Saturday's
// Shacharis at 9:00 AM, its Tefillot page "8:30", and the suggestion to
// make 8:30 the usual time came back on every read. "Always go with the
// page that has a date."
describe('the page with a date wins', () => {
  const row = (x: Partial<TimesUpdate['rows'][number]>): TimesUpdate['rows'][number] => ({ id: 'r', day: 'sat', tefillah: 'shacharis', time: '8:30am', status: 'changed', was: '9:00AM', rowId: 'ms', ...x })
  const update = (rows: TimesUpdate['rows']): TimesUpdate => ({ kind: 'schedule', complete: false, season: null, title: null, startsOn: null, from: null, to: null, rows, otherSeason: 0 })
  const sat9 = { date: '2026-10-24', tefillah: 'shacharis' as const, time: '9:00AM' }
  const TODAY = '2026-10-20'

  it('a usual time a date gives otherwise is taken out; one it agrees with stays', async () => {
    const { yieldToDated } = await import('./shulPageRead')
    expect(yieldToDated(update([row({})]), [sat9], TODAY).rows).toEqual([])
    expect(yieldToDated(update([row({ status: 'new', was: undefined })]), [sat9], TODAY).rows).toEqual([])
    expect(yieldToDated(update([row({ time: '9:00 AM', status: 'new' })]), [sat9], TODAY).rows).toHaveLength(1)
    // Taking off a time the date gives: kept.
    expect(yieldToDated(update([row({ time: '9:00AM', status: 'gone' })]), [sat9], TODAY).rows.map((r) => r.status)).toEqual(['kept'])
  })

  it('holds a time only against its own weekday and tefillah, a date from today on, a clock time, all year', async () => {
    const { yieldToDated } = await import('./shulPageRead')
    const keeps = (x: Partial<TimesUpdate['rows'][number]>, dated: Parameters<typeof yieldToDated>[1] = [sat9], u: Partial<TimesUpdate> = {}) =>
      expect(yieldToDated({ ...update([row(x)]), ...u }, dated, TODAY).rows).toHaveLength(1)
    keeps({ day: 'sun' })
    keeps({ tefillah: 'mincha' })
    keeps({}, [{ ...sat9, date: '2026-10-17' }])
    keeps({ time: '45 min before Sunset', anchor: 'sunset', offsetMinutes: -45 })
    keeps({}, [{ ...sat9, time: '5 min before Havdalah', anchor: 'havdalah' }])
    keeps({ season: 'summer' })
    keeps({}, [sat9], { season: 'winter' })
    keeps({}, [sat9], { kind: 'week' })
  })

  const listingWith = (details: Record<string, unknown>) =>
    m.getResourceRowById.mockResolvedValue({ ...shul, details: { minyanim: [minyan, { id: 'ms', tefillah: 'shacharis', days: ['sat'], time: '9:00AM', notes: 'Main Sanctuary' }], ...details } })
  const week = { id: 'wk', kind: 'week', mode: 'replace', name: 'Times for Oct 18 – Oct 24', from: '2026-10-18', to: '2026-10-24', postedBy: 'website', minyanim: [{ id: 'x', on: ['2026-10-24'], tefillah: 'shacharis', time: '9:00AM' }] }
  const tefillot = { ...moved, rows: [...moved.rows, row({ quote: 'Shabbat Shacharit 8:30am' })] }

  it('an undated page’s Shabbos time isn’t filed against the calendar’s week on the listing, and says why', async () => {
    listingWith({ minyanim_schedules: [week] })
    m.readShulWeek.mockResolvedValue({ update: tefillot, model: 'cheap' })
    const got = await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW, full: true })
    expect(m.submitListingUpdate.mock.calls.map(([, , p]) => p.source.part.part)).toEqual(['weekday'])
    expect(got.check?.differences.join('\n')).not.toContain('8:30')
    expect(got.check?.note).toMatch(/the date wins/)
  })

  it('nor against a calendar’s week another page filed, still waiting', async () => {
    listingWith({})
    m.pending = [{ id: 'p-week', payload: { details: { minyanim_schedules: [week] }, source: { readBy: 'ai', from: 'x', part: { part: 'week', field: 'minyanim', schedules: ['wk'] } } } }]
    m.readShulWeek.mockResolvedValue({ update: tefillot, model: 'cheap' })
    await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW, full: true })
    expect(m.submitListingUpdate.mock.calls.map(([, , p]) => p.source.part.part)).toEqual(['weekday'])
  })

  it('nor against a date the same page gives', async () => {
    listingWith({})
    const dated: TimesUpdate = { ...moved, kind: 'week', from: '2026-10-18', to: '2026-10-24', rows: [{ id: 'd', day: '2026-10-24', tefillah: 'shacharis', time: '9:00AM', status: 'same', rowId: 'ms' }] }
    m.readShulWeek.mockResolvedValue({ update: tefillot, updates: [tefillot, dated], model: 'cheap' })
    await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW, full: true })
    expect(m.submitListingUpdate.mock.calls.map(([, , p]) => p.source.part.part)).not.toContain('shabbos')
  })

  it('with no date given, the usual time is filed as before', async () => {
    listingWith({})
    m.readShulWeek.mockResolvedValue({ update: tefillot, model: 'cheap' })
    await runListingPageWatch(changed, undefined, { apiKey: 'k', now: NOW, full: true })
    expect(m.submitListingUpdate.mock.calls.map(([, , p]) => p.source.part.part)).toEqual(['weekday', 'shabbos'])
  })
})

// Its phone and email (contactRead.ts, Oct 22): only what Google doesn't
// keep, read by code, filed as a box of their own.
describe('runListingPageWatch: a page’s phone and email', () => {
  const withPhone = (words: string) => `<html><body><h1>Davening times</h1><p>Sunday Mincha 6:15pm. ${words} ${'Our shul welcomes everyone to daven with us. '.repeat(6)}</p></body></html>`
  const hashOf = async (body: string) => {
    const { htmlToText } = await import('./menuReader')
    return menuHash({ url: URL_, text: htmlToText(body), pdf: null })
  }
  const leyv = { ...shul, phone: '(215) 629-1995' }
  const lastCheck = { ...lastRead(shul, shulCategory), read: ['Mincha Sun 6:15 PM'] }

  it('reads an unchanged page never read for its phone, without the AI, keeping what it last read', async () => {
    m.getResourceRowById.mockResolvedValue(leyv)
    const body = withPhone('Call 215.629.1995.')
    m.fetchPublic.mockResolvedValue({ ...page, body })
    const out = await runListingPageWatch({ ...watch, pageHash: await hashOf(body), lastCheck }, undefined, { apiKey: 'k' })
    expect(out).toEqual({ ok: true, filed: 0, pageHash: await hashOf(body), check: { ...lastCheck, contact: { same: ['phone'], changes: [] } } })
    expect(m.readShulWeek).not.toHaveBeenCalled()
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
    // Read for it once: then left alone until the page changes.
    const again = await runListingPageWatch({ ...watch, pageHash: await hashOf(body), lastCheck: { ...lastCheck, contact: { same: ['phone'], changes: [] } } }, undefined, { apiKey: 'k' })
    expect(again).toEqual({ ok: true, filed: 0, pageHash: await hashOf(body) })
  })

  it('files a changed phone as its own box, on its own keys', async () => {
    m.getResourceRowById.mockResolvedValue(leyv)
    const body = withPhone('Call us: 215-555-0100.')
    m.fetchPublic.mockResolvedValue({ ...page, body })
    const out = await runListingPageWatch({ ...watch, pageHash: await hashOf(body), lastCheck }, undefined, { apiKey: 'k', now: NOW })
    expect(out).toMatchObject({ ok: true, filed: 1, check: { result: 'differs', queue: 'filed', contact: { same: [], changes: ['phone'] } } })
    const [, id, payload, note, by] = m.submitListingUpdate.mock.calls[0]
    expect(id).toBe('s1')
    expect(payload).toMatchObject({ phone: '(215) 555-0100', source: { section: { section: 'contact', keys: ['phone'] } } })
    expect(note).toContain('Phone')
    expect(by).toEqual({ name: LISTING_PAGE_WATCH_NAME })
    // A phone that differs dates nothing.
    expect(m.confirmFromSource).not.toHaveBeenCalled()
    // Waiting already, as read: not filed again.
    m.submitListingUpdate.mockClear()
    m.pending = [{ id: 'p1', payload: { ...payload } }]
    const twice = await runListingPageWatch({ ...watch, pageHash: await hashOf(body), lastCheck }, undefined, { apiKey: 'k', now: NOW })
    expect(twice).toMatchObject({ ok: true, filed: 0, check: { queue: 'waiting', contact: { changes: ['phone'] } } })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  it('never reads a phone Google keeps', async () => {
    m.getResourceRowById.mockResolvedValue({ ...leyv, details: { ...leyv.details, placeId: 'ChIJ', googleFields: ['phone'] } })
    const body = withPhone('Call us: 215-555-0100.')
    m.fetchPublic.mockResolvedValue({ ...page, body })
    expect(await runListingPageWatch({ ...watch, pageHash: await hashOf(body), lastCheck }, undefined, { apiKey: 'k' })).toEqual({ ok: true, filed: 0, pageHash: await hashOf(body) })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  it('has the AI read no hours Google keeps: a food place’s page is read for its phone alone', async () => {
    const restaurant = makeCategory({ id: 'restaurant', detailFields: [{ key: 'hours', label: 'Hours', type: 'hours' }] })
    m.listCategoriesUncached.mockResolvedValue([restaurant])
    m.getResourceRowById.mockResolvedValue({ id: 'r1', category: 'restaurant', name: 'Chalavita', status: 'approved', phone: '(929) 666-1482', details: { placeId: 'x', googleFields: ['name', 'hours'] } })
    const body = `<html><body><p>Open daily 8am. Call 929 666 1482. ${'Fresh dairy food. '.repeat(15)}</p></body></html>`
    m.fetchPublic.mockResolvedValue({ ...page, body })
    const out = await runListingPageWatch({ ...watch, resourceId: 'r1', pageHash: 'old' }, undefined, { apiKey: 'k' })
    expect(m.readMessage).not.toHaveBeenCalled()
    expect(out).toMatchObject({ ok: true, filed: 0, pageHash: await hashOf(body), check: { what: 'hours', result: 'nothing', contact: { same: ['phone'], changes: [] } } })
    // Its phone agreed, so its Contact box is dated by it (the user, Nov 5).
    expect(m.confirmFromSource).toHaveBeenCalledWith('philly', ['r1'], 'Chalavita', ['contact'], expect.any(String))
  })

  // The Kosher Grill's page, Nov 5: its phone as listed every night, and
  // dishes the listing didn't have on the same page, so nothing it read
  // "agreed" and its Contact box said "Not confirmed yet".
  it('dates the Contact box by a phone that agrees, whatever else on the page differs', async () => {
    m.getResourceRowById.mockResolvedValue(leyv)
    const body = withPhone('Call 215.629.1995.')
    m.fetchPublic.mockResolvedValue({ ...page, body })
    const differs = { ...lastCheck, result: 'differs' as const, differences: ['Not on the listing: Deli Sandwiches'], contact: { same: ['phone'], changes: [] } }
    await runListingPageWatch({ ...watch, pageHash: await hashOf(body), lastCheck: differs }, undefined, { apiKey: 'k', now: NOW })
    expect(m.confirmFromSource).toHaveBeenCalledWith('philly', ['s1'], shul.name, ['contact'], new Date(NOW).toISOString())
  })
  // Oct 25 (the user): every kind of place. A hotel has no hours to read,
  // so its page is read for its phone and email alone, by code.
  it('reads a place with no hours field for its phone and email, without the AI', async () => {
    const hotel = makeCategory({ id: 'hotel', detailFields: [{ key: 'front_desk_email', label: 'Email', type: 'text' }] })
    m.listCategoriesUncached.mockResolvedValue([hotel])
    m.getResourceRowById.mockResolvedValue({ id: 'h1', category: 'hotel', name: 'Hotel One', status: 'approved', phone: '(215) 555-0199', details: { front_desk_email: 'desk@hotel.example' } })
    const body = `<html><body><p>Call 215-555-0100 or write to stay@hotel.example. ${'Rooms near the hospital. '.repeat(15)}</p></body></html>`
    m.fetchPublic.mockResolvedValue({ ...page, body })
    const out = await runListingPageWatch({ ...watch, resourceId: 'h1', pageHash: 'old' }, undefined, { apiKey: 'k', now: NOW })
    expect(m.readMessage).not.toHaveBeenCalled()
    expect(out).toMatchObject({ ok: true, filed: 1, check: { result: 'differs', contact: { same: [], changes: ['phone', 'front_desk_email'] } } })
    expect(m.submitListingUpdate.mock.calls[0][2]).toMatchObject({ phone: '(215) 555-0100', details: { front_desk_email: 'stay@hotel.example' }, source: { section: { section: 'contact' } } })
  })
})
