import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Watch } from '@/lib/watches'

// GET /api/sources: the outside lists the guide reads on its own, for the
// phone home's "How this guide stays right" sheet. Only a list that has
// actually been read is named, and only its name and when: the address,
// errors and who set it up are the admin's.

const store = vi.hoisted(() => ({ watches: [] as Watch[], available: true }))
vi.mock('@/lib/watchStore', () => ({ listWatches: async () => ({ watches: store.watches, available: store.available }) }))
vi.mock('@/lib/communityStore', () => ({ communitySlugFromRequest: () => 'philly', resolveCommunity: async () => ({ slug: 'philly' }) }))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: async () => null }))

const { GET } = await import('./route')

const watch = (over: Partial<Watch> = {}): Watch => ({
  id: 'w1',
  communityId: 'philly',
  kind: 'keystone_list',
  url: 'https://keystone-k.example/list',
  resourceId: null,
  label: 'Keystone-K’s list',
  active: true,
  createdAt: '2026-10-05T00:00:00Z',
  createdBy: 'admin@example.org',
  lastRunAt: '2026-10-17T07:00:00Z',
  lastOkAt: '2026-10-17T07:00:00Z',
  lastError: null,
  failingSince: null,
  lastFiled: 2,
  pageHash: null,
  pageChangedAt: null,
  lastCheck: null,
  ...over,
})
const call = async () => {
  const res = await GET(new Request('http://localhost/api/sources?community=philly'))
  return { res, body: await res.json() }
}

beforeEach(() => {
  store.watches = []
  store.available = true
})

describe('GET /api/sources', () => {
  it('a kashrus list that has been read: its name and when, nothing else; shared at the CDN', async () => {
    store.watches = [watch()]
    const { res, body } = await call()
    expect(body).toEqual({ ok: true, lists: [{ label: 'Keystone-K’s list', okAt: '2026-10-17T07:00:00Z' }] })
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=600')
  })

  // As on the live site today: set up, never run.
  it('claims nothing for a list never read, one switched off, or a single web page watched', async () => {
    store.watches = [watch({ lastOkAt: null, lastRunAt: null }), watch({ id: 'w2', active: false }), watch({ id: 'w3', kind: 'website', label: 'A shul’s page' })]
    expect((await call()).body).toEqual({ ok: true, lists: [] })
  })

  it('without the watch table: nothing', async () => {
    store.available = false
    expect((await call()).body).toEqual({ ok: true, lists: [] })
  })
})
