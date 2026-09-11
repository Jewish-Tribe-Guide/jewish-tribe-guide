'use client'

import { useZmanim } from '@/lib/useZmanim'

// ── Shabbat & Holiday Times — candle lighting and havdalah, plus the next
// Yom Tov when there is one. ────────────────────────────────────────────────
//
// Used to be the full daily Zmanim (sunrise, latest Shema, latest Shacharis,
// sunset, nightfall) plus these two — five rows nobody asked about, next to
// the two anyone actually checks this card for. Trimmed to just candle
// lighting/havdalah on the reasoning that a card meant to be glanced at
// shouldn't need to be read.
//
// The regular two rows show every day of the week — see the render's own
// comment on why the `&&` guards below aren't a real "sometimes missing"
// case — but only one gets the amber highlight, and only on the day it
// actually applies (Friday for candle lighting, Saturday for havdalah). The
// rest of the week both render in a plain, equally-weighted style: candle
// lighting and havdalah are both worth knowing on, say, a Tuesday, but
// neither is "happening imminently" the way the highlight used to claim
// every day.
//
// `data.holidayPeriod` (see lib/zmanim.ts's own doc on how far ahead it
// looks and how it's grouped) replaces those two rows entirely rather than
// sitting alongside them, whenever there's an upcoming Yom Tov within the
// window. The reason isn't just tidiness: on a week like Rosh Hashana,
// Hebcal's own feed doesn't produce a plain "Friday candle lighting" AND a
// separate holiday block — the holiday's own candle lighting IS that
// Friday's. Showing both would repeat the identical fact in identical
// words, one row apart.
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

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
        {status === 'ready' && data ? data.hebrewDate : 'Today'} · {locationLabel}
      </p>
      <h3 className="mb-4 text-lg font-semibold text-slate-900">{heading}</h3>

      {status === 'loading' ? (
        <div className="space-y-2" aria-live="polite" aria-busy="true">
          <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
          <span className="sr-only">Loading zmanim…</span>
        </div>
      ) : status === 'ready' && data ? (
        <>
          {data.holidayPeriod ? (
            <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2.5">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700">
                {data.holidayPeriod.name}
              </p>
              <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[13px] font-semibold text-slate-800">
                <span>Begins {data.holidayPeriod.begins.label}</span>
                <span className="tabular-nums text-slate-900">{data.holidayPeriod.begins.time}</span>
              </div>
              <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[13px] font-semibold text-slate-800">
                <span>Ends {data.holidayPeriod.ends.label}</span>
                <span className="tabular-nums text-slate-900">{data.holidayPeriod.ends.time}</span>
              </div>
            </div>
          ) : (
            // Both rows always show — Hebcal's own /shabbat response always
            // carries the upcoming Shabbos's candle lighting AND the
            // following havdalah together, every day of the week, so the
            // `&&` guards below are type-narrowing, not a real "sometimes
            // missing" case. What used to vary was styling: both rows always
            // got the amber highlight regardless of the day, which read as
            // "both of these are happening imminently" on a Tuesday just as
            // loudly as on the Friday it's actually true. Highlighted now
            // only on the day it applies — `isFriday` for candle lighting,
            // `isShabbos` for havdalah — with a plain row the rest of the
            // week. Never hides the other row: the point is always knowing
            // both times, just not being told twice a week that "right now"
            // is imminent when it isn't.
            <div className="space-y-1.5">
              {data.shabbos.candleLighting && (
                <div
                  className={`flex items-baseline justify-between gap-3 rounded-lg px-3 py-1.5 ${
                    data.isFriday ? 'bg-amber-50' : 'bg-slate-50'
                  }`}
                >
                  <span className={`text-[13px] font-semibold ${data.isFriday ? 'text-amber-800' : 'text-slate-700'}`}>
                    Candles {data.shabbos.candleLighting.label}
                  </span>
                  <span className={`text-[13px] font-semibold tabular-nums ${data.isFriday ? 'text-amber-800' : 'text-slate-700'}`}>
                    {data.shabbos.candleLighting.time}
                  </span>
                </div>
              )}
              {data.shabbos.havdalah && (
                <div
                  className={`flex items-baseline justify-between gap-3 rounded-lg px-3 py-1.5 ${
                    data.isShabbos ? 'bg-amber-50' : 'bg-slate-50'
                  }`}
                >
                  <span className={`text-[13px] font-semibold ${data.isShabbos ? 'text-amber-800' : 'text-slate-700'}`}>
                    Havdalah {data.shabbos.havdalah.label}
                  </span>
                  <span className={`text-[13px] font-semibold tabular-nums ${data.isShabbos ? 'text-amber-800' : 'text-slate-700'}`}>
                    {data.shabbos.havdalah.time}
                  </span>
                </div>
              )}
            </div>
          )}
          {/* Upcoming Fast — a separate box, not a replacement for the block
              above: unlike a Yom Tov, a fast has no candle lighting and can
              land on an ordinary weekday, so nothing else on this card would
              otherwise announce it. Both can and do show at once — e.g. Tzom
              Gedaliah lands in Rosh Hashana's own week. `ends` is nullable
              (see lib/zmanim.ts's findFastPeriod on Ta'anit Bechorot, ended
              early by a siyum rather than a published zman). */}
          {data.fastPeriod && (
            <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2.5">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700">
                {data.fastPeriod.name}
              </p>
              <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[13px] font-semibold text-slate-800">
                <span>Fast begins {data.fastPeriod.begins.label}</span>
                <span className="tabular-nums text-slate-900">{data.fastPeriod.begins.time}</span>
              </div>
              {data.fastPeriod.ends && (
                <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[13px] font-semibold text-slate-800">
                  <span>Fast ends {data.fastPeriod.ends.label}</span>
                  <span className="tabular-nums text-slate-900">{data.fastPeriod.ends.time}</span>
                </div>
              )}
            </div>
          )}
          {/* Same attribution/link as the real Zmanim & Shabbos page
              (ZmanimBody) — this card shows the same Hebcal-sourced data, so
              it carries the same credit. */}
          <p className="pt-3 text-[11px] text-muted">
            Zmanim from{' '}
            <a href="https://www.hebcal.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">
              Hebcal.com
            </a>
          </p>
        </>
      ) : (
        <p className="text-[13px] text-muted">Zmanim are unavailable right now. Please try again in a moment.</p>
      )}
    </div>
  )
}
