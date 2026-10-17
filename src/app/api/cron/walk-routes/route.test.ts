import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Who may run it, and that it runs the job (walkRouteJob.test.ts) with its
// budget.

const m = vi.hoisted(() => ({ runWalkRoutes: vi.fn() }))
vi.mock('@/lib/walkRouteJob', () => ({ runWalkRoutes: m.runWalkRoutes }))

const { GET } = await import('./route')
const request = (headers: Record<string, string> = {}) => new NextRequest('http://localhost/api/cron/walk-routes', { headers })

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('CRON_SECRET', '')
  m.runWalkRoutes.mockResolvedValue({ ok: true, results: {} })
})
afterEach(() => {
  vi.unstubAllEnvs()
  m.runWalkRoutes.mockReset()
})

describe('GET /api/cron/walk-routes', () => {
  it('runs the job for every community, 20 requests at most', async () => {
    expect(await (await GET(request())).json()).toEqual({ ok: true, results: {} })
    expect(m.runWalkRoutes).toHaveBeenCalledWith({ budget: 20 })
  })

  it('needs the cron secret when one is set', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    expect((await GET(request())).status).toBe(401)
    expect(m.runWalkRoutes).not.toHaveBeenCalled()
    expect((await GET(request({ authorization: 'Bearer s3cret' }))).status).toBe(200)
  })
})
