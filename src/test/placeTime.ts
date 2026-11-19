import { HOURS_TIMEZONE } from '@/lib/hours'

/** The moment a wall clock in `timezone` reads this date and time; the same
 *  arguments as `new Date(y, m, d, h, min)` (month from 0), but read on the
 *  community's clock instead of the machine's.
 *
 *  Open/Closed reads the place's own clock (Nov 18, review item 9), so a
 *  test that sets "Wednesday noon" with `new Date(2026, 5, 24, 12)` means
 *  noon wherever the tests run: 7 AM in Philly on CI's UTC machines. That
 *  passed on a laptop in New York and failed in CI. vitest.config.ts runs
 *  the suite in UTC so a laptop sees what CI sees. */
export function placeTime(year: number, month: number, day: number, hours = 0, minutes = 0, timezone: string = HOURS_TIMEZONE): Date {
  const wall = Date.UTC(year, month, day, hours, minutes)
  let at = wall - offsetMinutes(wall, timezone) * 60_000
  // Across a clock change the offset at the guess isn't the offset at the
  // answer; one more pass settles it.
  const settled = offsetMinutes(at, timezone)
  if (settled !== offsetMinutes(wall, timezone)) at = wall - settled * 60_000
  return new Date(at)
}

/** How far `timezone`'s clock is ahead of UTC at `at`, in minutes. */
function offsetMinutes(at: number, timezone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
      .formatToParts(new Date(at))
      .map((p) => [p.type, Number(p.value)]),
  )
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
  return Math.round((asUtc - Math.floor(at / 60_000) * 60_000) / 60_000)
}
