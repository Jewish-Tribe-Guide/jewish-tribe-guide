import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  getAdminUser: vi.fn(),
  getAdminUserForCommunity: vi.fn(),
  resolveCommunity: vi.fn(),
  revalidatePublicContent: vi.fn(),
}))
vi.mock('@/lib/adminAuth', () => ({ getAdminUser: m.getAdminUser, getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({
  communitySlugFromRequest: (r: Request) => new URL(r.url).searchParams.get('community'),
  resolveCommunity: m.resolveCommunity,
}))
vi.mock('@/lib/revalidateContent', () => ({ revalidatePublicContent: m.revalidatePublicContent }))

const { adminRead, adminWrite, siteAdminRead, siteAdminWrite, unchanged } = await import('./adminRoute')

const req = (q = '?community=ues') => new Request(`http://x/api/admin/thing${q}`, { method: 'POST' })
const json = (status: number) => Response.json({ ok: status < 400 }, { status })

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  m.resolveCommunity.mockImplementation(async (slug: string | null) => ({ slug: slug ?? 'philly' }))
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'a@x.co' })
  m.getAdminUser.mockResolvedValue({ email: 'owner@x.co' })
})

describe('adminRead / adminWrite', () => {
  it('signs in against the community the request names, and hands it over', async () => {
    const handler = vi.fn(async () => json(200))
    await adminRead(handler)(req(), { params: 1 })
    expect(m.getAdminUserForCommunity).toHaveBeenCalledWith(expect.any(Request), 'ues')
    expect(handler).toHaveBeenCalledWith(expect.any(Request), { community: { slug: 'ues' }, admin: { email: 'a@x.co' } }, { params: 1 })
  })

  it('refuses without running the handler or touching the cache', async () => {
    m.getAdminUserForCommunity.mockResolvedValue(null)
    const handler = vi.fn(async () => json(200))
    const res = await adminWrite(handler)(req())
    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
    expect(m.revalidatePublicContent).not.toHaveBeenCalled()
  })

  it('a read never invalidates', async () => {
    await adminRead(async () => json(200))(req())
    expect(m.revalidatePublicContent).not.toHaveBeenCalled()
  })

  it('a write invalidates after a success and after a failure partway, not after a refusal', async () => {
    for (const [status, invalidated] of [[200, true], [502, true], [500, true], [400, false], [404, false], [409, false]] as const) {
      m.revalidatePublicContent.mockClear()
      const res = await adminWrite(async () => json(status))(req())
      expect(res.status).toBe(status)
      expect(m.revalidatePublicContent.mock.calls.length, `status ${status}`).toBe(invalidated ? 1 : 0)
    }
  })

  it('a write that throws invalidates and answers 502', async () => {
    const res = await adminWrite(async () => {
      throw new Error('half saved')
    })(req())
    expect(res.status).toBe(502)
    expect((await res.json()).ok).toBe(false)
    expect(m.revalidatePublicContent).toHaveBeenCalledTimes(1)
  })

  it('a success marked unchanged leaves the cache', async () => {
    await adminWrite(async () => unchanged(json(200)))(req())
    expect(m.revalidatePublicContent).not.toHaveBeenCalled()
  })

  it('invalidates before answering, so the next load is the new copy', async () => {
    const order: string[] = []
    m.revalidatePublicContent.mockImplementation(async () => void order.push('invalidated'))
    await adminWrite(async () => json(200))(req()).then(() => order.push('answered'))
    expect(order).toEqual(['invalidated', 'answered'])
  })
})

describe('siteAdminWrite', () => {
  it('checks the site owners’ list, names no community, and invalidates', async () => {
    const handler = vi.fn(async () => json(200))
    await siteAdminWrite(handler)(req(''))
    expect(m.getAdminUser).toHaveBeenCalled()
    expect(m.resolveCommunity).not.toHaveBeenCalled()
    expect(handler).toHaveBeenCalledWith(expect.any(Request), { admin: { email: 'owner@x.co' } }, undefined)
    expect(m.revalidatePublicContent).toHaveBeenCalledTimes(1)
  })

  it('refuses a community admin who isn’t a site owner', async () => {
    m.getAdminUser.mockResolvedValue(null)
    expect((await siteAdminWrite(async () => json(200))(req(''))).status).toBe(401)
  })
})

describe('siteAdminRead', () => {
  it('signs in as a site owner, names no community, and never invalidates', async () => {
    const handler = vi.fn(async () => json(200))
    await siteAdminRead(handler)(req(''))
    expect(m.getAdminUser).toHaveBeenCalled()
    expect(m.resolveCommunity).not.toHaveBeenCalled()
    expect(handler).toHaveBeenCalledWith(expect.any(Request), { admin: { email: 'owner@x.co' } }, undefined)
    expect(m.revalidatePublicContent).not.toHaveBeenCalled()
  })

  it('refuses someone not a site owner', async () => {
    m.getAdminUser.mockResolvedValue(null)
    const handler = vi.fn(async () => json(200))
    expect((await siteAdminRead(handler)(req(''))).status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })
})
