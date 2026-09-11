'use client'

import Link from 'next/link'
import { useCategories } from '@/lib/useCategories'
import { useAllListings } from '@/lib/useAllListings'
import { useCommunitySlug } from '@/lib/communityContext'
import { useNow } from '@/lib/useNow'
import { currentSeason } from '@/lib/season'
import { DAY_KEYS, dayAndMinutesInTimezone } from '@/lib/hours'
import { isMinyanim, type Minyan } from '@/lib/davening'
import { nextUpcomingDavening, type ShulMinyanim } from '@/lib/upcomingDavening'
import { secularHolidayTomorrow } from '@/lib/secularHolidays'
import { useZmanim } from '@/lib/useZmanim'
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
// upcomingDavening.ts for the actual "what's next" logic, which matches
// against whatever day keys this component resolves for "today"/"tomorrow"
// — the plain weekday, plus 'yom_tov' once useZmanim confirms it (a Rosh
// Chodesh-only or secular-holiday-only minyan still isn't a candidate here;
// this component only ever resolves Yom Tov, the one pseudo-day this card
// would otherwise show a flatly wrong "next minyan" for). This component's
// job is wiring real data into that logic and rendering the result as one
// row.
//
// Deliberately NOT the three-lines-per-tefillah design floated earlier —
// the point of this card is that there is nothing to read, only one fact
// to glance at, with "All davening times" as the answer to "and the rest?".
//
// The one fact used to sit in a plain blue-tinted row — a treatment that
// made sense when this was one row picked out of a list, and stopped
// making sense once the list was cut down to exactly one row: there was
// nothing left to pick it out FROM. It's a bordered "plaque" now instead —
// its own left accent, the time given real size and weight, the tefillah
// name promoted to a small label above it rather than sitting inline — so
// it reads as a stated fact rather than a list row. Amber, not a category
// colour: this card can show a minyan from any category with a minyanim
// field, so it isn't "Synagogues' own" the way a single-category card's
// icon tint would be, and amber is what the rest of this row (the
// community card beside it, "Today" above) already uses.
export default function DaveningTimesCard({
  coords,
  eyebrow,
  heading,
}: {
  coords: LatLng | null
  /** settings.desktopDaveningEyebrow/Heading — admin-editable (Desktop
   *  tab's Home screen cards). Defaults to "Today"/"Upcoming Davening". */
  eyebrow: string
  heading: string
}) {
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

  // In the community's own timezone, not the visitor's device — a visitor
  // whose device timezone doesn't match (a phone that travelled, a hospital
  // kiosk set to UTC) would otherwise get handed the wrong day's minyanim
  // entirely, or a `nowMinutes` off by hours. See dayAndMinutesInTimezone's
  // own doc for the exact symptom that traced back to here: a "this jumped
  // to tomorrow" or "showed an afternoon time for a morning minyan" report
  // that a plain `new Date(now).getDay()`/`.getHours()` would produce
  // whenever the two timezones disagree.
  const { day: todayKey, minutes: nowMinutes } = dayAndMinutesInTimezone(now, community.timezone)
  const tomorrowKey = DAY_KEYS[(DAY_KEYS.indexOf(todayKey) + 1) % 7]
  const season = currentSeason(now, community.timezone)

  // Falls back to the community's own default location, same as
  // ShabbatTimesCard — whether today is Yom Tov doesn't depend on which
  // exact address a visitor set (or hasn't), unlike `coords` above, which
  // stays the real, ungated visitor location because `nearestMiles` below
  // would be actively misleading measured from a fallback.
  const { data: zmanimData } = useZmanim(coords ?? community.mapCenter)
  const todayDayKeys = zmanimData?.isYomTov ? [todayKey, 'yom_tov' as const] : [todayKey]

  const result = nextUpcomingDavening(shuls, {
    today: todayDayKeys,
    tomorrow: [tomorrowKey],
    nowMinutes,
    season,
    anchors,
  })

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

  // `?davening=1` opens "All davening times" as soon as the category page
  // mounts (see GenericDirectory's own `openDaveningModal` doc) — without it
  // this landed on a bare category page and made the visitor find the same
  // button a second time to reach the thing this link's own label promised.
  // `&day=` additionally does the same for WHICH day it opens to: when this
  // card is showing tomorrow's earliest minyan (result.isTomorrow), the
  // modal defaulting to its own "Today" filter would land the visitor on a
  // day with nothing left to see and no visible reason why — see
  // GenericDirectory's own `initialDaveningDay` doc.
  //
  // Comma-separated, not just the weekday: if tomorrow is also a secular
  // holiday, a shul's holiday-specific minyan (days: ['holiday']) needs
  // that pseudo-day in the filter too, or it's invisible on a view that's
  // otherwise correctly showing tomorrow. Rosh Chodesh isn't included here
  // for the same reason — see secularHolidayTomorrow's own doc.
  const tomorrowHoliday = result?.isTomorrow ? secularHolidayTomorrow(now, community.timezone) : null
  const tomorrowDayParam = [tomorrowKey, ...(tomorrowHoliday ? ['holiday'] : [])].join(',')
  const seeAllHref = `${routes.slug(communitySlug, linkCategoryId)}?davening=1${result?.isTomorrow ? `&day=${tomorrowDayParam}` : ''}`

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">{eyebrow}</p>
      <div className="mb-4 flex items-baseline gap-2">
        <h3 className="text-lg font-semibold text-slate-900">{heading}</h3>
        {/* Top-right, off the plaque's own line entirely — see the
            component doc for why this only shows for a single named shul
            (nearestMiles is already null for a "nearby shuls" tie). */}
        {nearestMiles != null && (
          <span className="ml-auto whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">
            {nearestMiles} mi
          </span>
        )}
      </div>

      {result ? (
        <div className="rounded-xl border border-amber-100 border-l-4 border-l-amber-700 bg-gradient-to-b from-amber-50/40 to-white px-4 py-3.5">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-amber-800">{result.label}</p>
          <p className="mt-0.5 text-[32px] font-extrabold leading-none tracking-tight tabular-nums text-slate-900">
            {result.time}
            {result.isTomorrow && <span className="ml-1.5 text-base font-bold text-muted">tmrw</span>}
          </p>
          <p className="mt-2 text-[13px] font-semibold text-slate-600">
            {result.shul ? result.shul.name : `at ${result.shulCount} nearby shuls`}
          </p>
        </div>
      ) : (
        <p className="rounded-lg bg-slate-50 px-3.5 py-3 text-[13px] text-muted">
          No davening times posted yet.
        </p>
      )}

      <Link
        href={seeAllHref}
        className="mt-3.5 inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-amber-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-800"
      >
        All davening times →
      </Link>
    </div>
  )
}
