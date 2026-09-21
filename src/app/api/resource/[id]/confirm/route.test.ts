import { beforeEach, describe, expect, it, vi } from 'vitest'

// A minimal stand-in for the two Supabase call chains this route makes:
//   from('resource').select('details').eq('id', id).maybeSingle()
//   from('resource').update({ details }).eq('id', id)
const m = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  revalidatePublicContent: vi.fn(),
  maybeSingle: vi.fn(),
  updateEq: vi.fn(),
  update: vi.fn(),
  selectEq: vi.fn(),
}))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: m.enforceRateLimit }))
vi.mock('@/lib/revalidateContent', () => ({ revalidatePublicContent: m.revalidatePublicContent }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: m.selectEq.mockReturnValue({ maybeSingle: m.maybeSingle }) }),
      update: m.update.mockReturnValue({ eq: m.updateEq }),
    }),
  }),
}))

const { POST, DELETE } = await import('./route')
const ctx = { params: Promise.resolve({ id: 'r1' }) } as never
const req = (method: string, body?: unknown) =>
  new Request('http://x/api/resource/r1/confirm', { method, body: body === undefined ? undefined : JSON.stringify(body) })

beforeEach(() => {
  vi.resetAllMocks()
  m.enforceRateLimit.mockResolvedValue(null)
  m.revalidatePublicContent.mockResolvedValue(undefined)
  m.maybeSingle.mockResolvedValue({ data: { details: { phone: '555', confirmedAt: '2020-01-01T00:00:00.000Z' } }, error: null })
  m.updateEq.mockResolvedValue({ error: null })
  m.selectEq.mockReturnValue({ maybeSingle: m.maybeSingle })
  m.update.mockReturnValue({ eq: m.updateEq })
})

describe('POST /api/resource/:id/confirm', () => {
  it('returns the rate limiter’s response and touches nothing', async () => {
    m.enforceRateLimit.mockResolvedValue(new Response('slow', { status: 429 }))
    expect((await POST(req('POST'), ctx)).status).toBe(429)
    expect(m.update).not.toHaveBeenCalled()
  })

  it('404s an unknown listing without writing', async () => {
    m.maybeSingle.mockResolvedValue({ data: null, error: null })
    expect((await POST(req('POST'), ctx)).status).toBe(404)
    expect(m.update).not.toHaveBeenCalled()
  })

  it('404s when the lookup itself errors', async () => {
    m.maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect((await POST(req('POST'), ctx)).status).toBe(404)
  })

  it('stamps confirmedAt, keeps the other details, and refreshes the cache', async () => {
    const res = await POST(req('POST'), ctx)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(Number.isNaN(Date.parse(json.confirmedAt))).toBe(false)
    const written = m.update.mock.calls[0][0].details
    expect(written.phone).toBe('555')
    expect(written.confirmedAt).toBe(json.confirmedAt)
    expect(m.updateEq).toHaveBeenCalledWith('id', 'r1')
    expect(m.revalidatePublicContent).toHaveBeenCalled()
  })

  it('502s, without refreshing the cache, when the write fails', async () => {
    m.updateEq.mockResolvedValue({ error: { message: 'boom' } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await POST(req('POST'), ctx)).status).toBe(502)
    expect(m.revalidatePublicContent).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/resource/:id/confirm', () => {
  it('restores the previous confirmation when one is given', async () => {
    const res = await DELETE(req('DELETE', { previousConfirmedAt: '2019-05-05T00:00:00.000Z' }), ctx)
    expect(await res.json()).toEqual({ ok: true, confirmedAt: '2019-05-05T00:00:00.000Z' })
    expect(m.update.mock.calls[0][0].details.confirmedAt).toBe('2019-05-05T00:00:00.000Z')
    expect(m.revalidatePublicContent).toHaveBeenCalled()
  })

  it('removes confirmedAt entirely when there was none before, keeping the rest', async () => {
    const res = await DELETE(req('DELETE', {}), ctx)
    expect(await res.json()).toEqual({ ok: true, confirmedAt: null })
    const written = m.update.mock.calls[0][0].details
    expect('confirmedAt' in written).toBe(false)
    expect(written.phone).toBe('555')
  })

  it.each([
    ['not a date', 'lol'],
    ['markup', '<img src=x onerror=alert(1)>'],
    ['not a string', 12345],
    ['an empty string that is not a real date', 'nope-nope'],
  ])('400s a previousConfirmedAt that is %s, without writing', async (_n, value) => {
    const res = await DELETE(req('DELETE', { previousConfirmedAt: value }), ctx)
    expect(res.status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })

  it('treats a missing or unparseable body as "no previous confirmation"', async () => {
    const res = await DELETE(new Request('http://x', { method: 'DELETE', body: '{oops' }), ctx)
    expect((await res.json()).confirmedAt).toBeNull()
  })

  it('404s an unknown listing without writing', async () => {
    m.maybeSingle.mockResolvedValue({ data: null, error: null })
    expect((await DELETE(req('DELETE', {}), ctx)).status).toBe(404)
    expect(m.update).not.toHaveBeenCalled()
  })

  it('502s when the write fails', async () => {
    m.updateEq.mockResolvedValue({ error: { message: 'boom' } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await DELETE(req('DELETE', {}), ctx)).status).toBe(502)
    expect(m.revalidatePublicContent).not.toHaveBeenCalled()
  })

  it('returns the rate limiter’s response', async () => {
    m.enforceRateLimit.mockResolvedValue(new Response('slow', { status: 429 }))
    expect((await DELETE(req('DELETE', {}), ctx)).status).toBe(429)
  })
})
