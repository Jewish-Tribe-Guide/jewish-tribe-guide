'use client'

import { useEffect, useState } from 'react'
import type { ZmanimData, ZmanEntry } from '@/types'
import { community } from '@/community.config'

type Status = 'loading' | 'error' | 'ready'

// "5:32 AM" / "12:15 PM" (see `formatTime` in lib/zmanim.ts, which is what
// produces every `ZmanEntry.time` string) -> minutes since midnight, so it
// can be compared against the current wall-clock time. Returns `null` for
// anything that doesn't match (defensive — callers should always skip
// highlighting rather than guess on a malformed string).
function parseTimeToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time.trim())
  if (!match) return null
  let hours = Number(match[1]) % 12
  if (/pm/i.test(match[3])) hours += 12
  return hours * 60 + Number(match[2])
}

// Re-render once a minute so the "next upcoming zman" highlight (see
// `ReadyState` below) actually advances as the day goes on, instead of
// freezing at whatever was true when the page first loaded.
function useNowMinutes(): number {
  const [minutes, setMinutes] = useState(() => {
    const now = new Date()
    return now.getHours() * 60 + now.getMinutes()
  })
  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date()
      setMinutes(now.getHours() * 60 + now.getMinutes())
    }, 60_000)
    return () => clearInterval(id)
  }, [])
  return minutes
}

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
    // designated area now, `#e4edfa` itself, so this just flows directly in
    // that existing bar instead of floating a separate box on top of it.
    <div>
      {/* Centered now (was a `flex justify-between` row, title left/
          location right) — on request, matching "Get Connected"'s own
          centered heading treatment. Title and location stack instead of
          sitting side by side. */}
      <div className="mb-2 text-center">
        {/* Bumped from a small `text-sm` uppercase eyebrow label up to a
            real major-section heading (`text-3xl`, same as "Get Connected"
            and the hero h1) — on request, so this reads as one of the
            site's three main section titles instead of a compact widget
            label. Sans-serif now (the separate serif headline face was
            removed entirely, weight carries hierarchy instead) —
            `font-semibold` (600, was `font-extrabold`/800), at `text-3xl`
            (30px, within the specified ~28-32px section-header range). */}
        <h3 className="text-3xl font-semibold tracking-tight text-[#1C1B19] [font-variant:small-caps]">
          {title}
        </h3>
        <p className="mt-0.5 text-xs text-[#1C1B19]">{coords ? locationLabel : community.region}</p>
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
        <p className="text-sm text-[#1C1B19]">Zmanim are unavailable right now.</p>
      )}
      {status === 'ready' && data && <ReadyState data={data} />}
    </div>
  )
}

function ReadyState({ data }: { data: ZmanimData }) {
  const { hebrewDate, dailyZmanim, shabbos, isFriday, isShabbos } = data
  const nowMinutes = useNowMinutes()
  // The first entry that hasn't happened yet today — "next upcoming zman".
  // `-1` (nothing highlighted) once every zman for today has already
  // passed, rather than guessing/wrapping to tomorrow's.
  const nextIndex = dailyZmanim.findIndex((z) => {
    const mins = parseTimeToMinutes(z.time)
    return mins !== null && mins >= nowMinutes
  })

  return (
    <div className="space-y-3">
      {/* Hebrew date */}
      <div className="pb-2 border-b border-slate-100">
        <p className="text-sm font-semibold text-[#1C1B19]">{hebrewDate}</p>
      </div>

      {/* Daily zmanim — every entry, same as the full Zmanim page. The next
          upcoming one (see `nextIndex` above) gets a small teal dot, bolder
          label weight, and a faint teal row tint — on request, so the
          table reads as live/dynamic rather than a flat static list. */}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
        {dailyZmanim.map((z, i) => {
          const isNext = i === nextIndex
          return (
            <div
              key={z.label}
              className={`flex items-baseline justify-between gap-3 rounded px-1.5 py-0.5 -mx-1.5 ${isNext ? 'bg-[#8FC6CF]/15' : ''}`}
            >
              <dt className={`flex items-center gap-1.5 text-sm ${isNext ? 'font-semibold text-[#1C1B19]' : 'text-[#1C1B19]'}`}>
                {isNext && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#5C8A8C]" />}
                {z.label}
              </dt>
              <dd className={`text-sm tabular-nums ${isNext ? 'font-bold text-[#1C1B19]' : 'font-medium text-[#1C1B19]'}`}>{z.time}</dd>
            </div>
          )
        })}
      </dl>

      {/* Upcoming Shabbos */}
      <div className="pt-2 border-t border-slate-100">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[#1C1B19] mb-1.5">
          Upcoming Shabbos
        </h4>
        <div className="space-y-1.5">
          <ShabbosRow label="Candle Lighting" entry={shabbos.candleLighting} emphasized={isFriday} />
          <ShabbosRow label="Havdalah" entry={shabbos.havdalah} emphasized={isShabbos} />
        </div>
      </div>

      <p className="pt-1 text-[11px] text-[#1C1B19]">
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
      <span className="text-sm text-[#1C1B19]">{label}</span>
      <span className="text-sm font-medium text-[#1C1B19] tabular-nums">{value}</span>
    </div>
  )
}
