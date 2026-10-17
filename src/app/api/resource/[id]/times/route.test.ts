import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'

// "Update their times": the result the person saw, applied on the server to
// the shul's times as stored, and filed as an edit suggestion.
const m = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  verifyTurnstile: vi.fn(),
  row: vi.fn(),
  getResourceById: vi.fn(),
  getCategoryById: vi.fn(),
  submitListingUpdate: vi.fn(),
  notify: vi.fn(),
  festivals: vi.fn(),
  ui: { contributions: { add: true, edit: true, report: true } },
}))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: m.enforceRateLimit, clientIp: () => '1.2.3.4' }))
vi.mock('next/server', () => ({ after: (fn: () => unknown) => fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => {
      const filters: unknown[][] = []
      const chain = { select: () => chain, eq: (...a: unknown[]) => (filters.push(['eq', ...a]), chain), maybeSingle: () => m.row(filters) }
      return chain
    },
  }),
}))
vi.mock('@/lib/turnstile', () => ({ verifyTurnstile: m.verifyTurnstile }))
vi.mock('@/lib/uiConfig', () => ({ ui: m.ui }))
vi.mock('@/lib/resourceStore', () => ({ getResourceById: m.getResourceById }))
vi.mock('@/lib/categoryStore', () => ({ getCategoryById: m.getCategoryById }))
vi.mock('@/lib/submissionStore', () => ({ submitListingUpdate: m.submitListingUpdate }))
vi.mock('@/lib/email', () => ({ sendSubmissionNotification: m.notify }))

const { POST } = await import('./route')
const ID = '0b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21'
const ctx = () => ({ params: Promise.resolve({ id: ID }) }) as never
const req = (body: unknown) => new Request(`http://x/api/resource/${ID}/times`, { method: 'POST', body: JSON.stringify(body) })
const shuls = makeCategory({ id: 'synagogue', label: 'Synagogue', detailFields: [{ key: 'minyanim', label: 'Davening Times', type: 'minyanim' }] })
// Mekor Habracha's, as the guide has them.
const regular = [
  { id: 'm1', tefillah: 'shacharis', days: ['sat'], time: '9:15am' },
  { id: 'm3', tefillah: 'mincha', days: ['sat'], time: '12:20pm', notes: 'Winter only- following Kiddush' },
  { id: 'm4', tefillah: 'mincha_maariv', days: ['fri'], time: '7:00pm', notes: 'Summer only' },
]
const listing = { id: ID, category: 'synagogue', name: 'Mekor Habracha', anchorId: 'all', distance: 0, address: '1500 Walnut St', minyanim: regular, minyanim_schedules: [] }
const winter = {
  kind: 'schedule',
  complete: true,
  season: 'winter',
  title: 'Winter Schedule',
  from: null,
  to: null,
  rows: [
    { id: 'a', day: 'sat', tefillah: 'shacharis', time: '9:00am', status: 'changed', was: '9:15am', rowId: 'm1' },
    { id: 'b', day: 'sat', tefillah: 'mincha', time: '12:20pm', status: 'gone', rowId: 'm3', notes: 'Winter only- following Kiddush' },
    { id: 'c', day: 'sun', tefillah: 'shacharis', time: '8:30am', status: 'new' },
  ],
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-01T12:00:00Z'))
  m.ui.contributions.edit = true
  m.enforceRateLimit.mockResolvedValue(null)
  m.verifyTurnstile.mockResolvedValue(true)
  m.row.mockResolvedValue({ data: { community_id: 'philly' }, error: null })
  m.getResourceById.mockResolvedValue(listing)
  m.getCategoryById.mockResolvedValue(shuls)
  m.submitListingUpdate.mockResolvedValue({ id: 'sub' })
  m.notify.mockResolvedValue(undefined)
})

describe('POST /api/resource/:id/times', () => {
  it('applies the result to the times as stored, and tells the admin what changed and what it came from', async () => {
    const res = await POST(req({ update: winter, source: 'Mekor Habracha – Winter Schedule', turnstileToken: 't' }), ctx())
    expect(await res.json()).toEqual({ ok: true })
    const [community, target, payload, note] = m.submitListingUpdate.mock.calls[0]
    expect([community, target]).toEqual(['philly', ID])
    const show = payload.details.minyanim.map((x: { days: string[]; time: string; season?: string }) => `${x.days.join(',')} ${x.time} ${x.season ?? 'all year'}`).sort()
    expect(show).toEqual(['fri 7:00pm summer', 'sat 9:00am winter', 'sat 9:15am summer', 'sun 8:30am winter'])
    expect(note).toContain('Their winter schedule, sent from the shul’s card.')
    expect(note).toContain('Changed: shacharis · Shabbos · 9:00am, was 9:15am (winter)')
    expect(note).toContain('Read from what they pasted:\nMekor Habracha – Winter Schedule')
    expect(m.notify).toHaveBeenCalled()
  })

  it('uses the shul’s own times, not what the browser says they were', async () => {
    // A row the shul doesn't have can't take anything off.
    await POST(req({ update: { ...winter, rows: [{ ...winter.rows[1], rowId: 'nope' }, winter.rows[2]] }, turnstileToken: 't' }), ctx())
    const times = m.submitListingUpdate.mock.calls[0][2].details.minyanim.map((x: { time: string }) => x.time)
    expect(times).toContain('12:20pm')
  })

  it('files nothing when nothing changes, and nothing malformed', async () => {
    const same = { ...winter, rows: [{ ...winter.rows[0], status: 'same', time: '9:15am' }] }
    for (const update of [same, { ...winter, kind: 'other' }, { ...winter, rows: [{ ...winter.rows[0], tefillah: 'musaf' }] }, { ...winter, kind: 'week', from: '2026-10-09', to: '2026-10-30' }]) {
      expect((await POST(req({ update, turnstileToken: 't' }), ctx())).status, JSON.stringify(update).slice(0, 80)).toBe(400)
    }
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  it('needs the bot check, and edits switched on', async () => {
    m.verifyTurnstile.mockResolvedValue(false)
    expect((await POST(req({ update: winter, turnstileToken: 't' }), ctx())).status).toBe(403)
    m.verifyTurnstile.mockResolvedValue(true)
    m.ui.contributions.edit = false
    expect((await POST(req({ update: winter, turnstileToken: 't' }), ctx())).status).toBe(403)
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })
})
