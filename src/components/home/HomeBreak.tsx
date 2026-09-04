'use client'

import { useZmanim } from '@/lib/useZmanim'
import { useCommunitySlug } from '@/lib/communityContext'
import { routes } from '@/lib/routes'

// ── The break between the two main things (Browse everything, Explore the
// map) — two side-by-side cards, the full daily Zmanim on the left and the
// "kept by the community" message on the right. Went through a few lighter
// treatments first (a single unheaded strip, stacked bands) before landing
// here — see the memory/decision history if reviving one of those. This is
// deliberately the same card language (border, rounded-2xl) as Browse
// everything and the map below it, just two smaller cards rather than one
// full-width one, so it still reads as a distinct pair rather than a third
// full-width peer section.
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

  return (
    <div className="my-12 grid grid-cols-2 gap-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
          {status === 'ready' && data ? data.hebrewDate : 'Today'} · {locationLabel}
        </p>
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Zmanim & Shabbos</h3>

        {status === 'loading' ? (
          <div className="space-y-2" aria-live="polite" aria-busy="true">
            <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
            <span className="sr-only">Loading zmanim…</span>
          </div>
        ) : status === 'ready' && data ? (
          <>
            <dl className="grid grid-cols-2 gap-x-5 gap-y-1.5">
              {data.dailyZmanim.map((z) => (
                <div key={z.label} className="flex items-baseline justify-between gap-3 border-b border-dashed border-slate-100 py-1">
                  <dt className="text-[13px] text-muted">{z.label}</dt>
                  <dd className="text-[13px] font-semibold tabular-nums text-slate-900">{z.time}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 space-y-1.5">
              {data.shabbos.candleLighting && (
                <div className="flex items-baseline justify-between gap-3 rounded-lg bg-amber-50 px-3 py-1.5">
                  <span className="text-[13px] font-semibold text-amber-800">Candles {data.shabbos.candleLighting.label}</span>
                  <span className="text-[13px] font-semibold tabular-nums text-amber-800">{data.shabbos.candleLighting.time}</span>
                </div>
              )}
              {data.shabbos.havdalah && (
                <div className="flex items-baseline justify-between gap-3 rounded-lg bg-amber-50 px-3 py-1.5">
                  <span className="text-[13px] font-semibold text-amber-800">Havdalah {data.shabbos.havdalah.label}</span>
                  <span className="text-[13px] font-semibold tabular-nums text-amber-800">{data.shabbos.havdalah.time}</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="text-[13px] text-muted">Zmanim are unavailable right now. Please try again in a moment.</p>
        )}
      </div>

      <div className="flex flex-col justify-center rounded-2xl border border-slate-200 bg-white p-6">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">Community run</p>
        <h3 className="mb-3 text-lg font-semibold text-slate-900">Kept current by people like you</h3>
        <p className="mb-5 text-[13.5px] leading-relaxed text-muted">
          A few admin volunteers keep the lights on, but every listing, correction, and update mostly comes
          from the community that actually uses this guide.
        </p>
        <a
          href={routes.feedback(community)}
          className="inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-800"
        >
          Suggest something →
        </a>
      </div>
    </div>
  )
}
