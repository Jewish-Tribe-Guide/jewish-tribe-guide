import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'

// "+ Add an item": an edit suggestion with one item more, built on the
// server from the stored listing, for an admin to check.
const m = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  verifyTurnstile: vi.fn(),
  row: vi.fn(),
  del: vi.fn(),
  getResourceById: vi.fn(),
  getCategoryById: vi.fn(),
  submitListingUpdate: vi.fn(),
  notify: vi.fn(),
  ui: { contributions: { add: true, edit: true, report: true } },
}))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: m.enforceRateLimit, clientIp: () => '1.2.3.4' }))
vi.mock('next/server', () => ({ after: (fn: () => unknown) => fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      const filters: unknown[][] = []
      const chain = {
        select: () => (table === 'resource' ? chain : m.del(table, filters)),
        delete: () => chain,
        eq: (...a: unknown[]) => (filters.push(['eq', ...a]), chain),
        gte: (...a: unknown[]) => (filters.push(['gte', ...a]), chain),
        maybeSingle: () => m.row(filters),
      }
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

const { POST, DELETE } = await import('./route')
const ID = '0b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21'
const SUB = '9a6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a99'
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) }) as never
const req = (method: string, body?: unknown) =>
  new Request(`http://x/api/resource/${ID}/item/add`, { method, body: body === undefined ? undefined : JSON.stringify(body) })
const grocery = makeCategory({ id: 'grocery', label: 'Grocery', detailFields: [{ key: 'm', label: 'Kosher items here', type: 'tags', showCountInHeader: true }] })
const listing = { id: ID, category: 'grocery', name: 'Trader Joe’s', anchorId: 'all', distance: 0, address: '1324 Arch St', m: ['Challah', 'Some Sliced Cheese'], m_sometimes: ['Steak'] }

beforeEach(() => {
  vi.resetAllMocks()
  m.ui.contributions.edit = true
  m.enforceRateLimit.mockResolvedValue(null)
  m.verifyTurnstile.mockResolvedValue(true)
  m.row.mockResolvedValue({ data: { community_id: 'philly' }, error: null })
  m.getResourceById.mockResolvedValue(listing)
  m.getCategoryById.mockResolvedValue(grocery)
  m.submitListingUpdate.mockResolvedValue({ id: SUB })
  m.notify.mockResolvedValue(undefined)
})

describe('POST /api/resource/:id/item/add', () => {
  it('files the listing with one item more, under the list’s name for it, and tells the admins', async () => {
    const json = await (await POST(req('POST', { item: '  ground   beef ', turnstileToken: 't' }), ctx())).json()
    expect(m.row.mock.calls[0][0]).toEqual(expect.arrayContaining([['eq', 'id', ID], ['eq', 'status', 'approved']]))
    const [community, target, payload, note, by] = m.submitListingUpdate.mock.calls[0]
    expect([community, target, by]).toEqual(['philly', ID, null])
    expect(payload.details.m).toEqual(['Challah', 'Some Sliced Cheese', 'Hamburger Meat'])
    expect(payload.details.m_sometimes).toEqual(['Steak'])
    expect(note).toBe('Tapped “Add an item” on the listing: Hamburger Meat.')
    expect(m.notify).toHaveBeenCalledWith({ id: SUB })
    expect(json).toEqual({ ok: true, item: 'Hamburger Meat', sometimes: false, submissionId: SUB })
  })

  it('“not always in stock” goes in the sometimes list; a name not on the item list is flagged for the admin', async () => {
    await POST(req('POST', { item: 'Rugelach', sometimes: true }), ctx())
    const [, , payload, note] = m.submitListingUpdate.mock.calls[0]
    expect(payload.details.m_sometimes).toEqual(['Steak', 'Rugelach'])
    expect(note).toBe('Tapped “Add an item” on the listing: Rugelach (not always in stock). A name not on the item list yet.')
  })

  it('an item the store already has, under any name, isn’t filed: the answer says which', async () => {
    expect(await (await POST(req('POST', { item: 'sliced cheeses' }), ctx())).json()).toEqual({ ok: true, already: { item: 'Some Sliced Cheese', field: 'm' } })
    expect(await (await POST(req('POST', { item: 'STEAK' }), ctx())).json()).toEqual({ ok: true, already: { item: 'Steak', field: 'm_sometimes' } })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  it('refuses what can’t be an item, a failed bot check and edits turned off, filing nothing', async () => {
    for (const item of ['x', 'call 215 555 0100', 'me@example.com', 'https://spam.example', 'a'.repeat(61), 42]) {
      expect((await POST(req('POST', { item }), ctx())).status).toBe(400)
    }
    m.verifyTurnstile.mockResolvedValue(false)
    expect((await POST(req('POST', { item: 'Rugelach' }), ctx())).status).toBe(403)
    m.verifyTurnstile.mockResolvedValue(true)
    m.ui.contributions.edit = false
    expect((await POST(req('POST', { item: 'Rugelach' }), ctx())).status).toBe(403)
    m.ui.contributions.edit = true
    m.getCategoryById.mockResolvedValue({ ...grocery, capabilities: { edit: false } })
    expect((await POST(req('POST', { item: 'Rugelach' }), ctx())).status).toBe(403)
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  it('404s a listing that isn’t live, or whose category keeps no item list', async () => {
    m.row.mockResolvedValue({ data: null, error: null })
    expect((await POST(req('POST', { item: 'Rugelach' }), ctx())).status).toBe(404)
    m.row.mockResolvedValue({ data: { community_id: 'philly' }, error: null })
    m.getCategoryById.mockResolvedValue(makeCategory({ id: 'grocery', detailFields: [] }))
    expect((await POST(req('POST', { item: 'Rugelach' }), ctx())).status).toBe(404)
  })
})

describe('DELETE /api/resource/:id/item/add (undo)', () => {
  it('withdraws only that pending addition to this listing, from the last hour', async () => {
    m.del.mockResolvedValue({ data: [{ id: SUB }], error: null })
    expect(await (await DELETE(req('DELETE', { submissionId: SUB }), ctx())).json()).toEqual({ ok: true, changed: true })
    const [table, filters] = m.del.mock.calls[0]
    expect(table).toBe('submission')
    expect(filters).toEqual(expect.arrayContaining([['eq', 'id', SUB], ['eq', 'target_id', ID], ['eq', 'status', 'pending'], ['eq', 'operation', 'update']]))
  })

  it('an admin already decided: it stands', async () => {
    m.del.mockResolvedValue({ data: [], error: null })
    expect(await (await DELETE(req('DELETE', { submissionId: SUB }), ctx())).json()).toEqual({ ok: true, changed: false })
  })

  it('refuses an id that isn’t one', async () => {
    expect((await DELETE(req('DELETE', { submissionId: 'x' }), ctx())).status).toBe(400)
    expect(m.del).not.toHaveBeenCalled()
  })
})
