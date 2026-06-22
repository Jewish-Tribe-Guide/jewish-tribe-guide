'use client'

import { useEffect, useState } from 'react'
import type { ZmanimData, ZmanEntry } from '@/types'
import UpButton from '@/components/UpButton'

type Status = 'loading' | 'no-location' | 'error' | 'ready'

type Props = {
  /** Patient mode: fetch by hospital id. */
  hospitalId?: string
  /** Community/address mode: fetch by raw coordinates. When provided, hospitalId
   *  is ignored. The timezone defaults to America/New_York (Philadelphia). */
  coords?: { lat: number; lng: number } | null
  /** Subtitle shown under the heading. Patient mode → hospital name.
   *  Community mode → the visitor's typed address. */
  locationLabel: string
  onUp: () => void
}

export default function ZmanimCard({ hospitalId, coords, locationLabel, onUp }: Props) {
  const [data, setData] = useState<ZmanimData | null>(null)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    let cancelled = false

    // Build the query string: prefer raw coords (address mode) over hospitalId.
    let url: string
    if (coords?.lat != null && coords?.lng != null) {
      url = `/api/zmanim?lat=${coords.lat}&lng=${coords.lng}&tzid=America%2FNew_York`
    } else if (hospitalId) {
      url = `/api/zmanim?hospitalId=${encodeURIComponent(hospitalId)}`
    } else {
      // No location provided — show a clear explanation rather than a generic error
      setStatus('no-location')
      return
    }

    fetch(url)
      .then((res) => res.json())
      .then((json: { ok: boolean; data?: ZmanimData }) => {
        if (cancelled) return
        if (json.ok && json.data) {
          setData(json.data)
          setStatus('ready')
        } else {
          setStatus('error')
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [hospitalId, coords?.lat, coords?.lng])

  return (
    <div>
      <UpButton label="All resources" onClick={onUp} />

      {/* Heading */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-800">Zmanim &amp; Shabbos</h2>
        <p className="text-sm text-muted mt-0.5">{locationLabel}</p>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        {status === 'loading' && <LoadingState />}
        {status === 'no-location' && <NoLocationState />}
        {status === 'error' && <ErrorState />}
        {status === 'ready' && data && <ReadyState data={data} />}
      </section>
    </div>
  )
}

// ── States ────────────────────────────────────────────────────────────────────

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
