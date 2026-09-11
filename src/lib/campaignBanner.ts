// A reusable seasonal promotion — see the migration's own doc
// (20240101000052_campaign_banner.sql) for why this exists and what it's
// for. Visibility is purely the date range: `activeCampaignBanner` is the
// one place that decides "is one live right now", so the home banner and the
// map's own highlighted chip can't drift out of sync with each other.

export type CampaignBanner = {
  id: string
  categoryId: string
  title: string
  subtitle: string
  /** Inclusive, both ends. ISO 'YYYY-MM-DD' — a calendar date, not a instant,
   *  compared against the community's own local date (see
   *  activeCampaignBanner), not raw UTC. */
  startDate: string
  endDate: string
  /** Where the banner's own CTA (and nothing else — the map's own chip
   *  always stays a map chip) sends a visitor: the category's own directory
   *  page, or the map pre-filtered to it. Admin's own call per campaign —
   *  "people mostly care about the map" doesn't hold for every promotion. */
  destination: 'list' | 'map'
}

/** `now` (epoch ms) as the community's own local calendar date, 'YYYY-MM-DD'
 *  — the `en-CA` locale formats that way natively, which happens to also be
 *  exactly the format Postgres `date` columns compare against as strings.
 *  Same `Intl.DateTimeFormat({ timeZone })` idiom season.ts's offsetMinutes
 *  uses, for the same reason: the community's own clock, not the server's or
 *  the visitor's. */
function localDateString(timezone: string, now: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(now))
}

/** The one banner currently in its visible window, or null. Takes `now`
 *  explicitly (matching season.ts's `currentSeason(now, timezone)`) rather
 *  than reading the clock itself, so callers can drive it from useNow() and
 *  so this stays trivially testable.
 *
 *  If more than one banner's window overlaps today — not the normal case,
 *  nothing in the admin UI prevents it — the one with the latest start date
 *  wins, on the theory that whichever campaign was scheduled to start most
 *  recently is the one currently intended to be live. */
export function activeCampaignBanner(
  banners: CampaignBanner[],
  now: number,
  timezone: string,
): CampaignBanner | null {
  const today = localDateString(timezone, now)
  const live = banners.filter((b) => b.startDate <= today && today <= b.endDate)
  if (live.length === 0) return null
  return live.reduce((latest, b) => (b.startDate > latest.startDate ? b : latest))
}

/** Every category id with a currently-live campaign — unlike
 *  activeCampaignBanner (which picks the single ONE banner to actually
 *  show), a category's own visibility should follow ALL of them: two
 *  unrelated live campaigns linking to two different categories should
 *  promote both, not just whichever one activeCampaignBanner would have
 *  picked to display.
 *
 *  Used server-side (categoryStore.ts's listCategories) to let an otherwise
 *  admin-hidden category (active: false) become visible for exactly a
 *  campaign's own window, without a separate flag to keep in sync — see
 *  that migration's own doc. Deliberately plain UTC (no per-community
 *  timezone lookup): this feeds a `'use cache'`/`cacheLife('days')` read
 *  that already only refreshes roughly daily (this repo's existing
 *  sync-hours cron revalidates everything each morning), so a few hours of
 *  timezone imprecision on top of that day-scale staleness is not worth a
 *  second query just to resolve the community's own timezone here. The
 *  banner and map chip a visitor actually sees are still exact — they're
 *  computed client-side against the community's real timezone (see
 *  CampaignBannerCard, ResourceMapView). */
export function activeCampaignCategoryIds(banners: CampaignBanner[], now: number): Set<string> {
  const today = localDateString('UTC', now)
  return new Set(banners.filter((b) => b.startDate <= today && today <= b.endDate).map((b) => b.categoryId))
}
