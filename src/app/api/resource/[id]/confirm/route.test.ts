import { beforeEach, describe, expect, it, vi } from 'vitest'

// The route is a thin shell around two Postgres functions (confirm_resource,
// unconfirm_resource in 20240101000057_activity_and_counts.sql) that do the
// locking, the live-listing check and the cooldown. These tests hold the
// shell to its side of the bargain: what it sends, what it refuses before
// sending, and that it only refreshes the cache and writes history when the
// database says something actually changed.
const m = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  revalidateTag: vi.fn(),
  rpc: vi.fn(),
  recordActivity: vi.fn(),
  removeVisitorConfirmation: vi.fn(),
  details: vi.fn(),
}))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: m.enforceRateLimit }))
vi.mock('next/cache', () => ({ revalidateTag: m.revalidateTag }))
// The one plain read: the listing's date just before a Yes, for the undo.
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    rpc: m.rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { details: m.details() }, error: null }) }) }) }),
  }),
}))
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
vi.mock('@/lib/activityStore', () => ({
  recordActivity: m.recordActivity,
  removeVisitorConfirmation: m.removeVisitorConfirmation,
}))

const { POST, DELETE } = await import('./route')
const { signUndo } = await import('@/lib/confirmUndo')
const ID = '0b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21'
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) }) as never
const req = (method: string, body?: unknown) =>
  new Request(`http://x/api/resource/${ID}/confirm`, { method, body: body === undefined ? undefined : JSON.stringify(body) })
const changed = (at: string | null, yes = true) => ({
  data: [{ out_community: 'philly', out_confirmed_at: at, out_changed: yes }],
  error: null,
})

beforeEach(() => {
  vi.resetAllMocks()
  m.enforceRateLimit.mockResolvedValue(null)
  m.recordActivity.mockResolvedValue([42])
  m.removeVisitorConfirmation.mockResolvedValue(undefined)
  m.details.mockReturnValue({ confirmedAt: '2026-05-01T00:00:00.000Z' })
})

const YES = '2026-09-25T15:00:00.000Z'
const BEFORE = '2026-05-01T00:00:00.000Z'
const note = (over: Partial<{ id: string; section: string | null; at: string; prev: string | null }> = {}, now?: number) =>
  signUndo({ id: ID, section: null, at: YES, prev: BEFORE, ...over }, now)

describe('POST /api/resource/:id/confirm', () => {
  it('returns the rate limiter’s response and touches nothing', async () => {
    m.enforceRateLimit.mockResolvedValue(new Response('slow', { status: 429 }))
    expect((await POST(req('POST'), ctx())).status).toBe(429)
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('404s an id that is not a listing id, without asking the database', async () => {
    expect((await POST(req('POST'), ctx('r1'))).status).toBe(404)
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('404s when the database finds no live listing (unknown, pending or archived)', async () => {
    m.rpc.mockResolvedValue({ data: [], error: null })
    expect((await POST(req('POST'), ctx())).status).toBe(404)
    expect(m.revalidateTag).not.toHaveBeenCalled()
    expect(m.recordActivity).not.toHaveBeenCalled()
  })

  it('stamps now with the cooldown, logs it, and refreshes only that community’s listings', async () => {
    m.rpc.mockImplementation(async (_fn: string, args: { p_now: string }) => changed(args.p_now))
    const json = await (await POST(req('POST'), ctx())).json()

    const [fn, args] = m.rpc.mock.calls[0]
    expect(fn).toBe('confirm_resource')
    expect(args).toMatchObject({ p_id: ID, p_cooldown_seconds: 600 })
    expect(json).toMatchObject({ ok: true, changed: true, activityId: 42, confirmedAt: args.p_now })
    expect(m.recordActivity).toHaveBeenCalledWith([
      { community: 'philly', resourceId: ID, kind: 'listing_confirmed', source: 'visitor' },
    ])
    // The undo note carries the date the listing had before, read by the
    // server: what an undo will put back.
    const body = JSON.parse(Buffer.from(json.undo.split('.')[0], 'base64url').toString())
    expect(body).toMatchObject({ id: ID, section: null, at: args.p_now, prev: BEFORE })
    expect(m.revalidateTag).toHaveBeenCalledTimes(1)
    expect(m.revalidateTag).toHaveBeenCalledWith('resources:philly', 'max')
  })

  it('inside the cooldown: reports the existing stamp, and neither logs nor refreshes', async () => {
    m.rpc.mockResolvedValue(changed('2026-09-25T15:00:00.000Z', false))
    const json = await (await POST(req('POST'), ctx())).json()
    expect(json).toMatchObject({ ok: true, changed: false, activityId: null, undo: null, confirmedAt: '2026-09-25T15:00:00.000Z' })
    expect(m.recordActivity).not.toHaveBeenCalled()
    expect(m.revalidateTag).not.toHaveBeenCalled()
  })

  it('still confirms when the history can’t be written', async () => {
    m.rpc.mockImplementation(async (_fn: string, args: { p_now: string }) => changed(args.p_now))
    m.recordActivity.mockResolvedValue([])
    const json = await (await POST(req('POST'), ctx())).json()
    expect(json).toMatchObject({ ok: true, changed: true, activityId: null })
    expect(m.revalidateTag).toHaveBeenCalled()
  })

  it('502s, without refreshing the cache, when the database call fails', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await POST(req('POST'), ctx())).status).toBe(502)
    expect(m.revalidateTag).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/resource/:id/confirm', () => {
  it('puts back the date the server noted before the Yes, only if the listing still has the Yes', async () => {
    m.rpc.mockResolvedValue(changed(BEFORE))
    const res = await DELETE(req('DELETE', { undo: note(), activityId: 42 }), ctx())
    expect(await res.json()).toMatchObject({ ok: true, confirmedAt: BEFORE, changed: true })
    expect(m.rpc).toHaveBeenCalledWith('unconfirm_resource', { p_id: ID, p_expected: YES, p_previous: BEFORE })
    expect(m.removeVisitorConfirmation).toHaveBeenCalledWith(42, ID)
    expect(m.revalidateTag).toHaveBeenCalledWith('resources:philly', 'max')
  })

  it('puts back "never checked" when there was no date before', async () => {
    m.rpc.mockResolvedValue(changed(null))
    await DELETE(req('DELETE', { undo: note({ prev: null }) }), ctx())
    expect(m.rpc).toHaveBeenCalledWith('unconfirm_resource', { p_id: ID, p_expected: YES, p_previous: null })
  })

  // The listing's current date is public, so with it anyone could send any
  // earlier date, or none, and make a listing look long unchecked or never
  // checked (the health sweep, Nov 20). Dates from the browser now count
  // for nothing.
  it('refuses an undo made of dates alone, without writing', async () => {
    for (const previousConfirmedAt of ['2001-01-01T00:00:00.000Z', null]) {
      const res = await DELETE(req('DELETE', { previousConfirmedAt, confirmedAt: YES, activityId: 42 }), ctx())
      expect(res.status).toBe(400)
    }
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('ignores dates the browser sends beside a good note', async () => {
    m.rpc.mockResolvedValue(changed(BEFORE))
    await DELETE(req('DELETE', { undo: note(), previousConfirmedAt: '2001-01-01T00:00:00.000Z', confirmedAt: '2030-01-01T00:00:00.000Z' }), ctx())
    expect(m.rpc).toHaveBeenCalledWith('unconfirm_resource', { p_id: ID, p_expected: YES, p_previous: BEFORE })
  })

  it('refuses a note that was altered, made up, for another listing or box, or out of date', async () => {
    const good = note()
    const [body, mac] = good.split('.')
    // A changed signature: its last character swapped for another. Not a
    // fixed "AA" ending, which one real signature in 4,096 already has
    // (CI, Nov 21, PR 421).
    const altered = `${mac.slice(0, -1)}${mac.endsWith('A') ? 'B' : 'A'}`
    const forged = Buffer.from(JSON.stringify({ id: ID, section: null, at: YES, prev: null, exp: Date.now() + 1e6 })).toString('base64url')
    for (const undo of [
      `${forged}.${mac}`,
      `${body}.${altered}`,
      `${body}`,
      'nonsense',
      42,
      undefined,
      note({ id: '11111111-2222-4333-8444-555555555555' }),
      note({ section: 'womenTevillah' }),
      note({}, Date.now() - 25 * 60 * 60 * 1000),
    ]) {
      expect((await DELETE(req('DELETE', { undo }), ctx())).status).toBe(400)
    }
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('an undo refused because someone confirmed since changes nothing else', async () => {
    m.rpc.mockResolvedValue(changed('2026-09-25T15:05:00.000Z', false))
    const json = await (await DELETE(req('DELETE', { undo: note(), activityId: 42 }), ctx())).json()
    expect(json).toMatchObject({ ok: true, changed: false, confirmedAt: '2026-09-25T15:05:00.000Z' })
    expect(m.removeVisitorConfirmation).not.toHaveBeenCalled()
    expect(m.revalidateTag).not.toHaveBeenCalled()
  })

  it('400s a body that isn’t JSON', async () => {
    expect((await DELETE(new Request(`http://x/api/resource/${ID}/confirm`, { method: 'DELETE', body: 'not json' }), ctx())).status).toBe(400)
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('ignores an activity id that isn’t a whole number', async () => {
    m.rpc.mockResolvedValue(changed(null))
    await DELETE(req('DELETE', { activityId: '42; drop table', undo: note() }), ctx())
    expect(m.removeVisitorConfirmation).not.toHaveBeenCalled()
  })

  it('502s when the database call fails', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await DELETE(req('DELETE', { undo: note() }), ctx())).status).toBe(502)
    expect(m.revalidateTag).not.toHaveBeenCalled()
  })
})

// Oct 6: a mikvah's sections are confirmed one at a time (confirm_section,
// unconfirm_section in 20240101000071_section_confirm.sql, which checks the
// section is really one of the listing's).
describe('a section at a time', () => {
  it('POST with a section stamps that section, and logs which one', async () => {
    m.rpc.mockImplementation(async (_fn: string, args: { p_now: string }) => changed(args.p_now))
    const json = await (await POST(req('POST', { section: 'womenTevillah' }), ctx())).json()
    const [fn, args] = m.rpc.mock.calls[0]
    expect(fn).toBe('confirm_section')
    expect(args).toMatchObject({ p_id: ID, p_section: 'womenTevillah', p_cooldown_seconds: 600 })
    expect(json).toMatchObject({ ok: true, changed: true, confirmedAt: args.p_now })
    expect(m.recordActivity).toHaveBeenCalledWith([
      { community: 'philly', resourceId: ID, kind: 'listing_confirmed', source: 'visitor', fieldKey: 'womenTevillah' },
    ])
  })

  it('400s a section that couldn’t be a field key, without asking the database', async () => {
    for (const bad of ['women Tevillah', 'x;drop', '', 42, 'a'.repeat(65)]) {
      expect((await POST(req('POST', { section: bad }), ctx())).status).toBe(400)
    }
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('POST with a section notes that section’s date before, not the listing’s', async () => {
    m.details.mockReturnValue({ confirmedAt: BEFORE, sectionConfirmed: { womenTevillah: '2026-08-08T00:00:00.000Z' } })
    m.rpc.mockImplementation(async (_fn: string, args: { p_now: string }) => changed(args.p_now))
    const json = await (await POST(req('POST', { section: 'womenTevillah' }), ctx())).json()
    const body = JSON.parse(Buffer.from(json.undo.split('.')[0], 'base64url').toString())
    expect(body).toMatchObject({ section: 'womenTevillah', prev: '2026-08-08T00:00:00.000Z' })
  })

  it('DELETE with a section undoes that section’s', async () => {
    m.rpc.mockResolvedValue(changed(null))
    await DELETE(req('DELETE', { section: 'menTevillah', undo: note({ section: 'menTevillah', at: '2026-10-06T15:00:00.000Z', prev: null }) }), ctx())
    expect(m.rpc).toHaveBeenCalledWith('unconfirm_section', { p_id: ID, p_section: 'menTevillah', p_expected: '2026-10-06T15:00:00.000Z', p_previous: null })
  })
})
