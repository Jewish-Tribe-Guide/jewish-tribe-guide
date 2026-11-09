import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'

const m = vi.hoisted(() => ({
  getAdminUserForCommunity: vi.fn(),
  resolveCommunity: vi.fn(),
  listListingPagesEverywhere: vi.fn(),
}))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({
  communitySlugFromRequest: (r: Request) => new URL(r.url).searchParams.get('community'),
  resolveCommunity: m.resolveCommunity,
}))
vi.mock('@/lib/categoryStore', () => ({ listListingPagesEverywhere: m.listListingPagesEverywhere }))

import { GET } from './route'

afterEach(() => vi.clearAllMocks())

describe('GET /api/admin/ready-made', () => {
  it('refuses anyone who isn’t an admin of the community, before reading anything', async () => {
    m.resolveCommunity.mockResolvedValue({ slug: 'philly' })
    m.getAdminUserForCommunity.mockResolvedValue(null)
    const res = await GET(new Request('http://x/api/admin/ready-made?community=philly'))
    expect(res.status).toBe(401)
    expect(m.listListingPagesEverywhere).not.toHaveBeenCalled()
  })

  it('gives an admin every community’s pages', async () => {
    m.resolveCommunity.mockResolvedValue({ slug: 'philly' })
    m.getAdminUserForCommunity.mockResolvedValue({ email: 'a@b.c' })
    const pages = [{ community: 'dc', category: makeCategory({ id: 'mikvah', pluralLabel: 'Mikvah' }) }]
    m.listListingPagesEverywhere.mockResolvedValue(pages)
    const res = await GET(new Request('http://x/api/admin/ready-made?community=philly'))
    expect(await res.json()).toEqual({ ok: true, pages: JSON.parse(JSON.stringify(pages)) })
  })
})
