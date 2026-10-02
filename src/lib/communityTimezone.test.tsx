// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import { useCommunityTimezone } from './communityContext'
import { useMinyanSchedule } from './useMinyanSchedule'

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
