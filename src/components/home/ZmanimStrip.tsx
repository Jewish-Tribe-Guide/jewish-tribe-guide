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
// trailing under a heading. No "Full Zmanim & Shabbos page" link out to that
// page — this already IS that page's full content, not a trimmed preview of
// it, so the link only ever led to a second copy of what's already showing.

export default function ZmanimStrip({
  coords,
  locationLabel,
  title = 'Zmanim & Shabbos',
}: {
  /** The visitor's address, or the community center — see Landing, which
   *  falls back so this never renders a "set your location" prompt. */
  coords: { lat: number; lng: number } | null
  /** Where these times are for — the visitor's address or the community
   *  region, same as the real Zmanim & Shabbos category page (FindResources'
   *  own `anchor.label || community.region`) — not the site's own name. */
  locationLabel: string
  /** The category's own (admin-editable) name. */
  title?: string
}) {
  const { data, status } = useZmanim(coords)

  return (
    <section className="mt-10">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-muted mt-0.5">{locationLabel}</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <ZmanimBody data={data} status={status} />
      </div>
    </section>
  )
}
