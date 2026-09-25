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
}))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: m.enforceRateLimit }))
vi.mock('next/cache', () => ({ revalidateTag: m.revalidateTag }))
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => ({ rpc: m.rpc }) }))
vi.mock('@/lib/activityStore', () => ({
  recordActivity: m.recordActivity,
  removeVisitorConfirmation: m.removeVisitorConfirmation,
}))

const { POST, DELETE } = await import('./route')
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
})

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
    expect(m.revalidateTag).toHaveBeenCalledTimes(1)
    expect(m.revalidateTag).toHaveBeenCalledWith('resources:philly', 'max')
  })

  it('inside the cooldown: reports the existing stamp, and neither logs nor refreshes', async () => {
    m.rpc.mockResolvedValue(changed('2026-09-25T15:00:00.000Z', false))
    const json = await (await POST(req('POST'), ctx())).json()
    expect(json).toMatchObject({ ok: true, changed: false, activityId: null, confirmedAt: '2026-09-25T15:00:00.000Z' })
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
  it('sends back the stamp this browser was given, so it can’t undo someone else’s', async () => {
    m.rpc.mockResolvedValue(changed('2019-05-05T00:00:00.000Z'))
    const res = await DELETE(
      req('DELETE', { previousConfirmedAt: '2019-05-05T00:00:00.000Z', confirmedAt: '2026-09-25T15:00:00.000Z', activityId: 42 }),
      ctx(),
    )
    expect(await res.json()).toMatchObject({ ok: true, confirmedAt: '2019-05-05T00:00:00.000Z', changed: true })
    expect(m.rpc).toHaveBeenCalledWith('unconfirm_resource', {
      p_id: ID,
      p_expected: '2026-09-25T15:00:00.000Z',
      p_previous: '2019-05-05T00:00:00.000Z',
    })
    expect(m.removeVisitorConfirmation).toHaveBeenCalledWith(42, ID)
    expect(m.revalidateTag).toHaveBeenCalledWith('resources:philly', 'max')
  })

  it('an undo refused because someone confirmed since changes nothing else', async () => {
    m.rpc.mockResolvedValue(changed('2026-09-25T15:05:00.000Z', false))
    const json = await (await DELETE(req('DELETE', { confirmedAt: '2026-09-25T15:00:00.000Z', activityId: 42 }), ctx())).json()
    expect(json).toMatchObject({ ok: true, changed: false, confirmedAt: '2026-09-25T15:05:00.000Z' })
    expect(m.removeVisitorConfirmation).not.toHaveBeenCalled()
    expect(m.revalidateTag).not.toHaveBeenCalled()
  })

  it('treats a missing or unparseable body as "no previous confirmation" (an old page)', async () => {
    m.rpc.mockResolvedValue(changed(null))
    const res = await DELETE(new Request(`http://x/api/resource/${ID}/confirm`, { method: 'DELETE', body: 'not json' }), ctx())
    expect(res.status).toBe(200)
    expect(m.rpc).toHaveBeenCalledWith('unconfirm_resource', { p_id: ID, p_expected: null, p_previous: null })
  })

  it('ignores an activity id that isn’t a whole number', async () => {
    m.rpc.mockResolvedValue(changed(null))
    await DELETE(req('DELETE', { activityId: '42; drop table' }), ctx())
    expect(m.removeVisitorConfirmation).not.toHaveBeenCalled()
  })

  for (const [label, bad] of [
    ['not a date', 'yesterday'],
    ['markup', '<script>alert(1)</script>'],
    ['not a string', 12345],
    ['a date-shaped string that is not a real date', '2026-13-45Tnope'],
  ] as const) {
    it(`400s a previousConfirmedAt that is ${label}, without writing`, async () => {
      expect((await DELETE(req('DELETE', { previousConfirmedAt: bad }), ctx())).status).toBe(400)
      expect(m.rpc).not.toHaveBeenCalled()
    })
    it(`400s a confirmedAt that is ${label}, without writing`, async () => {
      expect((await DELETE(req('DELETE', { confirmedAt: bad }), ctx())).status).toBe(400)
      expect(m.rpc).not.toHaveBeenCalled()
    })
  }

  it('502s when the database call fails', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await DELETE(req('DELETE', {}), ctx())).status).toBe(502)
    expect(m.revalidateTag).not.toHaveBeenCalled()
  })
})
