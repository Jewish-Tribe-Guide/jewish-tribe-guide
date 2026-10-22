import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { NEWSLETTER_IGNORED_CREATOR, NEWSLETTER_WATCH_CREATOR, NEWSLETTER_WATCH_NAME } from './newsletter'
import type { Watch } from './watches'

// A shul's newsletter, received: who it's from, what it changes, and what
// the watch remembers of it. The readers are stood in for; applying the
// times to the shul's own is the real thing (scheduleUpdate.ts).
const m = vi.hoisted(() => ({
  eruvSenders: vi.fn(),
  getWatchByUrl: vi.fn(),
  addWatch: vi.fn(),
  listWatches: vi.fn(),
  updateWatch: vi.fn(),
  listApprovedResources: vi.fn(),
  listCategories: vi.fn(),
  readShulWeek: vi.fn(),
  readMessage: vi.fn(),
  submitListingUpdate: vi.fn(),
  sendWatchDigest: vi.fn(),
  upload: vi.fn(),
}))
vi.mock('@/lib/watchStore', () => ({ getWatchByUrl: m.getWatchByUrl, addWatch: m.addWatch, updateWatch: m.updateWatch, listWatches: m.listWatches }))
vi.mock('@/lib/resourceStore', () => ({ listApprovedResources: m.listApprovedResources }))
vi.mock('@/lib/categoryStore', () => ({ listCategories: m.listCategories }))
vi.mock('@/lib/shulWeekReading', () => ({ readShulWeek: m.readShulWeek }))
vi.mock('@/lib/messageReader', async (orig) => ({ ...(await orig<typeof import('./messageReader')>()), readMessage: m.readMessage }))
vi.mock('@/lib/submissionStore', () => ({ submitListingUpdate: m.submitListingUpdate }))
vi.mock('@/lib/email', () => ({ sendWatchDigest: m.sendWatchDigest }))
vi.mock('@/lib/eruvEmailRun', () => ({ eruvSenders: m.eruvSenders }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ storage: { from: () => ({ upload: m.upload, getPublicUrl: (p: string) => ({ data: { publicUrl: `https://kept/${p}` } }) }) } }),
}))

const { receiveNewsletter, emailHash, newsletterSenders } = await import('./newsletterRun')

const SHUL = '0b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21'
const STORE = '5a1f0c2e-7b3d-4e8a-9c6f-1d2e3f4a5b6c'
const shuls = makeCategory({ id: 'synagogue', label: 'Synagogue', detailFields: [{ key: 'minyanim', label: 'Davening Times', type: 'minyanim' }] })
const groceries = makeCategory({ id: 'grocery', label: 'Groceries', detailFields: [{ key: 'website', label: 'Website', type: 'url' }] })
const regular = [
  { id: 'm1', tefillah: 'shacharis', days: ['sat'], time: '9:15am' },
  { id: 'm2', tefillah: 'mincha', days: ['sat'], time: '12:20pm' },
]
const shul = makeListing({ id: SHUL, category: 'synagogue', name: 'Mekor Habracha', minyanim: regular, minyanim_schedules: [] })
const store = makeListing({ id: STORE, category: 'grocery', name: 'Spruce Market', website: 'https://old.example' })

const watch: Watch = {
  id: 'w1',
  communityId: 'philly',
  kind: 'website',
  url: 'mailto:info@mekorhabracha.org',
  resourceId: SHUL,
  label: 'Mekor Habracha',
  active: true,
  createdAt: '2026-10-01T00:00:00Z',
  createdBy: NEWSLETTER_WATCH_CREATOR,
  lastRunAt: null,
  lastOkAt: null,
  lastError: null,
  failingSince: null,
  lastFiled: null,
  pageHash: null,
  pageChangedAt: null,
  lastCheck: null,
}
const email = {
  messageId: 'gmail-123',
  from: 'Mekor Habracha <Info@MekorHabracha.org>',
  subject: 'This Shabbos at Mekor',
  date: '2026-10-16T14:00:00.000Z',
  text: 'Shabbos Noach. Shacharis 9:00am. Kiddush sponsored by the Cohens.',
  attachment: null,
}
const opts = { apiKey: 'k', communityName: 'Philadelphia', now: '2026-10-16T15:00:00.000Z' }

const changed = {
  kind: 'schedule',
  complete: false,
  season: null,
  title: null,
  startsOn: null,
  from: null,
  to: null,
  otherSeason: 0,
  rows: [{ id: 'a', day: 'sat', tefillah: 'shacharis', time: '9:00am', status: 'changed', was: '9:15am', rowId: 'm1', quote: 'Shacharis 9:00am' }],
}
// What a newsletter with no times at all can come back as, if the reader
// calls it complete: every minyan "gone".
const allGone = {
  ...changed,
  complete: true,
  rows: [
    { id: 'a', day: 'sat', tefillah: 'shacharis', time: '9:15am', status: 'gone', rowId: 'm1' },
    { id: 'b', day: 'sat', tefillah: 'mincha', time: '12:20pm', status: 'gone', rowId: 'm2' },
  ],
}
const nothing = { proposals: [], model: 'x', ms: 0, usage: { input: 0, cachedInput: 0, output: 0 } }

beforeEach(() => {
  vi.resetAllMocks()
  m.getWatchByUrl.mockResolvedValue(watch)
  m.addWatch.mockImplementation(async (_c: string, w: Partial<Watch>) => ({ ...watch, ...w, id: 'new' }))
  m.updateWatch.mockResolvedValue(undefined)
  m.listApprovedResources.mockResolvedValue([shul, store])
  m.listCategories.mockResolvedValue([shuls, groceries])
  m.readShulWeek.mockResolvedValue({ update: changed, model: 'x' })
  m.readMessage.mockResolvedValue(nothing)
  m.submitListingUpdate.mockResolvedValue({ id: 'sub' })
  m.sendWatchDigest.mockResolvedValue(undefined)
  m.upload.mockResolvedValue({ error: null })
})

describe('receiveNewsletter: who it’s from', () => {
  // Only the Watches tab's senders are sent (newsletterSenders), so a
  // stranger's email is a slip, not a new newsletter: it adds no row.
  it('leaves a sender no one added alone: adds no watch and reads nothing', async () => {
    m.getWatchByUrl.mockResolvedValue(null)
    expect(await receiveNewsletter('philly', email, opts)).toEqual({ status: 'unknown' })
    expect(m.getWatchByUrl).toHaveBeenCalledWith('philly', 'mailto:info@mekorhabracha.org')
    expect(m.addWatch).not.toHaveBeenCalled()
    expect(m.readShulWeek).not.toHaveBeenCalled()
    expect(m.readMessage).not.toHaveBeenCalled()
  })

  it('names the senders whose emails the script should send', async () => {
    m.listWatches.mockResolvedValue({ watches: [watch, { ...watch, id: 'w2', url: 'mailto:new@shul.org', resourceId: null, active: false }], available: true })
    m.eruvSenders.mockResolvedValue([])
    expect(await newsletterSenders('philly')).toEqual(['info@mekorhabracha.org'])
    expect(m.listWatches).toHaveBeenCalledWith('philly')
  })

  it('names the eruvim whose status comes by email too, each sender once', async () => {
    m.listWatches.mockResolvedValue({ watches: [watch], available: true })
    m.eruvSenders.mockResolvedValue(['jcor-ne-philadelphia@groups.io', 'info@mekorhabracha.org'])
    expect(await newsletterSenders('philly')).toEqual(['info@mekorhabracha.org', 'jcor-ne-philadelphia@groups.io'])
    expect(m.eruvSenders).toHaveBeenCalledWith('philly')
  })

  it('leaves an email from an unlinked sender to wait, a paused one and an ignored one alone', async () => {
    m.getWatchByUrl.mockResolvedValue({ ...watch, resourceId: null, active: false })
    expect(await receiveNewsletter('philly', email, opts)).toEqual({ status: 'unlinked', watchId: 'w1' })
    m.getWatchByUrl.mockResolvedValue({ ...watch, active: false })
    expect(await receiveNewsletter('philly', email, opts)).toEqual({ status: 'paused' })
    m.getWatchByUrl.mockResolvedValue({ ...watch, resourceId: null, active: false, createdBy: NEWSLETTER_IGNORED_CREATOR })
    expect(await receiveNewsletter('philly', email, opts)).toEqual({ status: 'ignored' })
    expect(m.readShulWeek).not.toHaveBeenCalled()
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  it('reads the same email once, however many times it’s sent', async () => {
    m.getWatchByUrl.mockResolvedValue({ ...watch, pageHash: emailHash('gmail-123') })
    expect(await receiveNewsletter('philly', email, opts)).toEqual({ status: 'already' })
    expect(m.readShulWeek).not.toHaveBeenCalled()
  })

  // A mailing list sends each email from whoever posted it: the list's own
  // address is the one a watch can have.
  it('a list’s email is the list’s, whoever posted it', async () => {
    m.getWatchByUrl.mockImplementation(async (_c: string, url: string) => (url === 'mailto:mekor@groups.io' ? { ...watch, url, pageHash: emailHash('gmail-123') } : null))
    expect(await receiveNewsletter('philly', { ...email, from: 'Rabbi Cohen <rabbi=gmail.com@groups.io>', list: 'mekor@groups.io' }, opts)).toEqual({ status: 'already' })
    expect(m.getWatchByUrl).toHaveBeenCalledWith('philly', 'mailto:rabbi=gmail.com@groups.io')
  })

  it('has nothing to do with an email without a sender’s address', async () => {
    expect(await receiveNewsletter('philly', { ...email, from: 'Mekor Habracha' }, opts)).toEqual({ status: 'not_newsletter' })
    expect(m.getWatchByUrl).not.toHaveBeenCalled()
  })
})

describe('receiveNewsletter: what it changes', () => {
  it('files the shul’s changed times as from the shul, and the watch remembers the email', async () => {
    expect(await receiveNewsletter('philly', email, opts)).toEqual({ status: 'read', filed: 1 })
    expect(m.readShulWeek).toHaveBeenCalledWith(shul, 'minyanim', { text: email.text }, 'k', { sentAt: Date.parse(email.date) })
    const [community, target, payload, note, by] = m.submitListingUpdate.mock.calls[0]
    expect([community, target, by]).toEqual(['philly', SHUL, { name: NEWSLETTER_WATCH_NAME }])
    expect(payload.details.minyanim.map((x: { tefillah: string; time: string }) => `${x.tefillah} ${x.time}`).sort()).toEqual(['mincha 12:20pm', 'shacharis 9:00am'])
    // Approved, the shul's date says "Confirmed by Mekor Habracha".
    expect(payload.source).toMatchObject({ readBy: 'ai', from: 'Mekor Habracha’s newsletter', named: 'Mekor Habracha', original: email.text, note: email.subject })
    expect(note).toContain('From Mekor Habracha’s newsletter: “This Shabbos at Mekor” (Oct 16).')
    expect(note).toContain('9:00am')
    expect(m.sendWatchDigest).toHaveBeenCalledWith('philly', 'Mekor Habracha’s newsletter', [expect.objectContaining({ name: 'Mekor Habracha' })], { path: '/philly/admin/watches/times', name: 'Shul times' })
    expect(m.updateWatch).toHaveBeenCalledWith(
      'philly',
      'w1',
      expect.objectContaining({ lastFiled: 1, lastOkAt: opts.now, failingSince: null, pageHash: emailHash('gmail-123'), pageChangedAt: email.date }),
    )
  })

  // The user, Oct 22: Shul times showed a newsletter's update the old way
  // (its source and Compare), not in the box for the times it changes, and
  // a whole update waiting held back what the shul's website read.
  it('files the times as the part they change, as a website’s reading is', async () => {
    await receiveNewsletter('philly', email, opts)
    expect(m.submitListingUpdate.mock.calls[0][2].source.part).toEqual({ part: 'shabbos', field: 'minyanim' })
    expect(m.sendWatchDigest.mock.calls[0][2]).toEqual([{ name: 'Mekor Habracha', what: 'Usual Shabbos times: Changed: shacharis · Shabbos · 9:00am, was 9:15am' }])
  })

  it('files each part a newsletter changes on its own, each changing only its own times', async () => {
    m.readShulWeek.mockResolvedValue({
      update: { ...changed, rows: [...changed.rows, { id: 'b', day: 'mon', tefillah: 'shacharis', time: '7:00am', status: 'new', quote: 'Shacharis Monday 7am' }] },
      model: 'x',
    })
    expect(await receiveNewsletter('philly', email, opts)).toEqual({ status: 'read', filed: 2 })
    const filed = m.submitListingUpdate.mock.calls.map((c) => c[2])
    const times = (p: { details: { minyanim: { tefillah: string; days: string[]; time: string }[] } }) => p.details.minyanim.map((x) => `${x.days.join('')} ${x.tefillah} ${x.time}`).sort()
    expect(filed.map((p) => p.source.part.part)).toEqual(['weekday', 'shabbos'])
    expect(times(filed[0])).toEqual(['mon shacharis 7:00am', 'sat mincha 12:20pm', 'sat shacharis 9:15am'])
    expect(times(filed[1])).toEqual(['sat mincha 12:20pm', 'sat shacharis 9:00am'])
    expect(m.sendWatchDigest.mock.calls[0][2].map((w: { what: string }) => w.what.split(':')[0])).toEqual(['Usual weekday times', 'Usual Shabbos times'])
  })

  it('files a week’s times as this week’s schedule', async () => {
    m.readShulWeek.mockResolvedValue({
      update: { ...changed, kind: 'week', title: 'Shabbos Noach', from: '2026-10-23', to: '2026-10-24', rows: [{ id: 'a', day: '2026-10-24', tefillah: 'shacharis', time: '9:00am', status: 'new', quote: 'Shacharis 9:00am' }] },
      model: 'x',
    })
    expect(await receiveNewsletter('philly', email, opts)).toEqual({ status: 'read', filed: 1 })
    const payload = m.submitListingUpdate.mock.calls[0][2]
    expect(payload.source.part).toMatchObject({ part: 'week', field: 'minyanim' })
    expect(payload.source.part.schedules).toHaveLength(1)
    expect(payload.details.minyanim).toEqual(regular)
  })

  it('never reads a newsletter with no times as every minyan gone', async () => {
    m.readShulWeek.mockResolvedValue({ update: allGone, model: 'x' })
    expect(await receiveNewsletter('philly', email, opts)).toEqual({ status: 'read', filed: 0 })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
    expect(m.sendWatchDigest).not.toHaveBeenCalled()
  })

  it('reads the times off its PDF when the words have none, and keeps the PDF for the admin', async () => {
    const pdf = { mime: 'application/pdf', b64: Buffer.from('%PDF').toString('base64') }
    m.readShulWeek.mockImplementation(async (_l: unknown, _k: string, source: Record<string, string>) => ({ update: source.pdf ? changed : allGone, model: 'x' }))
    expect(await receiveNewsletter('philly', { ...email, attachment: pdf }, opts)).toEqual({ status: 'read', filed: 1 })
    expect(m.readShulWeek).toHaveBeenCalledWith(shul, 'minyanim', { pdf: pdf.b64 }, 'k', { sentAt: Date.parse(email.date) })
    expect(m.upload).toHaveBeenCalledWith(expect.stringMatching(/^newsletter-source\/.+\.pdf$/), expect.any(Buffer), { contentType: 'application/pdf', upsert: false })
    expect(m.submitListingUpdate.mock.calls[0][2].source.photoUrl).toMatch(/^https:\/\/kept\/newsletter-source\//)
  })

  it('files what it says about another place, not as from the shul, and skips what it couldn’t place', async () => {
    m.readShulWeek.mockResolvedValue({ update: allGone, model: 'x' })
    m.readMessage.mockResolvedValue({
      ...nothing,
      proposals: [
        { kind: 'fields', listingId: STORE, asWritten: 'Spruce Market', ask: null, changes: [{ key: 'website', value: 'https://new.example' }], note: null, quote: 'q', checked: true },
        // A best guess with a question attached: no one is here to answer it.
        {
          kind: 'fields',
          listingId: STORE,
          asWritten: 'the market',
          ask: { question: 'Which?', choices: [{ label: 'Spruce', listingId: STORE }] },
          changes: [{ key: 'website', value: 'https://other.example' }],
          note: null,
          quote: 'q',
          checked: true,
        },
        { kind: 'new_place', category: 'grocery', place: { name: 'New Place' }, items: [], note: null, maybe: [], quote: 'q', checked: true },
      ],
    })
    expect(await receiveNewsletter('philly', email, opts)).toEqual({ status: 'read', filed: 1 })
    expect(m.readMessage).toHaveBeenCalledWith({ text: email.text, images: [] }, expect.anything(), { apiKey: 'k', communityName: 'Philadelphia', about: SHUL })
    const [, target, payload] = m.submitListingUpdate.mock.calls[0]
    expect(target).toBe(STORE)
    expect(payload.details.website).toBe('https://new.example')
    expect(payload.source.named).toBeUndefined()
  })

  it('files nothing when a reader fails, and the watch says so: the email is sent again next time', async () => {
    m.readMessage.mockRejectedValue(new Error('Message reader: 500'))
    await expect(receiveNewsletter('philly', email, opts)).rejects.toThrow('Message reader: 500')
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
    const patch = m.updateWatch.mock.calls[0][2]
    expect(patch).toMatchObject({ failingSince: opts.now, lastError: expect.stringContaining('This Shabbos at Mekor') })
    expect(patch.pageHash).toBeUndefined()
  })
})
