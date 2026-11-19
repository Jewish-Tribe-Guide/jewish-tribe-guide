// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import { useMinyanSchedule } from './useMinyanSchedule'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// Tomorrow's Rosh Chodesh comes from the zmanim's days ahead
// (roshChodeshDays). Until Nov 19 only today's was read, so tomorrow's day
// keys never held rosh_chodesh and a shul's Rosh Chodesh minyan tomorrow
// was never "Next".
function Probe() {
  const schedule = useMinyanSchedule(null, [])
  return <p data-testid="keys">{schedule ? `${schedule.tomorrow.date} ${schedule.tomorrowDayKeys.includes('rosh_chodesh')}` : 'waiting'}</p>
}

function answering(data: object) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { dailyZmanim: [], shabbos: {}, ...data } }), { status: 200 })))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  // Tuesday Dec 8 2026, 9 PM in New York: tomorrow is Rosh Chodesh Teves.
  vi.setSystemTime(new Date('2026-12-09T02:00:00Z'))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("tomorrow's Rosh Chodesh", () => {
  it('is in tomorrow’s day keys when the calendar says so', async () => {
    answering({ roshChodeshDays: ['2026-12-09', '2026-12-10'], daysThrough: '2026-12-15', days: [] })
    renderWithProviders(<Probe />, { community: { timezone: 'America/New_York', mapCenter: { lat: 39.95, lng: -75.17 } } })
    expect(await screen.findByText('2026-12-09 true')).toBeInTheDocument()
  })

  it('is not when the calendar hasn’t said (an older cached answer)', async () => {
    answering({ daysThrough: '2026-12-15', days: [] })
    // Somewhere else, so useZmanim's own cache doesn't hand back the first test's answer.
    renderWithProviders(<Probe />, { community: { timezone: 'America/New_York', mapCenter: { lat: 40.7, lng: -74 } } })
    expect(await screen.findByText('2026-12-09 false')).toBeInTheDocument()
  })
})
