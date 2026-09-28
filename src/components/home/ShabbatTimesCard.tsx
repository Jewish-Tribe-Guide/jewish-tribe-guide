'use client'

import Link from 'next/link'
import { useZmanim } from '@/lib/useZmanim'
import { useCommunitySlug } from '@/lib/communityContext'
import { useCategories } from '@/lib/contentContext'
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
// Night ink with a gold glow, as in the redesign's Today mockups: the one
// card on the home screen that's about time rather than places, and the one
// place gold (candles) appears. It leads with one big time, the next thing
// to happen (see lib/shabbosCard.ts): "Candles 6:23 PM, in 2 h 54 min" on a
// Friday afternoon, havdalah once candles are lit. The period's other times
// sit under it, smaller. It used to show candle lighting and havdalah as
// two equal rows, highlighting one on its own day; the big time now does
// that job every day, since the next one is always the one that matters.
//
// Under the times, the three places people go next: the minyanim, the full
// zmanim, and the eruv, each only when the community has that page.
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
// Lives below the map now, paired with Stay in the loop (see Landing.tsx) —
// it used to sit above the map, in the HomeBreak grid, alongside Davening
// Times and the community card, then paired with SubscribeSection below the
// map instead. Now fully independent — every desktop home-screen card is
// (see homeSections.ts's own doc) — so it no longer assumes anything about
// what renders beside it.
export default function ShabbatTimesCard({
  coords,
  locationLabel,
  heading = 'Shabbat & Holiday Times',
}: {
  /** The visitor's address, or the community center — see Landing, which
   *  falls back so this never renders a "set your location" prompt. A
   *  city-wide approximation is fine for candle lighting. */
  coords: { lat: number; lng: number } | null
  locationLabel: string
  /** settings.desktopJewishTimesHeading — admin-editable (Desktop tab's
   *  Home screen cards). Optional with today's literal default, so existing
   *  tests that render this in isolation don't all need updating. No
   *  matching eyebrow prop — this card's own eyebrow (below) is the
   *  computed Hebrew date + location, not static text worth overriding. */
  heading?: string
}) {
  const { data, status } = useZmanim(coords)
  const communitySlug = useCommunitySlug()
  const categories = useCategories()
  const now = useNow()
  const view = data ? shabbosCardView(data, now) : null
  const soon = view?.next ? countdown(view.next.iso, now) : null

  const minyanCategory = categories?.find((c) => c.detailFields.some((f) => f.type === 'minyanim'))
  const eruvCategory = categories?.find((c) => c.kind === 'eruv')
  const actions = [
    ...(minyanCategory ? [{ label: 'Minyanim', href: `${routes.slug(communitySlug, minyanCategory.id)}?davening=1` }] : []),
    { label: 'All zmanim', href: routes.slug(communitySlug, 'zmanim') },
    ...(eruvCategory ? [{ label: 'Eruv', href: routes.slug(communitySlug, eruvCategory.id) }] : []),
  ]

  return (
    <div className="relative isolate overflow-hidden rounded-2xl bg-ink p-6 text-white">
      {/* The candle's glow, top right. Decoration only. */}
      <div
        aria-hidden="true"
        className="absolute -right-12 -top-12 -z-10 h-48 w-48 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--color-gold)_40%,transparent),transparent_70%)]"
      />
      <h3 className="flex items-center gap-2 text-[13px] font-semibold text-slate-300">
        <CandleIcon className="h-4 w-4 text-gold" />
        {heading}
      </h3>

      {status === 'loading' ? (
        <div className="mt-4 space-y-2" aria-live="polite" aria-busy="true">
          <div className="h-8 w-1/2 animate-pulse rounded bg-white/10" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
          <span className="sr-only">Loading zmanim…</span>
        </div>
      ) : status === 'ready' && data && view ? (
        <>
          <p className="mt-3 text-[15px] font-semibold text-gold">{view.name}</p>
          {view.next && (
            <>
              <p className="mt-0.5 text-[38px] font-extrabold leading-tight tracking-tight tabular-nums" data-testid="shabbos-next">
                {view.next.label} <span>{view.next.time}</span>
              </p>
              <p className="text-sm text-slate-300">{soon ? `${soon} · ${view.next.when}` : view.next.when}</p>
            </>
          )}
          {view.also.map((t: CardTime) => (
            <p key={t.label} className="mt-2 flex items-baseline justify-between gap-3 border-t border-white/10 pt-2 text-sm text-slate-200">
              <span>
                {t.label} {t.when}
              </span>
              <span className="font-semibold tabular-nums text-white">{t.time}</span>
            </p>
          ))}
          <p className="mt-3 text-xs text-slate-400">
            {data.hebrewDate} · {locationLabel}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {actions.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className="flex-1 whitespace-nowrap rounded-lg bg-white/10 px-3 py-2 text-center text-[13px] font-semibold text-white transition-colors hover:bg-white/20"
              >
                {a.label}
              </Link>
            ))}
          </div>
          {/* Same credit as the real Zmanim & Shabbos page (ZmanimBody): this
              card shows the same Hebcal-sourced data. */}
          <p className="mt-3 text-[11px] text-slate-400">
            Zmanim from{' '}
            <a href="https://www.hebcal.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">
              Hebcal.com
            </a>
          </p>
        </>
      ) : (
        <p className="mt-3 text-[13px] text-slate-300">Zmanim are unavailable right now. Please try again in a moment.</p>
      )}
    </div>
  )
}
