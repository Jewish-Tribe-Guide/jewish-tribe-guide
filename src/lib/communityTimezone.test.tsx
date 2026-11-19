// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import type { DirectoryResource } from '@/types'
import { useCommunityTimezone } from './communityContext'
import { useMinyanSchedule } from './useMinyanSchedule'
import { anchorKey } from './useZmanAnchors'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// "Now" is the community's, wherever the visitor's device is: the day a
// Friday starts, when candles are, what's open. It used to be the config's
// time zone for every community on the site.
function Probe() {
  const timezone = useCommunityTimezone()
  const schedule = useMinyanSchedule(null)
  return <p data-testid="now">{schedule ? `${timezone} ${schedule.todayKey} ${schedule.nowMinutes}` : 'waiting'}</p>
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the community’s own time zone', () => {
  // Tuesday Oct 6, 12:30 AM in New York is still Monday 9:30 PM in Los Angeles.
  const at = new Date('2026-10-06T04:30:00Z')

  it('decides what day and time it is', async () => {
    vi.setSystemTime(at)
    renderWithProviders(<Probe />, { community: { timezone: 'America/Los_Angeles' } })
    expect(await screen.findByText('America/Los_Angeles mon 1290')).toBeInTheDocument()
  })

  it('is New York’s for a community in New York', async () => {
    vi.setSystemTime(at)
    renderWithProviders(<Probe />, { community: { timezone: 'America/New_York' } })
    expect(await screen.findByText('America/New_York tue 30')).toBeInTheDocument()
  })
})

// A shul with no address of its own is timed by its community's centre, and
// "is today Yom Tov" is asked there too while the visitor hasn't said where
// they are (Nov 19: both were Philadelphia's centre for every community).
describe('the community’s own centre', () => {
  const shuls = makeCategory({ id: 'shuls', kind: 'listing', detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] })
  const noAddress = makeListing({
    id: 'beth-am',
    category: 'shuls',
    geo: undefined,
    minyanim: [{ id: 'm1', tefillah: 'mincha', days: ['sun', 'mon', 'tue', 'wed', 'thu'], time: '', anchor: 'sunset', offsetMinutes: -15 }],
  } as Partial<DirectoryResource>)

  function SunsetProbe() {
    const schedule = useMinyanSchedule(null, [noAddress])
    return <p data-testid="sunset">{schedule?.anchors[anchorKey(undefined)]?.sunsetIso ?? 'none'}</p>
  }

  it('is where zmanim are asked for, and times a shul with no address', async () => {
    vi.setSystemTime(new Date('2026-10-06T18:00:00Z'))
    const fetchMock = vi.fn(async (url: string) => {
      const lat = new URL(url, 'http://x').searchParams.get('lat')
      const data = { dailyZmanim: [{ label: 'Sunset', iso: `sunset-at-${lat}` }], shabbos: {} }
      return new Response(JSON.stringify({ ok: true, data }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(<SunsetProbe />, {
      community: { timezone: 'America/Los_Angeles', mapCenter: { lat: 34.05, lng: -118.24 } },
      content: { categories: [shuls] },
    })
    expect(await screen.findByText('sunset-at-34.05')).toBeInTheDocument()
    const lats = fetchMock.mock.calls.map(([u]) => new URL(u, 'http://x').searchParams.get('lat'))
    expect(lats.length).toBeGreaterThan(0)
    expect(new Set(lats)).toEqual(new Set(['34.05']))
  })
})
