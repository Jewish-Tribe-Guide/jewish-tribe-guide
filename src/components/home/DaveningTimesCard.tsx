'use client'

import Link from 'next/link'
import Image from 'next/image'
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
import type { LatLng } from '@/lib/geo'
import { routes } from '@/lib/routes'
import { community } from '@/community.config'
import { BookIcon } from '@/components/icons'
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
// still true, but the "one fact to glance at" itself (the specific next
// minyan's time/shul/countdown) was cut in a later pass, matching a
// photo-card reference the user supplied: fixed "Upcoming"/"Davening
// Times"/"See minyanim near you." copy, a photo placeholder on the right
// (same warm-gradient-plus-mask treatment as SuggestListingCard/
// CampaignBannerCard's own placeholders), and "View Times" as a real
// outline button instead of a text link — matching Suggest a Listing/Kept
// by the Community's own button treatment now that all three sit together
// in one row (see Landing.tsx's own community-row doc). The underlying
// nextUpcomingDavening computation stays (still needed for
// tomorrowHoliday/seeAllHref's `&day=` param — see below), it just isn't
// rendered on the card face any more. Not admin-editable any more either
// (settings.desktopDaveningEyebrow/Heading have no render site left) —
// same call the user made for the Browse card's "Explore by Category".
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
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6">
      {/* A real photo (tzitzit/siddur), not the gradient placeholder every
          other card in this row still uses — the user's own choice, a
          Pexels photo (free to use commercially, no attribution required,
          unlike an unlicensed/watermarked stock preview tried first). Not
          admin-editable — hardcoded the same way this card's copy already
          is. `unoptimized`: pexels.com isn't in next.config.ts's optimizer
          allowlist (imageHosts.ts) and doesn't need to be for one fixed
          photo — see that file's own doc on why the allowlist stays narrow
          rather than growing per image. The mask lives on this wrapper, not
          the `fill`ed Image itself — `fill` sets its own inset-0/100%
          sizing via inline style, which would fight a width/position class
          placed directly on it. No `z-index` (not even a negative one, tried
          first): this card div never establishes its own stacking context
          (plain `position: relative`, no z-index of its own), so a negative
          z-index on this wrapper escaped UP to the nearest ancestor that
          actually does establish one — landing it behind page-level layers
          instead of just behind the text column, and the photo vanished
          entirely. Sibling cards (SuggestListingCard/CampaignBannerCard) get
          the same "behind the text" result for free from plain DOM order —
          this wrapper renders first, the text column second, and two
          z-index:auto positioned/relative siblings paint in that order. */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 w-[42%] overflow-hidden [mask-image:linear-gradient(to_left,black_60%,transparent)]"
      >
        <Image
          src="https://images.pexels.com/photos/6340893/pexels-photo-6340893.jpeg"
          alt=""
          fill
          sizes="(min-width: 640px) 42vw, 0px"
          className="object-cover"
          unoptimized
        />
      </div>
      <div className="relative max-w-[58%]">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">Upcoming</p>
        <h3 className="font-serif text-lg font-semibold text-ink">Davening Times</h3>
        <p className="mt-2 text-sm text-slate-600">See minyanim near you.</p>
        <Link
          href={seeAllHref}
          className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-slate-50"
        >
          <BookIcon className="h-4 w-4 shrink-0" />
          View Times
        </Link>
      </div>
    </div>
  )
}
