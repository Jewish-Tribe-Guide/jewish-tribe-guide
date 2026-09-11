'use client'

import type { ZmanimData, ZmanEntry } from '@/types'
import type { ZmanimStatus } from '@/lib/useZmanim'

// ── The zmanim content itself — Hebrew date, the daily zmanim grid, and
// upcoming Shabbos — shared by the full Zmanim & Shabbos page (ZmanimCard)
// and the desktop home screen's zmanim section (ZmanimStrip), both of which
// wrap this in the same bordered card. Keeping the rendering in one place
// means the two can never drift on what a "ready" zmanim view actually shows.

export default function ZmanimBody({ data, status }: { data: ZmanimData | null; status: ZmanimStatus }) {
  if (status === 'loading') return <LoadingState />
  if (status === 'no-location') return <NoLocationState />
  if (status === 'error') return <ErrorState />
  if (status === 'ready' && data) return <ReadyState data={data} />
  return null
}

function LoadingState() {
  return (
    <div className="animate-pulse space-y-3" aria-live="polite" aria-busy="true">
      <div className="h-3 w-32 rounded bg-slate-200" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-4 rounded bg-slate-100" />
        ))}
      </div>
      <div className="h-3 w-28 rounded bg-slate-200 mt-2" />
      <div className="h-4 w-48 rounded bg-slate-100" />
      <span className="sr-only">Loading zmanim…</span>
    </div>
  )
}

function NoLocationState() {
  return (
    <button
      onClick={() => document.dispatchEvent(new CustomEvent('jpc:open-location'))}
      className="text-sm text-primary underline-offset-2 hover:underline cursor-pointer"
    >
      Enter your address to see zmanim for your location.
    </button>
  )
}

function ErrorState() {
  return (
    <p className="text-sm text-muted">
      Zmanim are unavailable right now. Please try again in a moment.
    </p>
  )
}

function ReadyState({ data }: { data: ZmanimData }) {
  const { hebrewDate, dailyZmanim, shabbos, isFriday, isShabbos, holidays, holidayPeriod, fastPeriod } = data

  // Today's own Jewish-calendar events (Rosh Chodesh, or a Yom Tov day
  // itself) — separate from `holidayPeriod` below, which is the NEXT
  // upcoming Yom Tov, not necessarily today. A visitor loading this page on
  // the holiday itself was previously shown nothing to say so; this page's
  // `holidays` field has carried the data since it was added, just never
  // rendered anywhere.
  const todayHolidays = holidays ?? []

  return (
    <div className="space-y-4">
      {/* Hebrew date */}
      <div className="pb-3 border-b border-slate-100">
        <p className="text-base font-semibold text-slate-900">{hebrewDate}</p>
        {todayHolidays.length > 0 && (
          <p className="text-sm font-medium text-primary">{todayHolidays.join(' · ')}</p>
        )}
      </div>

      {/* Daily zmanim */}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
        {dailyZmanim.map((z) => (
          <div key={z.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-sm text-muted">{z.label}</dt>
            <dd className="text-sm font-medium text-slate-900 tabular-nums">{z.time}</dd>
          </div>
        ))}
      </dl>

      {/* Upcoming Shabbos — replaced entirely by the upcoming Yom Tov period
          when there is one within the lookahead window, same reasoning as
          ShabbatTimesCard (the home screen's own version of this section):
          on a week like Rosh Hashana, Hebcal's own feed doesn't produce a
          plain "Friday candle lighting" AND a separate holiday block — the
          holiday's own candle lighting IS that Friday's, so showing both
          would repeat the identical fact in identical words. */}
      <div className="pt-3 border-t border-slate-100">
        {/* h3, not h4: both callers (ZmanimCard, ZmanimStrip) put this under
            their own h2 section heading — h4 skipped a level. Purely
            semantic; the size/weight come entirely from the className
            below, not the tag, so this has no visual effect. */}
        {holidayPeriod ? (
          <>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
              {holidayPeriod.name}
            </h3>
            <div className="space-y-1.5">
              {/* One row per candle lighting, not just the first — a 2-day
                  Yom Tov (Rosh Hashana; Sukkot/Pesach/Shavuot's opening and
                  closing) lights again the second night at its own later
                  time, and the row's own date (see ShabbosRow) is what
                  distinguishes which night is which without needing a
                  "Night 1"/"Night 2" label. */}
              {holidayPeriod.candleLightings.map((entry, i) => (
                <ShabbosRow key={entry.iso ?? i} label="Candles" entry={entry} emphasized={i === 0} />
              ))}
              <ShabbosRow label="Ends" entry={holidayPeriod.ends} emphasized={false} />
            </div>
          </>
        ) : (
          <>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
              Upcoming Shabbos
            </h3>
            <div className="space-y-1.5">
              <ShabbosRow
                label="Candle Lighting"
                entry={shabbos.candleLighting}
                emphasized={isFriday}
              />
              <ShabbosRow label="Havdalah" entry={shabbos.havdalah} emphasized={isShabbos} />
            </div>
          </>
        )}
      </div>

      {/* Upcoming Fast — a separate section from the one above, not a
          replacement for it: a fast is a different kind of day than a Yom
          Tov (no candle lighting, and it can land on an ordinary weekday
          with nothing else on this page announcing it), so both can and do
          show at once — e.g. Tzom Gedaliah lands right in Rosh Hashana's own
          week. `ends` is nullable (see lib/zmanim.ts's findFastPeriod on
          Ta'anit Bechorot); ShabbosRow already renders nothing for a null
          entry, so this doesn't need its own conditional for that. */}
      {fastPeriod && (
        <div className="pt-3 border-t border-slate-100">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
            {fastPeriod.name}
          </h3>
          <div className="space-y-1.5">
            <ShabbosRow label="Fast Begins" entry={fastPeriod.begins} emphasized />
            <ShabbosRow label="Fast Ends" entry={fastPeriod.ends} emphasized={false} />
          </div>
        </div>
      )}

      <p className="pt-1 text-[11px] text-muted">
        Zmanim from{' '}
        <a
          href="https://www.hebcal.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-primary"
        >
          Hebcal.com
        </a>
      </p>
    </div>
  )
}

function ShabbosRow({
  label,
  entry,
  emphasized,
}: {
  label: string
  entry: ZmanEntry | null
  emphasized: boolean
}) {
  if (!entry) return null

  // The date/weekday sits next to the row's own label, time alone on the
  // right — matching ShabbatTimesCard (the home screen's version of this
  // same content), which has always split it this way. This used to
  // combine `entry.label` into the time-column value instead ("Begins" |
  // "Fri, Sep 11 6:57 PM"), which read differently from the other card
  // showing the identical Hebcal data.
  const rowLabel = `${label} ${entry.label}`

  if (emphasized) {
    return (
      <div className="flex items-baseline justify-between gap-3 rounded-lg bg-primary/10 px-3 py-1.5 -mx-1">
        <span className="text-sm font-semibold text-primary">{rowLabel}</span>
        <span className="text-sm font-semibold text-primary tabular-nums">{entry.time}</span>
      </div>
    )
  }

  return (
    <div className="flex items-baseline justify-between gap-3 px-3 -mx-1">
      <span className="text-sm text-muted">{rowLabel}</span>
      <span className="text-sm font-medium text-slate-900 tabular-nums">{entry.time}</span>
    </div>
  )
}
