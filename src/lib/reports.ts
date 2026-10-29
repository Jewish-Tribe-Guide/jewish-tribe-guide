import type { SubmissionOperation, SubmissionStatus, SubmissionTargetType } from '@/types'
import { dayInTimezone } from './activity'
import type { MissCountRow } from './missedSearches'
import { isNewPlace } from './todo'

// ── Reports (the admin redesign's step 5, board "Reports") ───────────────────
// How the site is doing over a week, a month or a year: listings opened per
// day (per month for a year), the places opened most, what was decided and
// how many searches found nothing. All of it from what's already kept:
// daily_count (/api/counts) and the submission table. The pure half is here;
// reportsStore.ts reads the rows.
//
// Decided ones are grouped the way To do groups what's waiting (isNewPlace),
// so a "New places" here is a "New places" there. Removals get their own row
// on this board; To do lists them under Changes.

export type ReportPeriod = 'week' | 'month' | 'year'
export const REPORT_PERIODS: readonly ReportPeriod[] = ['week', 'month', 'year']

export type ReportBucket = { start: string; end: string; label: string }

export type ReportRange = {
  start: string
  end: string
  /** A day each, or a month each for a year. */
  buckets: ReportBucket[]
  /** "this week", "in October", "in 2026". */
  words: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function lastDayOfMonth(year: number, month: number): string {
  return new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10)
}

/** "Oct 17": a bar's label when it starts a month or the chart. */
export function shortDay(day: string): string {
  return `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`
}

/** The days a period covers, ending today (the community's own day). A week
 *  is the last seven days; a month and a year run from their first day. */
export function reportRange(period: ReportPeriod, today: string): ReportRange {
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7)) - 1
  if (period === 'year') {
    const buckets: ReportBucket[] = []
    for (let m = 0; m <= month; m++) {
      const start = `${year}-${String(m + 1).padStart(2, '0')}-01`
      buckets.push({ start, end: m === month ? today : lastDayOfMonth(year, m), label: MONTHS[m] })
    }
    return { start: `${year}-01-01`, end: today, buckets, words: `in ${year}` }
  }
  const start = period === 'week' ? addDays(today, -6) : `${today.slice(0, 7)}-01`
  const buckets: ReportBucket[] = []
  for (let day = start; day <= today; day = addDays(day, 1)) {
    const label = day === start || day.endsWith('-01') ? shortDay(day) : String(Number(day.slice(8, 10)))
    buckets.push({ start: day, end: day, label })
  }
  return { start, end: today, buckets, words: period === 'week' ? 'this week' : `in ${MONTH_NAMES[month]}` }
}

export type ViewBar = { label: string; count: number }

/** Listing views per bar, and their total. Bars before the first day
 *  anything was counted are left off, so a chart doesn't open on a run of
 *  empty days that were never measured; `since` is the first bar's day. */
export function viewBars(
  range: ReportRange,
  rows: readonly MissCountRow[],
  firstCounted: string | null,
): { bars: ViewBar[]; total: number; since: string | null } {
  const shown = firstCounted ? range.buckets.filter((b) => b.end >= firstCounted) : []
  const bars = shown.map((b, i) => {
    const start = i === 0 && firstCounted! > b.start ? firstCounted! : b.start
    // A day's bar that now opens the chart says its month ("Oct 17").
    const label = i === 0 && b.start === b.end ? shortDay(start) : b.label
    return { label, start, count: rows.filter((r) => r.day >= b.start && r.day <= b.end).reduce((n, r) => n + r.count, 0) }
  })
  return {
    bars: bars.map(({ label, count }) => ({ label, count })),
    total: bars.reduce((n, b) => n + b.count, 0),
    since: bars[0]?.start ?? null,
  }
}

/** The most opened listings, most first, as ids with their counts. */
export function topViewed(rows: readonly MissCountRow[], limit: number): { id: string; count: number }[] {
  const byId = new Map<string, number>()
  for (const r of rows) byId.set(r.key, (byId.get(r.key) ?? 0) + r.count)
  return [...byId.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
    .slice(0, limit)
}

export type DecidedRow = {
  status: SubmissionStatus
  operation: SubmissionOperation
  target_type: SubmissionTargetType
  reviewed_at: string | null
}

export type Decided = Record<'newPlaces' | 'changes' | 'removals', { taken: number; left: number }>

/** What was decided in the range, by the community's own day: taken
 *  (approved) and left (rejected), new places, changes and removals. */
export function tallyDecided(rows: readonly DecidedRow[], range: ReportRange, timezone: string): Decided {
  const out: Decided = { newPlaces: { taken: 0, left: 0 }, changes: { taken: 0, left: 0 }, removals: { taken: 0, left: 0 } }
  for (const r of rows) {
    if (!r.reviewed_at || (r.status !== 'approved' && r.status !== 'rejected')) continue
    const day = dayInTimezone(timezone, new Date(r.reviewed_at))
    if (day < range.start || day > range.end) continue
    const group = isNewPlace(r) ? out.newPlaces : r.operation === 'delete' ? out.removals : out.changes
    if (r.status === 'approved') group.taken++
    else group.left++
  }
  return out
}

/** How many different searches found nothing in the range. */
export function missedSearchCount(rows: readonly MissCountRow[], range: ReportRange): number {
  return new Set(rows.filter((r) => r.day >= range.start && r.day <= range.end).map((r) => r.key)).size
}
