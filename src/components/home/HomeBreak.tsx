'use client'

import { useZmanim } from '@/lib/useZmanim'
import { useCommunitySlug } from '@/lib/communityContext'
import { routes } from '@/lib/routes'

// ── The quiet break between the two main things (Browse everything, Explore
// the map) — not a third peer section. Deliberately no <h2>: every other
// section on this page (Browse everything, Explore the map, the old Popular
// right now) used the exact same heading treatment, which flattened
// everything to equal importance and made even a decorative pause read as
// "another list to process." Small type, a soft tint instead of a bordered
// card, and it carries two things at once — Zmanim (trimmed to today's
// sunset + this week's Shabbos, not the full daily grid ZmanimStrip/the real
// Zmanim & Shabbos page show) and one line on who actually keeps this site
// current — so neither needs its own full section either.
//
// Replaces ZmanimStrip, which only ever rendered here and is now deleted.
// The full daily zmanim grid (ZmanimBody, in its own headed card) is
// unchanged on the real Zmanim & Shabbos category page — that page never
// used ZmanimStrip to begin with, it shares ZmanimBody directly.
export default function HomeBreak({
  coords,
  locationLabel,
}: {
  /** The visitor's address, or the community center — see Landing, which
   *  falls back so this never renders a "set your location" prompt. */
  coords: { lat: number; lng: number } | null
  locationLabel: string
}) {
  const { data, status } = useZmanim(coords)
  const community = useCommunitySlug()
  const sunset = data?.dailyZmanim.find((z) => z.label === 'Sunset')

  return (
    <div className="my-12 flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-amber-50/70 px-7 py-5">
      <div className="flex flex-wrap items-center gap-6">
        {status === 'loading' ? (
          <div className="h-4 w-64 animate-pulse rounded bg-amber-900/10" aria-hidden="true" />
        ) : status === 'ready' && data ? (
          <>
            <span className="whitespace-nowrap text-xs font-medium text-slate-500">
              {data.hebrewDate} · {locationLabel}
            </span>
            {sunset && (
              <span className="text-xs">
                <span className="text-slate-500">Sunset</span>{' '}
                <span className="font-semibold tabular-nums text-amber-800">{sunset.time}</span>
              </span>
            )}
            {data.shabbos.candleLighting && (
              <span className="text-xs">
                <span className="text-slate-500">Candles {data.shabbos.candleLighting.label}</span>{' '}
                <span className="font-semibold tabular-nums text-amber-800">{data.shabbos.candleLighting.time}</span>
              </span>
            )}
            {data.shabbos.havdalah && (
              <span className="text-xs">
                <span className="text-slate-500">Havdalah {data.shabbos.havdalah.label}</span>{' '}
                <span className="font-semibold tabular-nums text-amber-800">{data.shabbos.havdalah.time}</span>
              </span>
            )}
          </>
        ) : null}
      </div>
      <p className="max-w-sm text-xs text-slate-500">
        Kept current by the community — a few admin volunteers, but mostly people like you.{' '}
        <a href={routes.feedback(community)} className="font-semibold text-amber-800 hover:underline">
          Suggest something →
        </a>
      </p>
    </div>
  )
}
