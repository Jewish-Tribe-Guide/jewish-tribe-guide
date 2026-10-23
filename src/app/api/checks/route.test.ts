import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Watch } from '@/lib/watches'
import { makeCategory } from '@/test/providerFixtures'
import { LISTING_PAGE_FOUND_CREATOR } from '@/lib/listingPageWatch'

// GET /api/checks: each kind of check the guide runs, with when one of its
// pages was last read properly, for the phone home's "How this guide stays
// right" sheet. Only the kind and the time: the address, errors and who set
// it up are the admin's.

const store = vi.hoisted(() => ({ watches: [] as Watch[], available: true }))
vi.mock('@/lib/watchStore', () => ({ listWatches: async () => ({ watches: store.watches, available: store.available }) }))
vi.mock('@/lib/resourceStore', () => ({ listApprovedResources: async () => [{ id: 'shul', category: 'synagogue' }] }))
vi.mock('@/lib/categoryStore', () => ({
  listCategories: async () => [makeCategory({ id: 'synagogue', detailFields: [{ key: 'minyanim', label: 'Davening Times', type: 'minyanim' }] })],
}))
vi.mock('@/lib/communityStore', () => ({ communitySlugFromRequest: () => 'philly', resolveCommunity: async () => ({ slug: 'philly' }) }))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: async () => null }))

const { GET } = await import('./route')

const watch = (over: Partial<Watch> = {}): Watch => ({
  id: 'w1',
  communityId: 'philly',
  kind: 'website',
  url: 'https://shul.example/davening',
  resourceId: 'shul',
  label: 'Davening times',
  active: true,
  createdAt: '2026-10-05T00:00:00Z',
  createdBy: LISTING_PAGE_FOUND_CREATOR,
  lastRunAt: '2026-10-23T07:00:00Z',
  lastOkAt: '2026-10-23T07:00:00Z',
  lastError: 'a past error',
  failingSince: null,
  lastFiled: 2,
  pageHash: null,
  pageChangedAt: null,
  lastCheck: null,
  ...over,
})
const call = async () => {
  const res = await GET(new Request('http://localhost/api/checks?community=philly'))
  return { res, body: await res.json() }
}

beforeEach(() => {
  store.watches = []
  store.available = true
})

describe('GET /api/checks', () => {
  it('a shul’s page read this morning: minyan times, and when; nothing else; shared at the CDN', async () => {
    store.watches = [watch(), watch({ id: 'w2', kind: 'keystone_list', resourceId: null, lastOkAt: null })]
    const { res, body } = await call()
    expect(body).toEqual({ ok: true, checks: [{ kind: 'times', at: '2026-10-23T07:00:00Z' }] })
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=600')
  })

  it('without the watch table: nothing', async () => {
    store.watches = [watch()]
    store.available = false
    expect((await call()).body).toEqual({ ok: true, checks: [] })
  })
})
