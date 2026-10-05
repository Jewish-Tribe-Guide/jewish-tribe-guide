import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { Watch } from '@/lib/watches'

// The cron's own decisions: every active watch runs, one broken watch never
// stops the rest, each run is saved, and the admins hear about a watch only
// when it breaks or recovers. What a run does is tested where it lives
// (keystoneRun, websiteWatch); the rules in watches.test.ts.

const mockList = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn())
vi.mock('@/lib/watchStore', () => ({ listAllWatches: mockList, updateWatch: mockUpdate }))
const mockKeystone = vi.hoisted(() => vi.fn())
vi.mock('@/lib/keystoneRun', () => ({ runKeystoneWatch: mockKeystone }))
const mockWebsite = vi.hoisted(() => vi.fn())
vi.mock('@/lib/websiteWatch', () => ({ readWebsite: mockWebsite }))
const mockAlert = vi.hoisted(() => vi.fn())
vi.mock('@/lib/email', () => ({ sendWatchHealthAlert: mockAlert }))

const { GET } = await import('./route')

function watch(over: Partial<Watch>): Watch {
  return {
    id: 'w',
    communityId: 'philly',
    kind: 'website',
    url: 'https://example.org/',
    resourceId: null,
    label: null,
    active: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    createdBy: null,
    lastRunAt: null,
    lastOkAt: null,
    lastError: null,
    failingSince: null,
    lastFiled: null,
    pageHash: null,
    pageChangedAt: null,
    ...over,
  }
}

const request = () => new NextRequest('http://localhost/api/cron/watches')

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test')
  delete process.env.CRON_SECRET
  mockUpdate.mockResolvedValue(undefined)
  mockAlert.mockResolvedValue(undefined)
  mockKeystone.mockResolvedValue({ ok: true, entries: 54, findings: 0, filed: 0, closedOnGoogle: [] })
  mockWebsite.mockResolvedValue({ ok: true, filed: 0, pageHash: 'h' })
})

afterEach(() => {
  vi.unstubAllEnvs()
  for (const m of [mockList, mockUpdate, mockKeystone, mockWebsite, mockAlert]) m.mockReset()
})

describe('/api/cron/watches', () => {
  it('runs every active watch with its own reader, and saves each run', async () => {
    mockList.mockResolvedValue({
      available: true,
      watches: [
        watch({ id: 'k', kind: 'keystone_list', url: 'https://keystone-k.org/establishments/' }),
        watch({ id: 'site', url: 'https://bzbi.org/worship/' }),
        watch({ id: 'paused', active: false }),
      ],
    })
    const body = await (await GET(request())).json()
    expect(mockKeystone).toHaveBeenCalledWith('philly', 'https://keystone-k.org/establishments/')
    expect(mockWebsite).toHaveBeenCalledWith('https://bzbi.org/worship/')
    expect(body.results.map((r: { id: string }) => r.id)).toEqual(['k', 'site'])
    expect(mockUpdate.mock.calls.map(([, id]) => id)).toEqual(['k', 'site'])
    expect(mockAlert).not.toHaveBeenCalled()
  })

  it('keeps going past a watch that throws, records it as broken, and emails once', async () => {
    mockList.mockResolvedValue({
      available: true,
      watches: [watch({ id: 'bad', kind: 'keystone_list', label: 'Keystone-K’s list' }), watch({ id: 'good' })],
    })
    mockKeystone.mockRejectedValue(new Error('boom'))
    await GET(request())
    expect(mockWebsite).toHaveBeenCalled()
    const saved = mockUpdate.mock.calls.find(([, id]) => id === 'bad')![2]
    expect(saved).toMatchObject({ lastError: 'boom', failingSince: expect.any(String) })
    expect(mockAlert).toHaveBeenCalledTimes(1)
    expect(mockAlert.mock.calls[0][1]).toEqual([
      { label: 'Keystone-K’s list', url: 'https://example.org/', alert: 'broke', error: 'boom' },
    ])
  })

  it('does not email again about a watch that was already broken', async () => {
    mockList.mockResolvedValue({ available: true, watches: [watch({ id: 'bad', failingSince: '2026-10-05T07:00:00.000Z' })] })
    mockWebsite.mockResolvedValue({ ok: false, error: 'The page answered 403' })
    await GET(request())
    expect(mockAlert).not.toHaveBeenCalled()
  })

  it('emails when a broken watch works again', async () => {
    mockList.mockResolvedValue({ available: true, watches: [watch({ id: 'mended', failingSince: '2026-10-05T07:00:00.000Z' })] })
    await GET(request())
    expect(mockAlert.mock.calls[0][1][0]).toMatchObject({ alert: 'recovered' })
  })

  it('runs Philadelphia’s Keystone-K list as before when migration 070 hasn’t been run', async () => {
    mockList.mockResolvedValue({ available: false, watches: [] })
    const body = await (await GET(request())).json()
    expect(body.recorded).toBe(false)
    expect(mockKeystone).toHaveBeenCalledWith('philly', 'https://keystone-k.org/establishments/')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('refuses a production request without the cron secret', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect((await GET(request())).status).toBe(401)
    expect(mockList).not.toHaveBeenCalled()
  })
})
