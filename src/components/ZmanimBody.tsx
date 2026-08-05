'use client'

import type { ZmanimData, ZmanEntry } from '@/types'
import type { ZmanimStatus } from '@/lib/useZmanim'

// ── The zmanim content itself — Hebrew date, the daily zmanim grid, and
// upcoming Shabbos — shared by the full Zmanim & Shabbos page (ZmanimCard,
// which wraps this in a bordered card) and the desktop home screen's zmanim
// section (which renders it loose, full-bleed, like the footer). Keeping the
// rendering in one place means the two can never drift on what a "ready"
// zmanim view actually shows.

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
  const { hebrewDate, dailyZmanim, shabbos, isFriday, isShabbos } = data

  return (
    <div className="space-y-4">
      {/* Hebrew date */}
      <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
        <span className="text-3xl" aria-hidden="true">🕯️</span>
        <p className="text-base font-semibold text-slate-900">{hebrewDate}</p>
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

      {/* Upcoming Shabbos */}
      <div className="pt-3 border-t border-slate-100">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
          Upcoming Shabbos
        </h4>
        <div className="space-y-1.5">
          <ShabbosRow
            label="Candle Lighting"
            entry={shabbos.candleLighting}
            emphasized={isFriday}
          />
          <ShabbosRow label="Havdalah" entry={shabbos.havdalah} emphasized={isShabbos} />
        </div>
      </div>

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

  const value = `${entry.label} ${entry.time}`

  if (emphasized) {
    return (
      <div className="flex items-baseline justify-between gap-3 rounded-lg bg-primary/10 px-3 py-1.5 -mx-1">
        <span className="text-sm font-semibold text-primary">{label}</span>
        <span className="text-sm font-semibold text-primary tabular-nums">{value}</span>
      </div>
    )
  }

  return (
    <div className="flex items-baseline justify-between gap-3 px-3 -mx-1">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm font-medium text-slate-900 tabular-nums">{value}</span>
    </div>
  )
}
