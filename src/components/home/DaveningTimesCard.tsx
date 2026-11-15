'use client'

import { useIsDesktop } from '@/lib/useIsMobile'
import AnswerCard from './AnswerCard'
import { CategoryGlyph } from '@/lib/categoryIcons'
import { haversineMiles, milesText } from '@/lib/geo'
import { useCommunitySlug, useCommunityTimezone } from '@/lib/communityContext'
import { clockTime } from '@/lib/upcomingDavening'
import { nextMinyan, nextMinyanHref } from '@/lib/nextMinyan'
import { useMinyanSchedule } from '@/lib/useMinyanSchedule'
import { useCategories } from '@/lib/useCategories'
import { useAllListings } from '@/lib/useAllListings'
import { minyanimPage } from '@/lib/davening'
import type { LatLng } from '@/lib/geo'

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
// On the computer home (board G5b, Nov 11) it answers with the next minyan
// itself, big: "Mincha 4:15 PM", the shul and how far it is. An earlier pass
// had cut that for fixed "Davening Times / See minyanim near you" copy and a
// photo; G5b brings the answer back and drops the photo. The whole card is
// the link to every shul's times (AnswerCard). Not admin-editable, the same
// call the user made for the Browse card's "Explore by Category".
export default function DaveningTimesCard({ coords }: { coords: LatLng | null }) {
  const timezone = useCommunityTimezone()
  const communitySlug = useCommunitySlug()
  // Every shul's minyanim, today's day keys and the resolved sunset times —
  // shared with the search's minyan answers (see useMinyanSchedule).
  // Null until the page has hydrated (see useNow), when the card links to
  // today's times without saying which day.
  const schedule = useMinyanSchedule(coords)
  const categories = useCategories()
  const desktop = useIsDesktop()
  // Where "All davening times" lives, as useMinyanSchedule picks it.
  // The same page the schedule reads (minyanimPage: the category with the
  // most shuls). It used to be the first category with a minyanim field,
  // which on a community whose Food category also has one sent the card,
  // and its glyph, to Food (seen on dev, Nov 11).
  const allListings = useAllListings()
  const linkCategory = minyanimPage(categories ?? [], allListings)
  const linkCategoryId = linkCategory?.id

  const result = schedule ? nextMinyan(schedule) : null

  // No category configured with a minyanim field at all — not a loading
  // state, a real "this community hasn't set this up" — so the card
  // doesn't appear rather than showing a permanently-empty shell.
  if (!linkCategoryId) return null

  // All davening times, on the day the answer is for (nextMinyanHref).
  const seeAllHref = nextMinyanHref(communitySlug, linkCategoryId, result, schedule, timezone)

  // Where the visitor is, the nearest of the shuls the time is shared by.
  const nearest =
    result && coords
      ? Math.min(...result.shulGeos.flatMap((g) => (g ? [haversineMiles(coords, g)] : [])))
      : Infinity
  const where = result
    ? [
        result.shul ? result.shul.name : `${result.shulCount} shuls`,
        ...(Number.isFinite(nearest) ? [milesText(nearest)] : []),
        ...(result.isTomorrow ? ['tomorrow'] : []),
      ].join(' · ')
    : null

  return (
    <AnswerCard
      href={seeAllHref}
      // Prefetched on a computer only: a phone draws this card for a moment
      // before it has measured itself (see useIsDesktop).
      prefetch={desktop ? undefined : false}
      testId="home-next-minyan"
      icon={<CategoryGlyph categoryId={linkCategoryId} icon={linkCategory?.icon ?? ''} className="h-7 w-7" />}
      eyebrow="Next minyan"
      // Until the schedule is read, a bar; with nothing left today or
      // tomorrow, the card still leads to every shul's times.
      answer={schedule === null ? null : result ? `${result.label} ${clockTime(result.minutes)}` : 'Minyan times'}
      detail={where ?? (schedule ? 'Every shul in the guide' : undefined)}
    />
  )
}
