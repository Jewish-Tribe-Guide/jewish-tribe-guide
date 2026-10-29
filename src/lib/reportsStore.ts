import { getAdminClient } from './supabase/admin'
import type { MissCountRow } from './missedSearches'
import {
  missedSearchCount,
  reportRange,
  tallyDecided,
  topViewed,
  viewBars,
  type Decided,
  type DecidedRow,
  type ReportPeriod,
  type ViewBar,
} from './reports'
import { dayInTimezone } from './activity'

// The reads behind the Reports page (see reports.ts). Uncached: an admin
// screen, a handful of small queries.

const PAGE = 1000
const TOP_PLACES = 6

export type Report = {
  /** "this week", "in October", "in 2026". */
  words: string
  views: { bars: ViewBar[]; total: number; since: string | null }
  topPlaces: { id: string; name: string; count: number }[]
  decided: Decided
  missedSearches: number
}

async function countsSince(community: string, kind: 'listing_view' | 'search_miss', start: string): Promise<MissCountRow[]> {
  const out: MissCountRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await getAdminClient()
      .from('daily_count')
      .select('key, day, count')
      .eq('community_id', community)
      .eq('kind', kind)
      .gte('day', start)
      .order('day')
      .order('key')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`Failed to load counts: ${error.message}`)
    out.push(...(data as MissCountRow[]))
    if (data.length < PAGE) return out
  }
}

async function firstCountedView(community: string): Promise<string | null> {
  const { data, error } = await getAdminClient()
    .from('daily_count')
    .select('day')
    .eq('community_id', community)
    .eq('kind', 'listing_view')
    .order('day')
    .limit(1)
  if (error) throw new Error(`Failed to load counts: ${error.message}`)
  return (data as { day: string }[])[0]?.day ?? null
}

async function decidedSince(community: string, start: string): Promise<DecidedRow[]> {
  // A day early, since the community's day can start before UTC's; the
  // tally then keeps only the range's own days.
  const from = new Date(`${start}T00:00:00Z`)
  from.setUTCDate(from.getUTCDate() - 1)
  const out: DecidedRow[] = []
  for (let page = 0; ; page += PAGE) {
    const { data, error } = await getAdminClient()
      .from('submission')
      .select('status, operation, target_type, reviewed_at')
      .eq('community_id', community)
      .in('status', ['approved', 'rejected'])
      .gte('reviewed_at', from.toISOString())
      .order('reviewed_at')
      .range(page, page + PAGE - 1)
    if (error) throw new Error(`Failed to load decisions: ${error.message}`)
    out.push(...(data as DecidedRow[]))
    if (data.length < PAGE) return out
  }
}

export async function getReport(community: { slug: string; timezone: string }, period: ReportPeriod, now = new Date()): Promise<Report> {
  const range = reportRange(period, dayInTimezone(community.timezone, now))
  const [views, firstCounted, misses, decided] = await Promise.all([
    countsSince(community.slug, 'listing_view', range.start),
    firstCountedView(community.slug),
    countsSince(community.slug, 'search_miss', range.start),
    decidedSince(community.slug, range.start),
  ])

  // A listing since taken off has no name to show; it's left out.
  const top = topViewed(views, TOP_PLACES * 2)
  let names = new Map<string, string>()
  if (top.length > 0) {
    const { data, error } = await getAdminClient()
      .from('resource')
      .select('id, name')
      .eq('community_id', community.slug)
      .in('id', top.map((t) => t.id))
    if (error) throw new Error(`Failed to load places: ${error.message}`)
    names = new Map((data as { id: string; name: string }[]).map((r) => [r.id, r.name]))
  }

  return {
    words: range.words,
    views: viewBars(range, views, firstCounted),
    topPlaces: top.filter((t) => names.has(t.id)).slice(0, TOP_PLACES).map((t) => ({ ...t, name: names.get(t.id)! })),
    decided: tallyDecided(decided, range, community.timezone),
    missedSearches: missedSearchCount(misses, range),
  }
}
