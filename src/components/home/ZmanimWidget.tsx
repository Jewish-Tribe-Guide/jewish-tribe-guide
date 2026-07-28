'use client'

import { useEffect, useState } from 'react'
import type { ZmanimData, ZmanEntry } from '@/types'
import { community } from '@/community.config'

type Status = 'loading' | 'error' | 'ready'

type Props = {
  /** The visitor's address when set; falls back to the community's configured
   *  center so the widget always has something to show without requiring an
   *  address (unlike the full Zmanim page, which prompts for one). */
  coords: { lat: number; lng: number } | null
  locationLabel: string
  title?: string
}

/** Bottom-of-page widget: the same content as the full Zmanim page (today's
 *  Hebrew date, every daily zman, and the upcoming Shabbos candle-lighting/
 *  Havdalah) — just without the page's own heading/back-button chrome. */
export default function ZmanimWidget({ coords, locationLabel, title = 'Zmanim & Shabbos' }: Props) {
  const [data, setData] = useState<ZmanimData | null>(null)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    let cancelled = false
    const c = coords ?? community.mapCenter
    const url = `/api/zmanim?lat=${c.lat}&lng=${c.lng}&tzid=${encodeURIComponent(community.timezone)}`

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
  }, [coords?.lat, coords?.lng])

  return (
    // No card chrome (border/background/padding) of its own anymore — the
    // Zmanim band it's rendered inside (see Landing.tsx) IS the widget's
    // designated area now, `#fefefe` itself, so this just flows directly in
    // that existing bar instead of floating a separate box on top of it.
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        <span className="text-xs text-muted">{coords ? locationLabel : community.region}</span>
      </div>

      {status === 'loading' && (
        <div className="animate-pulse space-y-3">
          <div className="h-3 w-32 bg-slate-200" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-4 bg-slate-100" />
            ))}
          </div>
        </div>
      )}
      {status === 'error' && (
        <p className="text-sm text-muted">Zmanim are unavailable right now.</p>
      )}
      {status === 'ready' && data && <ReadyState data={data} />}
    </div>
  )
}

function ReadyState({ data }: { data: ZmanimData }) {
  const { hebrewDate, dailyZmanim, shabbos, isFriday, isShabbos } = data

  return (
    <div className="space-y-4">
      {/* Hebrew date */}
      <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
        <span className="text-2xl" aria-hidden="true">🕯️</span>
        <p className="text-base font-semibold text-slate-900">{hebrewDate}</p>
      </div>

      {/* Daily zmanim — every entry, same as the full Zmanim page. */}
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
          <ShabbosRow label="Candle Lighting" entry={shabbos.candleLighting} emphasized={isFriday} />
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
      <div className="rounded-lg flex items-baseline justify-between gap-3 bg-[#3a86ff] px-3 py-1.5 -mx-1">
        <span className="text-sm font-semibold text-[#fefefe]">{label}</span>
        <span className="text-sm font-semibold text-[#fefefe] tabular-nums">{value}</span>
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
