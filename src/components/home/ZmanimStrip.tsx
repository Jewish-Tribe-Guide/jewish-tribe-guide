'use client'

import { useZmanim } from '@/lib/useZmanim'

// ── The desktop home screen's "this week" line ────────────────────────────────
// Deliberately NOT a card: it sits loose between the map and the footer as a
// quiet band of the page, not another tile competing with the featured cards
// above it. Shows only the three things worth an at-a-glance read — parsha,
// candle lighting, Shabbos ends — with the full zmanim table one click away.
//
// Renders nothing at all rather than an error/skeleton box when there's
// nothing useful to say (still loading, the API failed, or the community
// isn't near enough to Shabbos for candle times to have been returned): an
// empty state here would just be a dead strip above the footer, and unlike
// the Zmanim page itself nobody navigated here specifically to see it.

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-[15px] font-semibold text-slate-900">{value}</span>
    </div>
  )
}

export default function ZmanimStrip({
  coords,
  locationLabel,
  onOpenZmanim,
}: {
  /** The visitor's address, or the community center — see Landing, which
   *  falls back so this never renders a "set your location" prompt. */
  coords: { lat: number; lng: number } | null
  /** Where these times are for — the visitor's address or the community name. */
  locationLabel: string
  /** Opens the full Zmanim & Shabbos page. Omitted when that category isn't
   *  configured, which also drops the trailing link. */
  onOpenZmanim?: () => void
}) {
  const { data, status } = useZmanim(coords)

  const candles = data?.shabbos.candleLighting
  const havdalah = data?.shabbos.havdalah
  // Nothing worth a whole band of the page — see the note above.
  if (status !== 'ready' || !data || (!data.parsha && !candles && !havdalah)) return null

  return (
    <section className="mt-14 border-t border-slate-200 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-6">
          {data.parsha && <Item label="This week" value={data.parsha} />}
          {candles && <Item label={`Candle lighting · ${candles.label}`} value={candles.time} />}
          {havdalah && <Item label={`Shabbos ends · ${havdalah.label}`} value={havdalah.time} />}
        </div>
        <div className="flex flex-col items-start gap-1">
          <span className="text-[13px] text-slate-400">{locationLabel}</span>
          {onOpenZmanim && (
            <button
              onClick={onOpenZmanim}
              className="text-[13px] font-medium text-primary underline-offset-2 hover:underline cursor-pointer"
            >
              All zmanim →
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
