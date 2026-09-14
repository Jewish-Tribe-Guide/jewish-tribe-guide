'use client'

import Link from 'next/link'
import { useCategories } from '@/lib/useCategories'
import { useAllListings } from '@/lib/useAllListings'
import { useCommunitySlug } from '@/lib/communityContext'
import { useNow } from '@/lib/useNow'
import { currentSeason } from '@/lib/season'
import { DAY_KEYS, dayAndMinutesInTimezone } from '@/lib/hours'
import { isMinyanim, type Minyan } from '@/lib/davening'
import { nextUpcomingDavening, formatStartsIn, type ShulMinyanim } from '@/lib/upcomingDavening'
import { secularHolidayTomorrow } from '@/lib/secularHolidays'
import { useZmanim } from '@/lib/useZmanim'
import { useZmanAnchors, geoOrCommunityDefault } from '@/lib/useZmanAnchors'
import type { LatLng } from '@/lib/geo'
import { routes } from '@/lib/routes'
import { community } from '@/community.config'
import { SunIcon } from '@/components/icons'
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
// Desktop mockup match (Phase 6, docs/desktop-mockup-plan.md): the one fact
// is a single compact amber-tinted row now — a sun icon, the tefillah name
// and shul (or "at N nearby shuls") on the left, the time and a plain-
// language countdown (formatStartsIn) on the right — rather than the larger
// bordered "plaque" this used to be. The card lost its own distance chip
// ("N mi") in the same pass: it no longer has the header-row space that
// used to hold it, and the card is now a peer of Update Listings/Suggest a
// Listing in a 3-up row (see Landing.tsx's own community-row doc) rather
// than pairing with Update Listings alone. "View all times" replaces the
// old amber pill button with a plain text link in the header row, matching
// the mockup's other "See more" links (DaveningTimesCard, UpdateListingsCard
// used to each have their own distinct CTA treatment; this card's own is
// now consistent with them). Amber, not a category colour: this card can
// show a minyan from any category with a minyanim field, so it isn't
// "Synagogues' own" the way a single-category card's icon tint would be.
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
      <div className="mb-4 flex items-end justify-between gap-2">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">{eyebrow}</p>
          <h3 className="font-serif text-lg font-semibold text-ink">{heading}</h3>
        </div>
        <Link href={seeAllHref} className="shrink-0 whitespace-nowrap text-xs font-semibold text-ink transition-colors hover:text-brand-teal">
          View all times →
        </Link>
      </div>

      {result ? (
        <div className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3">
          <SunIcon className="h-6 w-6 shrink-0 text-amber-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{result.label}</p>
            <p className="truncate text-xs text-slate-500">
              {result.shul ? result.shul.name : `at ${result.shulCount} nearby shuls`}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold tabular-nums text-ink">{result.time}</p>
            <p className="text-xs text-slate-500">
              {formatStartsIn(nowMinutes, result.minutes, result.isTomorrow)}
              {result.isTomorrow && ' tmrw'}
            </p>
          </div>
        </div>
      ) : (
        <p className="rounded-lg bg-slate-50 px-3.5 py-3 text-[13px] text-muted">
          No davening times posted yet.
        </p>
      )}
    </div>
  )
}
