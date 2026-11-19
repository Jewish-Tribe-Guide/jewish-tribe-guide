import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({ checkAllLinks: vi.fn(), recordJobRun: vi.fn(), sweepUnusedFiles: vi.fn() }))
vi.mock('@/lib/linkCheckRun', () => ({ checkAllLinks: m.checkAllLinks }))
vi.mock('@/lib/jobRunStore', () => ({ recordJobRun: m.recordJobRun }))
vi.mock('@/lib/storedFiles', () => ({ sweepUnusedFiles: m.sweepUnusedFiles }))

const { GET, POST } = await import('./route')
const req = (secret?: string) => new NextRequest('http://x/api/cron/check-links', { headers: secret ? { authorization: `Bearer ${secret}` } : {} })
const RUN = [{ community: 'philly', links: 92, checked: 92, dontOpen: 1, left: 0 }]

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', 's3cret')
  m.checkAllLinks.mockResolvedValue(RUN)
  m.sweepUnusedFiles.mockResolvedValue({ cleared: 2, bytes: 1_200_000 })
  m.recordJobRun.mockImplementation(async (_job: string, work: () => Promise<unknown>) => work())
})
afterEach(() => vi.unstubAllEnvs())

describe('/api/cron/check-links', () => {
  it('runs only for the cron', async () => {
    expect((await GET(req())).status).toBe(401)
    expect((await POST(req('wrong'))).status).toBe(401)
    expect(m.checkAllLinks).not.toHaveBeenCalled()
  })

  it('clears unused files, then checks every link, recorded as the link check’s run', async () => {
    expect(await (await GET(req('s3cret'))).json()).toEqual({ ok: true, links: RUN, files: { cleared: 2, bytes: 1_200_000 } })
    expect(m.sweepUnusedFiles.mock.invocationCallOrder[0]).toBeLessThan(m.checkAllLinks.mock.invocationCallOrder[0])
    expect(m.recordJobRun).toHaveBeenCalledWith('check-links', expect.any(Function), expect.any(Function))
    const outcome = m.recordJobRun.mock.calls[0][2]
    expect(outcome({ links: RUN, files: { cleared: 2, bytes: 1_200_000 } })).toMatchObject({ ok: true, summary: 'Checked 92 links · 1 didn’t open · cleared 2 unused files (1.2 MB)' })
  })

  it('the links get the same time as before, the sweep’s seconds included', async () => {
    const start = Date.now()
    await GET(req('s3cret'))
    const { stopAt } = m.checkAllLinks.mock.calls[0][0]
    expect(stopAt).toBeGreaterThanOrEqual(start + 240_000)
    expect(stopAt).toBeLessThan(start + 241_000)
  })
})
