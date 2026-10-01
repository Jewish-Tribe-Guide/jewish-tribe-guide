import { beforeEach, describe, expect, it, vi } from 'vitest'

// "Still here" on one item. A thin shell around mark_item / unmark_item
// (migration 064), which do the locking, the live-listing and item-list
// checks and the cooldown; these hold the shell to its side: what it
// refuses before asking, what it sends, and that it only logs and refreshes
// when something changed.
const m = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  revalidateTag: vi.fn(),
  rpc: vi.fn(),
  recordActivity: vi.fn(),
  removeVisitorActivity: vi.fn(),
}))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: m.enforceRateLimit }))
vi.mock('next/cache', () => ({ revalidateTag: m.revalidateTag }))
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => ({ rpc: m.rpc }) }))
vi.mock('@/lib/activityStore', () => ({ recordActivity: m.recordActivity, removeVisitorActivity: m.removeVisitorActivity }))

const { POST, DELETE } = await import('./route')
const ID = '0b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21'
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) }) as never
const req = (method: string, body?: unknown) =>
  new Request(`http://x/api/resource/${ID}/item`, { method, body: body === undefined ? undefined : JSON.stringify(body) })
const marked = (o: Partial<Record<string, unknown>> = {}) => ({
  data: [{ out_community: 'philly', out_label: 'Challah', out_at: '2026-10-01T14:00:00.000Z', out_previous: null, out_cleared_gone: null, out_changed: true, ...o }],
  error: null,
})

beforeEach(() => {
  vi.resetAllMocks()
  m.enforceRateLimit.mockResolvedValue(null)
  m.recordActivity.mockResolvedValue([7])
})

describe('POST /api/resource/:id/item (Still here)', () => {
  it('refuses a bad id, a missing item or a made-up key without asking the database', async () => {
    expect((await POST(req('POST', { field: 'm', item: 'Challah' }), ctx('x'))).status).toBe(404)
    expect((await POST(req('POST', { field: 'm' }), ctx())).status).toBe(400)
    expect((await POST(req('POST', { field: 'm;drop', item: 'Challah' }), ctx())).status).toBe(400)
    expect((await POST(req('POST', 'nope'), ctx())).status).toBe(400)
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('stamps the item now, logs it against that item, and refreshes that community', async () => {
    m.rpc.mockResolvedValue(marked({ out_cleared_gone: '2026-09-30T10:00:00.000Z' }))
    const json = await (await POST(req('POST', { field: 'm', item: ' challah ' }), ctx())).json()
    const [fn, args] = m.rpc.mock.calls[0]
    expect(fn).toBe('mark_item')
    expect(args).toMatchObject({ p_id: ID, p_field: 'm', p_item: 'challah', p_kind: 'seen', p_cooldown_seconds: 600 })
    expect(json).toMatchObject({ ok: true, item: 'Challah', seenAt: '2026-10-01T14:00:00.000Z', clearedGone: '2026-09-30T10:00:00.000Z', changed: true, activityId: 7 })
    expect(m.recordActivity).toHaveBeenCalledWith([
      { community: 'philly', resourceId: ID, kind: 'item_confirmed', source: 'visitor', fieldKey: 'm', item: 'Challah' },
    ])
    expect(m.revalidateTag).toHaveBeenCalledWith('resources:philly', 'max')
  })

  it('inside the cooldown: neither logs nor refreshes', async () => {
    m.rpc.mockResolvedValue(marked({ out_changed: false }))
    const json = await (await POST(req('POST', { field: 'm', item: 'Challah' }), ctx())).json()
    expect(json).toMatchObject({ ok: true, changed: false, activityId: null })
    expect(m.recordActivity).not.toHaveBeenCalled()
    expect(m.revalidateTag).not.toHaveBeenCalled()
  })

  it('404s an item the listing doesn’t list (the database finds nothing)', async () => {
    m.rpc.mockResolvedValue({ data: [], error: null })
    expect((await POST(req('POST', { field: 'm', item: 'Lobster' }), ctx())).status).toBe(404)
    expect(m.recordActivity).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/resource/:id/item (undo)', () => {
  const undo = { field: 'm', item: 'Challah', seenAt: '2026-10-01T14:00:00.000Z', previous: '2026-09-01T10:00:00.000Z', clearedGone: '2026-09-30T10:00:00.000Z', activityId: 7 }

  it('sends back the date it was given, the one before, and a cleared warning', async () => {
    m.rpc.mockResolvedValue({ data: [{ out_community: 'philly', out_changed: true }], error: null })
    expect(await (await DELETE(req('DELETE', undo), ctx())).json()).toEqual({ ok: true, changed: true })
    expect(m.rpc).toHaveBeenCalledWith('unmark_item', {
      p_id: ID,
      p_field: 'm',
      p_label: 'Challah',
      p_kind: 'seen',
      p_expected: '2026-10-01T14:00:00.000Z',
      p_previous: '2026-09-01T10:00:00.000Z',
      p_restore_gone: '2026-09-30T10:00:00.000Z',
    })
    expect(m.removeVisitorActivity).toHaveBeenCalledWith(7, ID, 'item_confirmed')
    expect(m.revalidateTag).toHaveBeenCalledWith('resources:philly', 'max')
  })

  it('refused because someone has seen it since: nothing else changes', async () => {
    m.rpc.mockResolvedValue({ data: [{ out_community: 'philly', out_changed: false }], error: null })
    await DELETE(req('DELETE', undo), ctx())
    expect(m.removeVisitorActivity).not.toHaveBeenCalled()
    expect(m.revalidateTag).not.toHaveBeenCalled()
  })

  for (const [label, patch] of [
    ['no date', { seenAt: undefined }],
    ['markup for a date', { previous: '<b>x</b>' }],
    ['a "previous" later than the date undone', { previous: '2030-01-01T00:00:00.000Z' }],
    ['a "cleared" later than the date undone', { clearedGone: '2030-01-01T00:00:00.000Z' }],
  ] as const) {
    it(`refuses ${label}, which would be written onto the listing`, async () => {
      expect((await DELETE(req('DELETE', { ...undo, ...patch }), ctx())).status).toBe(400)
      expect(m.rpc).not.toHaveBeenCalled()
    })
  }
})
