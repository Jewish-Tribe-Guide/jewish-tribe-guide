'use client'

import AnswerCard from './AnswerCard'
import { useZmanim } from '@/lib/useZmanim'
import { useCommunitySlug, useCommunityTimezone } from '@/lib/communityContext'
import { useCategories } from '@/lib/useCategories'
import { shabbosMoment } from '@/lib/todayHome'
import { fixedViewSlug } from '@/lib/routes'
import FridayEruv from './FridayEruv'
import { useNow } from '@/lib/useNow'
import { countdown, shabbosCardView, type CardTime } from '@/lib/shabbosCard'
import { routes } from '@/lib/routes'
import { CandleIcon } from '@/components/icons'

// ── Shabbat & Holiday Times — candle lighting and havdalah, plus the next
// Yom Tov when there is one. ────────────────────────────────────────────────
//
// Used to be the full daily Zmanim (sunrise, latest Shema, latest Shacharis,
// sunset, nightfall) plus these two — five rows nobody asked about, next to
// the two anyone actually checks this card for. Trimmed to just candle
// lighting/havdalah on the reasoning that a card meant to be glanced at
// shouldn't need to be read.
//
// A white answer card beside Next minyan (board G5b, Nov 11; it was night
// ink with a gold glow until the user found that "too overwhelming for the
// page vibe"). It leads with one big time, the next thing
// to happen (see lib/shabbosCard.ts): "Candles 6:23 PM, in 2 h 54 min" on a
// Friday afternoon, havdalah once candles are lit. The period's other times
// sit under it, smaller. It used to show candle lighting and havdalah as
// two equal rows, highlighting one on its own day; the big time now does
// that job every day, since the next one is always the one that matters.
//
// The whole card opens the full zmanim page. The three buttons it used to
// carry (minyanim, zmanim, eruv) went with G5b: Next minyan sits beside it,
// and the eruv has its own page in the categories.
//
// `data.holidayPeriod` (see lib/zmanim.ts's own doc on how far ahead it
// looks and how it's grouped) replaces the Shabbos times entirely rather than
// sitting alongside them, whenever there's an upcoming Yom Tov within the
// window. The reason isn't just tidiness: on a week like Rosh Hashana,
// Hebcal's own feed doesn't produce a plain "Friday candle lighting" AND a
// separate holiday block — the holiday's own candle lighting IS that
// Friday's. Showing both would repeat the identical fact in identical
// words, one row apart.
//
// A fast day (`data.fastPeriod`) competes with that same block rather than
// sitting alongside it — see resolvePrimaryZmanimBlock in lib/zmanim.ts.
// Only one of the three (fast/holiday/shabbos) shows at a time, whichever
// hasn't ended (plus a 90-minute grace period past the fast's own end, so
// checking right after havdalah still shows it named) and begins soonest:
// on Tzom Gedaliah, that's the fast, even though Rosh Hashana's own Shabbos
// is also live that week; once the grace period passes, the card falls
// back to the holiday-or-Shabbos block on its own.
//
// Board L1 (the user, Nov 11): whenever the phone shows its candles card
// (Friday or Erev Yom Tov, and through Shabbos), this card carries the same
// eruv line along its bottom (FridayEruv, in its light look), a link of
// its own to the Eruv page. The rest of the week it has none.
//
// Lives below the map now, paired with Stay in the loop (see Landing.tsx) —
// it used to sit above the map, in the HomeBreak grid, alongside Davening
// Times and the community card, then paired with SubscribeSection below the
// map instead. Now fully independent — every desktop home-screen card is
// (see homeSections.ts's own doc) — so it no longer assumes anything about
// what renders beside it.
export default function ShabbatTimesCard({
  coords,
  locationLabel,
}: {
  /** The visitor's address, or the community center — see Landing, which
   *  falls back so this never renders a "set your location" prompt. A
   *  city-wide approximation is fine for candle lighting. */
  coords: { lat: number; lng: number } | null
  locationLabel: string
}) {
  const { data, status } = useZmanim(coords)
  const communitySlug = useCommunitySlug()
  const now = useNow()
  const view = data && now !== null ? shabbosCardView(data, now) : null
  const soon = view?.next && now !== null ? countdown(view.next.iso, now) : null
  const loading = status === 'loading' || (status === 'ready' && now === null)
  const timezone = useCommunityTimezone()
  const categories = useCategories()
  const eruvPage = categories?.find((c) => c.kind === 'eruv')
  const eruvHref = eruvPage ? routes.slug(communitySlug, fixedViewSlug(eruvPage.kind) ?? eruvPage.id) : null
  const showEruv = eruvHref !== null && now !== null && shabbosMoment(data ?? null, now, timezone).kind !== 'weekday'

  // "This Shabbos", "This Sukkos"; a fast by its own name.
  const eyebrow = view ? (view.kind === 'fast' ? view.name : `This ${view.name}`) : 'Shabbat & holidays'
  const answer = loading ? null : view?.next ? `${view.next.label} ${view.next.time}` : 'Zmanim'
  const when = view?.next ? [...(soon ? [soon] : []), view.next.when, ...view.also.map((t: CardTime) => `${t.label} ${t.when} ${t.time}`)].join(' · ') : null

  return (
    <AnswerCard
      href={routes.slug(communitySlug, 'zmanim')}
      testId="home-shabbos"
      footer={showEruv ? <FridayEruv communitySlug={communitySlug} href={eruvHref} now={now} look="light" /> : undefined}
      icon={<CandleIcon className="h-7 w-7" />}
      eyebrow={eyebrow}
      answer={answer}
      detail={
        loading ? undefined : data && view ? (
          <>
            {when}
            {/* Only the place: the times depend on it. The Hebrew date and
                the Hebcal credit live on the Zmanim page the card opens, as
                Next minyan leaves its sources to its page (the user, Nov 12). */}
            <span className="mt-0.5 block text-xs text-slate-400">{locationLabel}</span>
          </>
        ) : (
          'Unavailable right now. Please try again in a moment.'
        )
      }
    />
  )
}
