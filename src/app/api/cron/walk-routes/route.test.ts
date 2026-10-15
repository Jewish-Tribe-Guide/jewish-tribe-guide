import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// The route's own decisions: who may run it, and that it does nothing
// without its key or its table. The work itself is walkRouteRun.test.ts.

const m = vi.hoisted(() => ({
  listCommunities: vi.fn(),
  listCategories: vi.fn(),
  listApprovedResources: vi.fn(),
  walkRoutesOf: vi.fn(),
  saveWalkRoutes: vi.fn(),
  workOutWalks: vi.fn(),
}))
vi.mock('@/lib/communityStore', () => ({ listCommunities: m.listCommunities }))
vi.mock('@/lib/categoryStore', () => ({ listCategories: m.listCategories }))
vi.mock('@/lib/resourceStore', () => ({ listApprovedResources: m.listApprovedResources }))
vi.mock('@/lib/walkRouteStore', () => ({ walkRoutesOf: m.walkRoutesOf, saveWalkRoutes: m.saveWalkRoutes }))
vi.mock('@/lib/walkRouteRun', () => ({ workOutWalks: m.workOutWalks, askOpenRouteService: vi.fn() }))

const { GET } = await import('./route')
const request = (headers: Record<string, string> = {}) => new NextRequest('http://localhost/api/cron/walk-routes', { headers })

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('CRON_SECRET', '')
  vi.stubEnv('OPENROUTESERVICE_API_KEY', 'key')
  m.listCommunities.mockResolvedValue([{ slug: 'philly' }, { slug: 'ues' }])
  m.listCategories.mockResolvedValue([])
  m.walkRoutesOf.mockResolvedValue({ routes: new Map(), available: true })
  m.workOutWalks.mockResolvedValue({ listings: 3, asked: 3, walks: 30, failed: 0, leftForTomorrow: 0 })
})
afterEach(() => {
  vi.unstubAllEnvs()
  for (const f of Object.values(m)) f.mockReset()
})

describe('GET /api/cron/walk-routes', () => {
  it('works out each community’s walks, sharing one budget between them', async () => {
    const res = await GET(request())
    expect(await res.json()).toMatchObject({ ok: true, results: { philly: { walks: 30 }, ues: { walks: 30 } } })
    expect(m.workOutWalks.mock.calls.map(([d]) => d.budget)).toEqual([20, 17])
  })

  it('needs the cron secret when one is set', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    expect((await GET(request())).status).toBe(401)
    expect((await GET(request({ authorization: 'Bearer s3cret' }))).status).toBe(200)
  })

  it('does nothing without its key, and says why', async () => {
    vi.stubEnv('OPENROUTESERVICE_API_KEY', '')
    expect(await (await GET(request())).json()).toEqual({ ok: true, skipped: 'OPENROUTESERVICE_API_KEY is not set' })
    expect(m.workOutWalks).not.toHaveBeenCalled()
  })

  it('does nothing before migration 080, and says why', async () => {
    m.walkRoutesOf.mockResolvedValue({ routes: new Map(), available: false })
    expect(await (await GET(request())).json()).toEqual({ ok: true, skipped: 'migration 080 (walk_route) has not been run' })
    expect(m.workOutWalks).not.toHaveBeenCalled()
  })
})
