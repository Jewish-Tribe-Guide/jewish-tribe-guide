import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'

// "Not anymore" on one item: a warning at once, and the removal filed in the
// moderation queue, built on the server from the stored listing.
const m = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  revalidateTag: vi.fn(),
  rpc: vi.fn(),
  del: vi.fn(),
  recordActivity: vi.fn(),
  removeVisitorActivity: vi.fn(),
  verifyTurnstile: vi.fn(),
  getResourceById: vi.fn(),
  getCategoryById: vi.fn(),
  submitListingUpdate: vi.fn(),
  notify: vi.fn(),
  ui: { contributions: { add: true, edit: true, report: true } },
}))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: m.enforceRateLimit, clientIp: () => '1.2.3.4' }))
vi.mock('next/cache', () => ({ revalidateTag: m.revalidateTag }))
vi.mock('next/server', () => ({ after: (fn: () => unknown) => fn() }))
// The withdrawal's query, recorded as one call with its filters.
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    rpc: m.rpc,
    from: (table: string) => {
      const filters: unknown[][] = []
      const chain = {
        delete: () => chain,
        eq: (...a: unknown[]) => (filters.push(['eq', ...a]), chain),
        gte: (...a: unknown[]) => (filters.push(['gte', ...a]), chain),
        select: () => m.del(table, filters),
      }
      return chain
    },
  }),
}))
vi.mock('@/lib/activityStore', () => ({ recordActivity: m.recordActivity, removeVisitorActivity: m.removeVisitorActivity }))
vi.mock('@/lib/turnstile', () => ({ verifyTurnstile: m.verifyTurnstile }))
vi.mock('@/lib/uiConfig', () => ({ ui: m.ui }))
vi.mock('@/lib/resourceStore', () => ({ getResourceById: m.getResourceById }))
vi.mock('@/lib/categoryStore', () => ({ getCategoryById: m.getCategoryById }))
vi.mock('@/lib/submissionStore', () => ({ submitListingUpdate: m.submitListingUpdate }))
vi.mock('@/lib/email', () => ({ sendSubmissionNotification: m.notify }))

const { POST, DELETE } = await import('./route')
const ID = '0b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21'
const SUB = '9a6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a99'
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) }) as never
const req = (method: string, body?: unknown) =>
  new Request(`http://x/api/resource/${ID}/item/gone`, { method, body: body === undefined ? undefined : JSON.stringify(body) })
const grocery = makeCategory({ id: 'grocery', label: 'Grocery', detailFields: [{ key: 'm', label: 'Kosher items here', type: 'tags' }] })
const listing = { id: ID, category: 'grocery', name: 'Trader Joe’s', anchorId: 'all', distance: 0, address: '1324 Arch St', m: ['Challah', 'Chicken'], m_sometimes: ['Steak'] }
const marked = (changed = true) => ({
  data: [{ out_community: 'philly', out_label: 'Chicken', out_at: '2026-10-01T14:00:00.000Z', out_previous: null, out_cleared_gone: null, out_changed: changed }],
  error: null,
})

beforeEach(() => {
  vi.resetAllMocks()
  m.ui.contributions.edit = true
  m.enforceRateLimit.mockResolvedValue(null)
  m.verifyTurnstile.mockResolvedValue(true)
  m.recordActivity.mockResolvedValue([8])
  m.getResourceById.mockResolvedValue(listing)
  m.getCategoryById.mockResolvedValue(grocery)
  m.submitListingUpdate.mockResolvedValue({ id: SUB })
  m.notify.mockResolvedValue(undefined)
})

describe('POST /api/resource/:id/item/gone (Not anymore)', () => {
  it('puts up the warning, then files the listing minus that one item, built from the stored listing', async () => {
    m.rpc.mockResolvedValue(marked())
    const json = await (await POST(req('POST', { field: 'm', item: 'chicken', turnstileToken: 't' }), ctx())).json()
    expect(m.rpc.mock.calls[0][0]).toBe('mark_item')
    expect(m.rpc.mock.calls[0][1]).toMatchObject({ p_id: ID, p_field: 'm', p_item: 'chicken', p_kind: 'gone' })
    const [community, target, payload, note, by] = m.submitListingUpdate.mock.calls[0]
    expect([community, target, by]).toEqual(['philly', ID, null])
    expect(payload.details.m).toEqual(['Challah'])
    expect(payload.details.m_sometimes).toEqual(['Steak'])
    expect(note).toContain('Chicken')
    expect(m.notify).toHaveBeenCalledWith({ id: SUB })
    expect(m.recordActivity).toHaveBeenCalledWith([
      { community: 'philly', resourceId: ID, kind: 'item_reported_gone', source: 'visitor', fieldKey: 'm', item: 'Chicken' },
    ])
    expect(json).toMatchObject({ ok: true, item: 'Chicken', goneAt: '2026-10-01T14:00:00.000Z', changed: true, submissionId: SUB, activityId: 8 })
    expect(m.revalidateTag).toHaveBeenCalledWith('resources:philly', 'max')
  })

  it('already reported and waiting on an admin: files nothing more', async () => {
    m.rpc.mockResolvedValue(marked(false))
    const json = await (await POST(req('POST', { field: 'm', item: 'Chicken' }), ctx())).json()
    expect(json).toMatchObject({ ok: true, changed: false })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
    expect(m.recordActivity).not.toHaveBeenCalled()
  })

  it('takes the warning back down when the removal can’t be filed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    m.rpc.mockResolvedValueOnce(marked()).mockResolvedValueOnce({ data: [], error: null })
    m.submitListingUpdate.mockRejectedValue(new Error('db down'))
    expect((await POST(req('POST', { field: 'm', item: 'Chicken' }), ctx())).status).toBe(502)
    expect(m.rpc.mock.calls[1]).toEqual([
      'unmark_item',
      { p_id: ID, p_field: 'm', p_label: 'Chicken', p_kind: 'gone', p_expected: '2026-10-01T14:00:00.000Z', p_previous: null, p_restore_gone: null },
    ])
    expect(m.recordActivity).not.toHaveBeenCalled()
  })

  it('refuses a failed bot check, and edits turned off, before touching the listing', async () => {
    m.verifyTurnstile.mockResolvedValue(false)
    expect((await POST(req('POST', { field: 'm', item: 'Chicken' }), ctx())).status).toBe(403)
    m.verifyTurnstile.mockResolvedValue(true)
    m.ui.contributions.edit = false
    expect((await POST(req('POST', { field: 'm', item: 'Chicken' }), ctx())).status).toBe(403)
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('a category with edits off: the warning comes back down', async () => {
    m.rpc.mockResolvedValue(marked())
    m.getCategoryById.mockResolvedValue({ ...grocery, capabilities: { edit: false } })
    expect((await POST(req('POST', { field: 'm', item: 'Chicken' }), ctx())).status).toBe(403)
    expect(m.rpc.mock.calls[1][0]).toBe('unmark_item')
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  it('a bot filling the hidden field is told yes and nothing happens', async () => {
    expect(await (await POST(req('POST', { field: 'm', item: 'Chicken', company: 'Acme' }), ctx())).json()).toEqual({ ok: true, changed: false })
    expect(m.rpc).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/resource/:id/item/gone (undo)', () => {
  const undo = { field: 'm', item: 'Chicken', goneAt: '2026-10-01T14:00:00.000Z', submissionId: SUB, activityId: 8 }

  it('withdraws only that pending removal, from the last hour, then takes the warning down', async () => {
    m.del.mockResolvedValue({ data: [{ id: SUB }], error: null })
    m.rpc.mockResolvedValue({ data: [{ out_community: 'philly', out_changed: true }], error: null })
    expect(await (await DELETE(req('DELETE', undo), ctx())).json()).toEqual({ ok: true, changed: true })
    const [table, filters] = m.del.mock.calls[0]
    expect(table).toBe('submission')
    expect(filters).toEqual(
      expect.arrayContaining([
        ['eq', 'id', SUB],
        ['eq', 'target_id', ID],
        ['eq', 'status', 'pending'],
        ['eq', 'operation', 'update'],
      ]),
    )
    expect(filters.some((f: unknown[]) => f[0] === 'gte' && f[1] === 'created_at')).toBe(true)
    expect(m.rpc).toHaveBeenCalledWith('unmark_item', expect.objectContaining({ p_kind: 'gone', p_label: 'Chicken', p_expected: '2026-10-01T14:00:00.000Z' }))
    expect(m.removeVisitorActivity).toHaveBeenCalledWith(8, ID, 'item_reported_gone')
  })

  it('an admin already decided: their decision stands', async () => {
    m.del.mockResolvedValue({ data: [], error: null })
    expect(await (await DELETE(req('DELETE', undo), ctx())).json()).toEqual({ ok: true, changed: false })
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('refuses a report id that isn’t one', async () => {
    expect((await DELETE(req('DELETE', { ...undo, submissionId: '*' }), ctx())).status).toBe(400)
    expect(m.del).not.toHaveBeenCalled()
  })
})
