// ── A day as "2026-11-20", worked out one way (Nov 20) ──────────────────────
// Six files had their own addDays and sixteen their own "today's date on
// this community's clock" (the health sweep). They agreed, but each was one
// more place to get a time zone or a month's end wrong.
// src/test/oneDayHelper.test.ts fails on a new copy.

/** `day` ("2026-11-20") plus `n` days, negative going back. Calendar days
 *  only: no instant, so no time zone to land on the wrong side of. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

const formats = new Map<string, Intl.DateTimeFormat>()

/** The date on the clock in `timezone` at `at` (a time in ms, a Date, or
 *  an ISO string): "2026-11-20". A time that isn't one comes back as
 *  "Invalid Date", as toLocaleDateString, which half the copies used, says
 *  it, rather than throwing as Intl's own format does. */
export function dayInTimezone(timezone: string, at: number | string | Date): string {
  const when = new Date(at)
  if (Number.isNaN(when.getTime())) return 'Invalid Date'
  let format = formats.get(timezone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    formats.set(timezone, format)
  }
  return format.format(when)
}
