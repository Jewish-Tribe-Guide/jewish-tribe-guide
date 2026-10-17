import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The job's own decisions: each community with one budget, listings read
// fresh, and nothing without its key or its table. The work itself is
// walkRouteRun.test.ts.

const m = vi.hoisted(() => ({
  listCommunities: vi.fn(),
  listCategoriesUncached: vi.fn(),
  approvedListingsNow: vi.fn(),
  walkRoutesOf: vi.fn(),
  saveWalkRoutes: vi.fn(),
  workOutWalks: vi.fn(),
}))
vi.mock('./communityStore', () => ({ listCommunities: m.listCommunities }))
vi.mock('./categoryStore', () => ({ listCategoriesUncached: m.listCategoriesUncached }))
vi.mock('./walkRouteStore', () => ({ walkRoutesOf: m.walkRoutesOf, saveWalkRoutes: m.saveWalkRoutes, approvedListingsNow: m.approvedListingsNow }))
vi.mock('./walkRouteRun', () => ({ workOutWalks: m.workOutWalks, askOpenRouteService: vi.fn() }))

const { runWalkRoutes, runWalkRoutesAfterChange } = await import('./walkRouteJob')

beforeEach(() => {
  vi.stubEnv('OPENROUTESERVICE_API_KEY', 'key')
  m.listCommunities.mockResolvedValue([{ slug: 'philly' }, { slug: 'ues' }])
  m.listCategoriesUncached.mockResolvedValue([])
  m.walkRoutesOf.mockResolvedValue({ routes: new Map(), available: true })
  m.workOutWalks.mockResolvedValue({ listings: 3, asked: 3, walks: 30, failed: 0, leftForTomorrow: 0 })
})
afterEach(() => {
  vi.unstubAllEnvs()
  for (const f of Object.values(m)) f.mockReset()
})

describe('runWalkRoutes', () => {
  it('works out each community’s walks, sharing one budget between them', async () => {
    expect(await runWalkRoutes({ budget: 20 })).toMatchObject({ ok: true, results: { philly: { walks: 30 }, ues: { walks: 30 } } })
    expect(m.workOutWalks.mock.calls.map(([d]) => d.budget)).toEqual([20, 17])
  })

  it('reads listings as the table has them now, not the cached read an approval just made stale', async () => {
    await runWalkRoutes({ communities: ['philly'], budget: 5 })
    const deps = m.workOutWalks.mock.calls[0][0]
    await deps.listings('hotel')
    expect(m.approvedListingsNow).toHaveBeenCalledWith('philly', 'hotel')
    expect(m.listCommunities).not.toHaveBeenCalled()
  })

  it('does nothing without its key, and says why', async () => {
    vi.stubEnv('OPENROUTESERVICE_API_KEY', '')
    expect(await runWalkRoutes({ budget: 20 })).toEqual({ ok: true, skipped: 'OPENROUTESERVICE_API_KEY is not set' })
    expect(m.workOutWalks).not.toHaveBeenCalled()
  })

  it('does nothing before the walk_route table exists, and says why', async () => {
    m.walkRoutesOf.mockResolvedValue({ routes: new Map(), available: false })
    expect(await runWalkRoutes({ budget: 20 })).toEqual({ ok: true, skipped: 'migration 080 (walk_route) has not been run' })
    expect(m.workOutWalks).not.toHaveBeenCalled()
  })

  it('after an admin’s change, one community, and a failure never reaches the save', async () => {
    m.workOutWalks.mockRejectedValue(new Error('OpenRouteService 503'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(runWalkRoutesAfterChange('philly')).resolves.toBeUndefined()
    expect(m.walkRoutesOf).toHaveBeenCalledWith('philly')
    error.mockRestore()
  })
})
