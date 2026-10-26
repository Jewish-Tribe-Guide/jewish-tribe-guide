import { beforeEach, expect, it, vi } from 'vitest'
import { makeListing } from '@/test/providerFixtures'
import type { Watch } from '@/lib/watches'

const m = vi.hoisted(() => ({ getAdminUserForCommunity: vi.fn(), sitePlaces: vi.fn(), listWatches: vi.fn(), jobFindings: vi.fn() }))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({ communitySlugFromRequest: () => 'philly', resolveCommunity: async () => ({ slug: 'philly' }) }))
vi.mock('@/lib/hoursJobRun', () => ({ sitePlaces: m.sitePlaces }))
vi.mock('@/lib/watchStore', () => ({ listWatches: m.listWatches }))
vi.mock('@/lib/watchFindingStore', () => ({ jobFindings: m.jobFindings }))

const { GET } = await import('./route')
const { LISTING_PAGE_WATCH_CREATOR } = await import('@/lib/listingPageWatch')

const GIANT = '0b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21'
const CKIDS = '7d1f3c2a-9b8e-4c6d-a5f4-3e2d1c0b9a87'
const req = () => new Request('http://x/api/admin/watches/sites')
const w = (over: Partial<Watch>) => ({ id: 'w1', communityId: 'philly', kind: 'website', url: 'https://giant.example/', resourceId: GIANT, active: true, createdBy: LISTING_PAGE_WATCH_CREATOR, ...over }) as Watch

beforeEach(() => {
  vi.clearAllMocks()
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'me@x.co' })
  m.sitePlaces.mockResolvedValue({
    categories: [{ id: 'grocery' }, { id: 'childcare' }],
    places: [makeListing({ id: GIANT, name: 'GIANT', category: 'grocery' }), makeListing({ id: CKIDS, name: 'CKids Philly', category: 'childcare' })],
  })
  m.listWatches.mockResolvedValue({ available: true, watches: [w({}), w({ id: 'other', resourceId: CKIDS, kind: 'newsletter' as never, createdBy: null })] })
  m.jobFindings.mockResolvedValue({ findings: [{ id: 'f1', targetId: GIANT }], decided: new Map([[CKIDS, { at: '2026-10-24T08:00:00Z', status: 'rejected' }]]) })
})

it('refuses anyone but an admin', async () => {
  m.getAdminUserForCommunity.mockResolvedValue(null)
  expect((await GET(req())).status).toBe(401)
})

// Oct 25 (the user): "grocery should go to grocery". Each place whose own
// website is read, with no job page of its own, and what it found.
it('each place, its own website’s pages, what they found and when it was last decided', async () => {
  const body = await (await GET(req())).json()
  expect(m.jobFindings).toHaveBeenCalledWith('philly', 'sites', [{ id: 'grocery' }, { id: 'childcare' }])
  expect(body.places.map((p: { name: string; category: string; pages: { watch: Watch }[]; findings: { id: string }[]; decided: unknown }) => [p.name, p.category, p.pages.map((x) => x.watch.id), p.findings.map((f) => f.id), p.decided])).toEqual([
    ['GIANT', 'grocery', ['w1'], ['f1'], null],
    ['CKids Philly', 'childcare', [], [], { at: '2026-10-24T08:00:00Z', status: 'rejected' }],
  ])
  expect(body.places[0].href).toMatch(/^\/philly\/grocery\//)
})
