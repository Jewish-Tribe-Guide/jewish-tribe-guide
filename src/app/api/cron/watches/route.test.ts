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
vi.mock('@/lib/websiteWatch', async (real) => ({ ...(await real<typeof import('@/lib/websiteWatch')>()), readWebsite: mockWebsite }))
const mockAlert = vi.hoisted(() => vi.fn())
vi.mock('@/lib/email', () => ({ sendWatchHealthAlert: mockAlert }))
const mockEruvLines = vi.hoisted(() => vi.fn(async () => []))
vi.mock('@/lib/eruvLineRun', () => ({ runEruvLines: mockEruvLines }))
const mockSyncMenus = vi.hoisted(() => vi.fn(async () => [] as unknown[]))
const mockMenu = vi.hoisted(() => vi.fn())
vi.mock('@/lib/menuWatchRun', () => ({ syncMenuWatches: mockSyncMenus, runMenuWatch: mockMenu, newMenuReadBudget: () => ({ aiReads: 3 }) }))
const mockSyncRefuah = vi.hoisted(() => vi.fn(async () => [] as unknown[]))
vi.mock('@/lib/refuahMatchRun', () => ({ syncRefuahWatches: mockSyncRefuah }))
const mockSyncHours = vi.hoisted(() => vi.fn(async () => [] as unknown[]))
vi.mock('@/lib/hoursJobRun', () => ({ syncHoursWatches: mockSyncHours }))
const mockListings = vi.hoisted(() => vi.fn(async () => ({ readsOf: (() => null) as (id: string) => 'times' | 'hours' | null, nameOf: () => null })))
vi.mock('@/lib/listingReads', () => ({ loadListings: mockListings }))
const mockListingPage = vi.hoisted(() => vi.fn())
vi.mock('@/lib/listingPageRun', () => ({ runListingPageWatch: mockListingPage }))
// The run's record: what the job ends with is saved (jobRunStore.test.ts
// has the saving).
const recordedOutcomes = vi.hoisted(() => [] as unknown[])
vi.mock('@/lib/jobRunStore', () => ({
  recordJobRun: async <T,>(job: string, run: () => Promise<T>, outcome: (r: T) => unknown) => {
    const result = await run()
    recordedOutcomes.push({ job, ...(outcome(result) as object) })
    return result
  },
}))

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
    lastCheck: null,
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
  recordedOutcomes.length = 0
  vi.restoreAllMocks()
})

describe('/api/cron/watches', () => {
  // Oct 17: each food place's menu link has a watch, made by the run itself.
  it('gives the menu links their watches first, then runs them on one shared AI budget', async () => {
    const order: string[] = []
    mockSyncMenus.mockImplementationOnce(async () => (order.push('sync'), [{ community: 'philly', added: 1, removed: 0 }]))
    mockList.mockImplementation(async () => (order.push('list'), {
      available: true,
      watches: [
        watch({ id: 'm1', url: 'https://judah.example/menu', resourceId: 'r1', createdBy: 'menu links', pageHash: 'old' }),
        watch({ id: 'm2', url: 'https://sweetbox.example/menu', resourceId: 'r2', createdBy: 'menu links' }),
      ],
    }))
    mockMenu.mockResolvedValue({ ok: true, filed: 0, pageHash: 'h' })
    const body = await (await GET(request())).json()
    expect(order).toEqual(['sync', 'list'])
    expect(body.menus).toEqual([{ community: 'philly', added: 1, removed: 0 }])
    expect(mockMenu).toHaveBeenCalledTimes(2)
    expect(mockMenu.mock.calls[0][0]).toMatchObject({ url: 'https://judah.example/menu', resourceId: 'r1', pageHash: 'old' })
    expect(mockMenu.mock.calls[0][1]).toBe(mockMenu.mock.calls[1][1])
    expect(mockWebsite).not.toHaveBeenCalled()
  })

  // Oct 21: each hospital is matched to Refuah by the run itself.
  it('matches the hospitals to Refuah before listing the watches, so a new match is read the same morning', async () => {
    const order: string[] = []
    mockSyncRefuah.mockImplementationOnce(async () => (order.push('refuah'), [{ community: 'philly', added: 1, removed: 0 }]))
    mockList.mockImplementation(async () => (order.push('list'), { available: true, watches: [] }))
    const body = await (await GET(request())).json()
    expect(order).toEqual(['refuah', 'list'])
    expect(body.hospitals).toEqual([{ community: 'philly', added: 1, removed: 0 }])
  })

  // Oct 21: each mikvah's pages of hours are found from its website.
  it('finds the mikvahs’ hours pages before listing the watches, so a new page is read the same morning', async () => {
    const order: string[] = []
    mockSyncHours.mockImplementationOnce(async () => (order.push('hours'), [{ community: 'philly', added: 2, removed: 0 }]))
    mockList.mockImplementation(async () => (order.push('list'), { available: true, watches: [] }))
    const body = await (await GET(request())).json()
    expect(order).toEqual(['hours', 'list'])
    expect(body.hours).toEqual([{ community: 'philly', added: 2, removed: 0 }])
  })

  it('a failure finding hours pages never stops the rest', async () => {
    mockSyncHours.mockRejectedValueOnce(new Error('db down'))
    mockList.mockResolvedValue({ available: true, watches: [watch({ id: 'site', url: 'https://bzbi.org/worship/' })] })
    const body = await (await GET(request())).json()
    expect(body.results.map((r: { id: string }) => r.id)).toEqual(['site'])
  })

  it('Refuah being down never stops the rest', async () => {
    mockSyncRefuah.mockRejectedValueOnce(new Error('Refuah answered 502'))
    mockList.mockResolvedValue({ available: true, watches: [watch({ id: 'site', url: 'https://bzbi.org/worship/' })] })
    const body = await (await GET(request())).json()
    expect(body.results.map((r: { id: string }) => r.id)).toEqual(['site'])
  })

  it('a failure making the menu watches never stops the rest', async () => {
    mockSyncMenus.mockRejectedValueOnce(new Error('db down'))
    mockList.mockResolvedValue({ available: true, watches: [watch({ id: 'site', url: 'https://bzbi.org/worship/' })] })
    const body = await (await GET(request())).json()
    expect(body.results.map((r: { id: string }) => r.id)).toEqual(['site'])
  })

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

  // Oct 24: the run checked the watches in the order they were added and
  // was cut off after 29 of 107 every morning, the newest never reached.
  describe('the order, and the time it has (Oct 24)', () => {
    it('checks the kosher lists first and the menus last, whatever order they were added in', async () => {
      const ran: string[] = []
      mockList.mockResolvedValue({
        available: true,
        watches: [
          watch({ id: 'menu', url: 'https://judah.example/menu', resourceId: 'r1', createdBy: 'menu links', lastRunAt: '2026-10-23T07:48:00.000Z' }),
          watch({ id: 'site', url: 'https://bzbi.org/worship/', lastRunAt: '2026-10-23T07:48:00.000Z' }),
          watch({ id: 'k', kind: 'keystone_list', url: 'https://keystone-k.org/establishments/', lastRunAt: '2026-10-23T07:48:00.000Z' }),
        ],
      })
      vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-24T07:47:00.000Z'))
      mockKeystone.mockImplementation(async () => (ran.push('k'), { ok: true, entries: 54, findings: 0, filed: 0, closedOnGoogle: [] }))
      mockWebsite.mockImplementation(async () => (ran.push('site'), { ok: true, filed: 0, pageHash: 'h' }))
      mockMenu.mockImplementation(async () => (ran.push('menu'), { ok: true, filed: 0, pageHash: 'h' }))
      await GET(request())
      expect(ran).toEqual(['k', 'site', 'menu'])
    })

    it('starts no watch after 200 seconds, and says how many it left for the next night', async () => {
      let clock = Date.parse('2026-10-24T07:47:00.000Z')
      vi.spyOn(Date, 'now').mockImplementation(() => clock)
      mockList.mockResolvedValue({ available: true, watches: [watch({ id: 'a' }), watch({ id: 'b' }), watch({ id: 'c' }), watch({ id: 'd' })] })
      // Each page takes two minutes: a, b started; c would start at 240s.
      mockWebsite.mockImplementation(async () => ((clock += 120_000), { ok: true, filed: 0, pageHash: 'h' }))
      const body = await (await GET(request())).json()
      expect(body.results.map((r: { id: string }) => r.id)).toEqual(['a', 'b'])
      expect(body.left).toBe(2)
      expect(recordedOutcomes).toEqual([
        { job: 'watches', ok: true, summary: 'Checked 2 of 4 watches', warning: 'Ran out of time: 2 left for the next night', kinds: { philly: { other: { of: 4, read: 2 } } } },
      ])
    })

    // Oct 26: 9 shul pages the night's reads ran out for counted as read.
    it('one the night’s reads ran out for isn’t checked or read, and isn’t saved as a run', async () => {
      mockList.mockResolvedValue({
        available: true,
        watches: [
          watch({ id: 'm1', url: 'https://a.example/menu', resourceId: 'r1', createdBy: 'menu links', pageHash: 'old' }),
          watch({ id: 'm2', url: 'https://b.example/menu', resourceId: 'r2', createdBy: 'menu links', pageHash: 'old' }),
        ],
      })
      mockMenu.mockResolvedValueOnce({ ok: true, filed: 0, pageHash: 'h' }).mockResolvedValueOnce({ ok: true, filed: 0, skipped: true })
      await GET(request())
      expect(recordedOutcomes).toEqual([
        { job: 'watches', ok: true, summary: 'Checked 1 of 2 watches', warning: 'Ran out of reads: 1 not read, for the next night', kinds: { philly: { menus: { of: 2, read: 1 } } } },
      ])
      expect(mockUpdate).toHaveBeenCalledTimes(1)
    })

    // Oct 25: one at a time, six slow AI reads left 33 of 107 unread.
    it('reads six sites at once, but one site a page at a time', async () => {
      let reading = 0
      let most = 0
      let onRefuah = 0
      let mostOnRefuah = 0
      mockWebsite.mockImplementation(async (url: string) => {
        const refuah = url.includes('refuah.com')
        reading++
        most = Math.max(most, reading)
        if (refuah) mostOnRefuah = Math.max(mostOnRefuah, ++onRefuah)
        await new Promise((r) => setTimeout(r, 5))
        reading--
        if (refuah) onRefuah--
        return { ok: true, filed: 0, pageHash: 'h' }
      })
      const sites = Array.from({ length: 8 }, (_, i) => watch({ id: `s${i}`, url: `https://site${i}.example/` }))
      mockList.mockResolvedValue({ available: true, watches: [...sites, watch({ id: 'h1', url: 'https://refuah.com/hospitals/a', createdBy: 'admin' }), watch({ id: 'h2', url: 'https://refuah.com/hospitals/b', createdBy: 'admin' })] })
      const body = await (await GET(request())).json()
      expect(body.results).toHaveLength(10)
      expect(body.left).toBe(0)
      expect(most).toBe(6)
      expect(mockWebsite.mock.calls.filter(([u]) => String(u).includes('refuah.com'))).toHaveLength(2)
      expect(mostOnRefuah).toBe(1)
    })

    it('records a run that got to everything', async () => {
      mockList.mockResolvedValue({ available: true, watches: [watch({ id: 'a' }), watch({ id: 'b', failingSince: '2026-10-22T07:00:00.000Z' })] })
      mockWebsite.mockResolvedValueOnce({ ok: true, filed: 0, pageHash: 'h' }).mockResolvedValueOnce({ ok: false, error: 'The page answered 403' })
      await GET(request())
      expect(recordedOutcomes).toEqual([{ job: 'watches', ok: true, summary: 'Checked 2 of 2 watches · 1 not working', warning: null, kinds: { philly: { other: { of: 2, read: 1 } } } }])
    })

    // Oct 25: for the Watches tab's line per kind (nightKinds.ts).
    it('records how many of each kind it read, per community', async () => {
      mockList.mockResolvedValue({
        available: true,
        watches: [
          watch({ id: 'k', kind: 'keystone_list', url: 'https://keystone-k.org/establishments/' }),
          watch({ id: 'menu', url: 'https://judah.example/menu', resourceId: 'r1', createdBy: 'menu links', communityId: 'ues' }),
        ],
      })
      mockKeystone.mockResolvedValue({ ok: true, entries: 54, findings: 0, filed: 0, closedOnGoogle: [] })
      mockMenu.mockResolvedValue({ ok: false, error: 'The page answered 404' })
      await GET(request())
      expect(recordedOutcomes[0]).toMatchObject({ kinds: { philly: { kosher: { of: 1, read: 1 } }, ues: { menus: { of: 1, read: 0 } } } })
    })

    // Oct 25: Mikvah Moishe Zvi's page, found as "its website", was saved
    // as Minyan times.
    it('counts a listing’s page by its category', async () => {
      mockList.mockResolvedValue({
        available: true,
        watches: [watch({ id: 'z', url: 'https://www.mikvahwestphilly.com/', resourceId: 'm1', label: 'Mikvah Moishe Zvi · its website', createdBy: 'listing pages (found)' })],
      })
      mockListings.mockResolvedValue({ readsOf: (id: string) => (id === 'm1' ? 'hours' : null), nameOf: () => null })
      mockListingPage.mockResolvedValue({ ok: true, filed: 0, pageHash: 'h' })
      await GET(request())
      expect(mockListings).toHaveBeenCalledWith(['philly'])
      expect(recordedOutcomes[0]).toMatchObject({ kinds: { philly: { hours: { of: 1, read: 1 } } } })
    })
  })
})
