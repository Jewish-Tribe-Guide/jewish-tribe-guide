'use client'

import Link from 'next/link'
import { useCategories } from '@/lib/useCategories'
import { useAllListings } from '@/lib/useAllListings'
import { useCommunitySlug } from '@/lib/communityContext'
import { useNow } from '@/lib/useNow'
import { currentSeason } from '@/lib/season'
import { DAY_KEYS } from '@/lib/hours'
import { isMinyanim, type Minyan } from '@/lib/davening'
import { nextUpcomingDavening, type ShulMinyanim } from '@/lib/upcomingDavening'
import { useZmanAnchors, geoOrCommunityDefault } from '@/lib/useZmanAnchors'
import { distanceMiles, type LatLng } from '@/lib/geo'
import { routes } from '@/lib/routes'
import { community } from '@/community.config'
import type { CategoryConfig, CategoryField } from '@/lib/categories'

// ── The home screen's davening-times card — one line, deliberately. ────────
//
// Aggregates every listing in every category with a `minyanim`-type detail
// field (today, just Synagogues, but nothing here assumes that's the only
// one) and shows the single next minyan happening anywhere in the
// community, not a per-category or per-tefillah breakdown. See
// upcomingDavening.ts for the actual "what's next" logic and why it's
// scoped to real weekdays only; this component's job is just wiring real
// data into it and rendering the result as one row.
//
// Deliberately NOT the three-lines-per-tefillah design floated earlier —
// the point of this card is that there is nothing to read, only one fact
// to glance at, with "All davening times" as the answer to "and the rest?".
export default function DaveningTimesCard({ coords }: { coords: LatLng | null }) {
  const categories = useCategories()
  const listings = useAllListings()
  const communitySlug = useCommunitySlug()
  const now = useNow()

  const minyanimCategories: { category: CategoryConfig; field: CategoryField }[] = (categories ?? [])
    .map((c) => ({ category: c, field: c.detailFields.find((f) => f.type === 'minyanim') }))
    .filter((x): x is { category: CategoryConfig; field: CategoryField } => !!x.field)

  // No community running this app today has more than one such category —
  // Synagogues — but nothing above assumes exactly one, so this picks the
  // first (by the categories list's own order) purely to have a single
  // link target for "All davening times". A community that somehow split
  // minyanim across two categories would still aggregate every shul's
  // times correctly above; it would just link to one of them.
  const linkCategoryId = minyanimCategories[0]?.category.id

  const categoryFieldKey: Record<string, string> = {}
  for (const { category, field } of minyanimCategories) categoryFieldKey[category.id] = field.key

  const shuls: ShulMinyanim[] = (listings ?? [])
    .filter((l) => l.category in categoryFieldKey)
    .map((l) => {
      const raw = l[categoryFieldKey[l.category]]
      return { name: l.name, geo: l.geo, minyanim: isMinyanim(raw) ? (raw as Minyan[]) : [] }
    })
    .filter((s) => s.minyanim.length > 0)

  // Only shuls with at least one anchor-based row need a resolved sunset —
  // fetching zmanim for every shul's location regardless would cost a
  // request per distinct address for a card that mostly doesn't need it.
  const anchorGeos = shuls
    .filter((s) => s.minyanim.some((m) => m.anchor))
    .map((s) => geoOrCommunityDefault(s.geo))
  const anchors = useZmanAnchors(anchorGeos)

  const nowDate = new Date(now)
  const todayKey = DAY_KEYS[nowDate.getDay()]
  const tomorrowKey = DAY_KEYS[(nowDate.getDay() + 1) % 7]
  const nowMinutes = nowDate.getHours() * 60 + nowDate.getMinutes()
  const season = currentSeason(now, community.timezone)

  const result = nextUpcomingDavening(shuls, { today: todayKey, tomorrow: tomorrowKey, nowMinutes, season, anchors })

  // No category configured with a minyanim field at all — not a loading
  // state, a real "this community hasn't set this up" — so the card
  // doesn't appear rather than showing a permanently-empty shell.
  if (!linkCategoryId) return null

  const nearestMiles = (() => {
    if (!coords || !result) return null
    const known = result.shulGeos.filter((g): g is LatLng => !!g)
    if (known.length === 0) return null
    return Math.min(...known.map((g) => distanceMiles(coords, g)))
  })()

  const seeAllHref = routes.slug(communitySlug, linkCategoryId)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">Today</p>
      <h3 className="mb-4 text-lg font-semibold text-slate-900">Davening Times</h3>

      {result ? (
        <div className="flex items-baseline gap-2.5 rounded-lg bg-sky-50 px-3.5 py-3">
          <span className="text-sm font-semibold text-slate-900 whitespace-nowrap">{result.label}</span>
          <span className="min-w-0 truncate text-xs text-slate-500">
            {result.shul ? result.shul.name : `at ${result.shulCount} nearby shuls`}
            {nearestMiles != null && ` · ${nearestMiles} mi`}
          </span>
          <span className="ml-auto whitespace-nowrap text-[15px] font-extrabold tabular-nums text-primary">
            {result.time}
            {result.isTomorrow && ' tmrw'}
          </span>
        </div>
      ) : (
        <p className="rounded-lg bg-slate-50 px-3.5 py-3 text-[13px] text-muted">
          No davening times posted yet.
        </p>
      )}

      <Link href={seeAllHref} className="mt-3.5 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
        All davening times →
      </Link>
    </div>
  )
}
