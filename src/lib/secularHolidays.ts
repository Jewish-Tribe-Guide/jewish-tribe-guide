// Secular (US federal) holidays, computed locally.
//
// These are the "Holiday" pseudo-day on a minyan — davening.ts has always
// documented it as the secular kind (July 4th, Thanksgiving), not yom tov,
// which is what a shul means when it posts a later shacharis for the days
// people are off work.
//
// Computed rather than fetched deliberately: every one of these is a fixed
// date or an nth-weekday rule, so there is nothing to look up, nothing to
// cache, and no way for a failed request to make the answer unknown. That
// matters because the answer is used to decide whether to SHOW a minyan —
// see useCalendarDays — and a network dependency there would mean a Hebcal
// outage could hide real minyanim.
//
// US-specific, which is a known limit rather than an oversight: a community
// outside the US would need its own list, and this module is where it would
// go (keyed off the community, the way community.timezone already keys
// zmanim). Not abstracted ahead of a second country actually existing.
//
// No observed-date shifting (the Friday/Monday a federal office closes when
// a fixed-date holiday lands on a weekend). The rule a shul posts is about
// the holiday itself, and the two only diverge on days that are usually
// Shabbos or Sunday anyway.

/** Local Y-M-D, avoiding UTC conversion — a holiday is a calendar date in the
 *  visitor's own day, not an instant. */
function parts(d: Date): { y: number; m: number; day: number; weekday: number } {
  return { y: d.getFullYear(), m: d.getMonth() + 1, day: d.getDate(), weekday: d.getDay() }
}

/** The date of the `n`th `weekday` of a month (1-indexed); n = -1 means last. */
function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  if (n === -1) {
    const last = new Date(year, month, 0).getDate()
    const lastWeekday = new Date(year, month - 1, last).getDay()
    return last - ((lastWeekday - weekday + 7) % 7)
  }
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  return 1 + ((weekday - firstWeekday + 7) % 7) + (n - 1) * 7
}

type Rule = { name: string; month: number; day?: number; weekday?: number; nth?: number }

const RULES: Rule[] = [
  { name: "New Year's Day", month: 1, day: 1 },
  { name: 'Martin Luther King Jr. Day', month: 1, weekday: 1, nth: 3 },
  { name: "Presidents' Day", month: 2, weekday: 1, nth: 3 },
  { name: 'Memorial Day', month: 5, weekday: 1, nth: -1 },
  { name: 'Juneteenth', month: 6, day: 19 },
  { name: 'Independence Day', month: 7, day: 4 },
  { name: 'Labor Day', month: 9, weekday: 1, nth: 1 },
  { name: 'Columbus Day', month: 10, weekday: 1, nth: 2 },
  { name: 'Veterans Day', month: 11, day: 11 },
  { name: 'Thanksgiving', month: 11, weekday: 4, nth: 4 },
  { name: 'Christmas Day', month: 12, day: 25 },
]

/** The holiday falling on `date`, or null. Name is display-ready. */
export function secularHoliday(date: Date): string | null {
  const { y, m, day } = parts(date)
  for (const rule of RULES) {
    if (rule.month !== m) continue
    const target = rule.day ?? nthWeekday(y, rule.month, rule.weekday!, rule.nth!)
    if (target === day) return rule.name
  }
  return null
}

/** The holiday falling on the calendar day after `now`, in `timezone` — NOT
 *  the caller's own device timezone (see dayAndMinutesInTimezone's own doc
 *  for why that distinction matters here specifically). Scoped to exactly
 *  this one case: DaveningTimesCard already knows "tomorrow" because it
 *  shows tomorrow's earliest minyan when today's have all passed, and
 *  linking from there straight into the modal's own "Today" filter would
 *  silently drop a shul's holiday-specific minyan if tomorrow happens to be
 *  one. This is not a general "any future day" capability — Rosh Chodesh's
 *  answer comes from Hebcal, which this app only ever queries for today, so
 *  a real "what does the calendar say about day N" would need that API
 *  call extended first. Secular holidays need no such thing: every one is a
 *  fixed date or an nth-weekday rule, computable for any date with nothing
 *  to fetch. */
export function secularHolidayTomorrow(now: number, timezone: string): string | null {
  const tomorrow = new Date(now + 24 * 60 * 60 * 1000)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(tomorrow)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  // Constructed from explicit Y/M/D, not parsed from an ISO string — this
  // makes `secularHoliday`'s own local getFullYear/getMonth/getDate reads
  // return exactly these values regardless of the machine's own timezone.
  return secularHoliday(new Date(get('year'), get('month') - 1, get('day')))
}
