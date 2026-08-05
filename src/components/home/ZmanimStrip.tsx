'use client'

import ZmanimBody from '@/components/ZmanimBody'
import { useZmanim } from '@/lib/useZmanim'

// ── The desktop home screen's zmanim section ────────────────────────────────
// Full content (Hebrew date, the whole daily zmanim grid, upcoming Shabbos) —
// not a trimmed-down preview. Rendered loose as a full-bleed band, the same
// border-t/bg treatment as the footer right below it, rather than another
// boxed card competing with the featured cards and map above it. Reads as the
// page easing into its closing section, not one more tile in the stack.

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
    <section className="mt-16 border-t border-slate-200/80 bg-white/60">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
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

        <ZmanimBody data={data} status={status} />
      </div>
    </section>
  )
}
