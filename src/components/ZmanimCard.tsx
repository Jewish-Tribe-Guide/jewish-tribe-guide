'use client'

import { useEffect, useState } from 'react'
import type { ZmanimData, ZmanEntry } from '@/types'

type Status = 'loading' | 'error' | 'ready'

type Props = {
  hospitalId: string
  hospitalName: string
  onBack: () => void
}

export default function ZmanimCard({ hospitalId, hospitalName, onBack }: Props) {
  const [data, setData] = useState<ZmanimData | null>(null)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    let cancelled = false

    fetch(`/api/zmanim?hospitalId=${encodeURIComponent(hospitalId)}`)
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
  }, [hospitalId])

  return (
    <div>
      {/* Back to index */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted hover:text-slate-700 mb-4 cursor-pointer transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      {/* Heading */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-800">Zmanim &amp; Shabbos</h2>
        <p className="text-sm text-muted mt-0.5">{hospitalName}</p>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        {status === 'loading' && <LoadingState />}
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
