import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({ readUnreadMenus: vi.fn() }))
vi.mock('@/lib/menuPlaceRead', () => ({ readUnreadMenus: m.readUnreadMenus }))

const { GET, POST } = await import('./route')
const req = (secret?: string) => new NextRequest('http://x/api/cron/read-menus', { headers: secret ? { authorization: `Bearer ${secret}` } : {} })

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', 's3cret')
  vi.stubEnv('OPENAI_API_KEY', 'key')
  m.readUnreadMenus.mockResolvedValue([{ community: 'philly', read: 2, left: 0 }])
})
afterEach(() => vi.unstubAllEnvs())

describe('/api/cron/read-menus', () => {
  it('runs only for the cron', async () => {
    expect((await GET(req())).status).toBe(401)
    expect((await POST(req('wrong'))).status).toBe(401)
    expect(m.readUnreadMenus).not.toHaveBeenCalled()
  })

  it('reads the menus never read, and says what it did', async () => {
    expect(await (await GET(req('s3cret'))).json()).toEqual({ ok: true, menus: [{ community: 'philly', read: 2, left: 0 }] })
    expect(m.readUnreadMenus).toHaveBeenCalledWith('key')
  })

  it('reads nothing without the AI reader set up', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    expect(await (await GET(req('s3cret'))).json()).toEqual({ ok: true, skipped: 'no OPENAI_API_KEY' })
    expect(m.readUnreadMenus).not.toHaveBeenCalled()
  })
})
