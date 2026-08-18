'use client'

import ZmanimBody from '@/components/ZmanimBody'
import { useZmanim } from '@/lib/useZmanim'

// ── The desktop home screen's zmanim section ────────────────────────────────
// Full content (Hebrew date, the whole daily zmanim grid, upcoming Shabbos) —
// not a trimmed-down preview. Contained to the same width as the category
// grid and map above it, and wrapped in the same bordered card ZmanimCard
// (the full Zmanim & Shabbos page) already uses for this exact content, so
// it reads as a defined section of the page — the heading names the topic,
// the card below is that topic's content — instead of loose content
// trailing under a heading.

export default function ZmanimStrip({
  coords,
  locationLabel,
  title = 'Zmanim & Shabbos',
  onOpenZmanim,
}: {
  /** The visitor's address, or the community center — see Landing, which
   *  falls back so this never renders a "set your location" prompt. */
  coords: { lat: number; lng: number } | null
  /** Where these times are for — the visitor's address or the community name. */
  locationLabel: string
  /** The category's own (admin-editable) name. */
  title?: string
  /** Opens the full Zmanim & Shabbos page. Omitted when that category isn't
   *  configured, which also drops the trailing link. */
  onOpenZmanim?: () => void
}) {
  const { data, status } = useZmanim(coords)

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 mb-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-muted mt-0.5">{locationLabel}</p>
        </div>
        {onOpenZmanim && (
          <button
            onClick={onOpenZmanim}
            className="text-sm font-medium text-primary underline-offset-2 hover:underline cursor-pointer"
          >
            Full Zmanim & Shabbos page →
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <ZmanimBody data={data} status={status} />
      </div>
    </section>
  )
}
