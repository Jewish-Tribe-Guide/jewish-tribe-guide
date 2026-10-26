import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  getAdminUserForCommunity: vi.fn(),
  enforceRateLimit: vi.fn(),
  revalidatePublicContent: vi.fn(),
  loadGoogleJob: vi.fn(),
  checkAgainstGoogle: vi.fn(),
  keepTheListing: vi.fn(),
  applyGoogles: vi.fn(),
  wrongPlace: vi.fn(),
}))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: m.enforceRateLimit }))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({ communitySlugFromRequest: () => 'philly', resolveCommunity: async () => ({ slug: 'philly' }) }))
vi.mock('@/lib/revalidateContent', () => ({ revalidatePublicContent: m.revalidatePublicContent }))
vi.mock('@/lib/googleJobRun', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadGoogleJob: m.loadGoogleJob,
  checkAgainstGoogle: m.checkAgainstGoogle,
  keepTheListing: m.keepTheListing,
  applyGoogles: m.applyGoogles,
  wrongPlace: m.wrongPlace,
}))

const { GET, POST } = await import('./route')
const ID = '0b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21'
const post = (body: unknown) => POST(new Request('http://x/api/admin/watches/google', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => {
  vi.clearAllMocks()
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'me@x.co' })
  m.enforceRateLimit.mockResolvedValue(null)
  m.loadGoogleJob.mockResolvedValue([{ section: 'to_check' }, { section: 'checked' }])
  for (const f of [m.checkAgainstGoogle, m.keepTheListing, m.applyGoogles, m.wrongPlace]) f.mockResolvedValue({ id: ID })
})

describe('/api/admin/watches/google', () => {
  it('admins only', async () => {
    m.getAdminUserForCommunity.mockResolvedValue(null)
    expect((await GET(new Request('http://x/api/admin/watches/google'))).status).toBe(401)
    expect((await post({ action: 'keep', id: ID })).status).toBe(401)
    expect(m.keepTheListing).not.toHaveBeenCalled()
  })

  it('the Watches row: its counts and how many listings', async () => {
    const res = await GET(new Request('http://x/api/admin/watches/google?counts'))
    expect(await res.json()).toEqual({ ok: true, counts: { checked: 1, toCheck: 1, cantRead: 0, didntLoad: 0 }, total: 2 })
  })

  it('refuses an action it doesn’t know, or a listing id that isn’t one', async () => {
    expect((await post({ action: 'delete', id: ID })).status).toBe(400)
    expect((await post({ action: 'keep', id: 'nope' })).status).toBe(400)
  })

  it('a paid call is rate-limited; a decision isn’t', async () => {
    m.enforceRateLimit.mockResolvedValue(new Response(null, { status: 429 }))
    expect((await post({ action: 'check', id: ID })).status).toBe(429)
    expect(m.checkAgainstGoogle).not.toHaveBeenCalled()
    expect((await post({ action: 'keep', id: ID })).status).toBe(200)
  })

  it('a check changes nothing the site shows; Use Google’s does, and the site is refreshed', async () => {
    await post({ action: 'check', id: ID })
    expect(m.revalidatePublicContent).not.toHaveBeenCalled()
    await post({ action: 'use', id: ID })
    expect(m.applyGoogles).toHaveBeenCalledWith('philly', ID, 'me@x.co')
    expect(m.revalidatePublicContent).toHaveBeenCalledTimes(1)
  })

  it('Wrong place drops the match, and the site is refreshed (its closure and description were the other place’s)', async () => {
    const res = await post({ action: 'wrong_place', id: ID })
    expect(res.status).toBe(200)
    expect(m.wrongPlace).toHaveBeenCalledWith('philly', ID)
    expect(m.revalidatePublicContent).toHaveBeenCalledTimes(1)
  })

  it('says a refusal as it is', async () => {
    const { GoogleJobError } = await import('@/lib/googleJobRun')
    m.checkAgainstGoogle.mockRejectedValue(new GoogleJobError('This listing has no Google match. Find it on Google first.', 400))
    const res = await post({ action: 'check', id: ID })
    expect(res.status).toBe(400)
    expect((await res.json()).errors).toEqual(['This listing has no Google match. Find it on Google first.'])
  })
})
