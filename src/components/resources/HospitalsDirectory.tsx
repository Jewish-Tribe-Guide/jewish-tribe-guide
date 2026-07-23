'use client'

import { useState } from 'react'
import { useHospitals } from '@/lib/useHospitals'
import type { DirectoryAnchor, HospitalInfo } from '@/types'
import { distanceMiles } from '@/lib/geo'
import UpButton from '@/components/UpButton'
import DirectoryHeader from './DirectoryHeader'
import { useLogSearchMiss } from '@/lib/useLogSearchMiss'

type Props = {
  anchor: DirectoryAnchor
  /** Open the About Your Hospital page for the chosen hospital. */
  onSelect: (hospitalId: string) => void
  onUp: () => void
  /** Open the map view (all resources, no category filter). */
  onViewMap?: () => void
}

// A short list of what a hospital offers, derived from its data — so each card
// previews what's inside instead of being a bare name + chevron.
function features(info?: HospitalInfo | null): string[] {
  if (!info) return []
  const f: string[] = []
  if (info.jewishChaplain) f.push('Chaplain')
  if (info.bikurCholim) f.push('Bikkur Cholim')
  if (info.prayerSpace) f.push('Prayer space')
  if (info.shabbatAccommodations) f.push('Kosher & Shabbos')
  return f
}

// Lists every hospital, sorted by distance from the visitor's address (when set),
// with a search box. Tapping one opens its Jewish-resources page. Framed as a
// question so it reads as a clear first step, not a database listing.
export default function HospitalsDirectory({ anchor, onSelect, onUp, onViewMap }: Props) {
  const [search, setSearch] = useState('')
  const hospitals = useHospitals() ?? []
  const coords = anchor.coords
  const label = anchor.label || null

  const withDistance = hospitals.map((h) => ({
    ...h,
    miles: coords ? distanceMiles(coords, { lat: h.latitude, lng: h.longitude }) : null,
  }))

  // A search box only earns its space once the list is long; with a handful of
  // hospitals it's just clutter, so show it only past a threshold.
  const showSearch = hospitals.length > 6
  const q = search.trim().toLowerCase()
  const filtered = withDistance
    .filter((h) => !q || h.name.toLowerCase().includes(q))
    .sort((a, b) => (a.miles != null && b.miles != null ? a.miles - b.miles : 0))

  useLogSearchMiss({
    query: search,
    hasResults: withDistance.some((h) => h.name.toLowerCase().includes(q)),
    ready: showSearch,
    source: 'Hospitals',
  })

  return (
    <div>
      <UpButton label="All resources" onClick={onUp} />

      <DirectoryHeader
        title="Which hospital?"
        anchorLabel={coords && label ? label : undefined}
        addressPrompt
      />
      {/* Description + Map sit on their own row here (not in the header's actions
          slot) because the explanatory copy is unique to this screen. */}
      <div className="flex items-center justify-between gap-4 mt-1 mb-5">
        <p className="text-sm text-muted">
          Pick where you are (or will be) to find its Jewish chaplain, bikkur cholim, prayer
          spaces, and kosher &amp; Shabbos support.
        </p>
        {onViewMap && (
          <button
            onClick={onViewMap}
            className="shrink-0 inline-flex items-center gap-1 text-sm font-medium text-slate-600 border border-slate-300 rounded-md px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            🗺️ Map
          </button>
        )}
      </div>

      {/* Search — only when the list is long enough to need it. */}
      {showSearch && (
        <div className="relative mb-5">
          <svg className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search hospitals…"
            aria-label="Search hospitals"
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm text-slate-900 placeholder:text-muted shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-muted text-sm">No hospitals match &ldquo;{search.trim()}&rdquo;.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((h, i) => {
            // The closest hospital, only when distances are known and it's a real winner.
            const isNearest = i === 0 && h.miles != null && (filtered[1]?.miles == null || filtered[1].miles > h.miles)
            return (
              <button
                key={h.id}
                onClick={() => onSelect(h.id)}
                className="group w-full text-left bg-white border border-slate-200 rounded-2xl shadow-sm px-4 py-4 flex items-start gap-4 hover:border-primary hover:shadow-md transition-all cursor-pointer sm:border-2 sm:border-slate-300"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <BuildingIcon className="h-6 w-6" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-slate-900 text-[15px] leading-tight">{h.name}</span>
                    {isNearest && (
                      <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold">
                        Nearest you
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {features(h.info).map((f) => (
                      <span key={f} className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-[11px] font-medium">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>

                <span className="flex flex-col items-end gap-2 shrink-0 pt-0.5">
                  {h.miles != null && (
                    <span className="text-xs font-medium text-slate-600 whitespace-nowrap">📍 {h.miles} mi</span>
                  )}
                  <svg className="w-5 h-5 text-slate-300 group-hover:text-primary group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V5a1 1 0 011-1h12a1 1 0 011 1v16" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 8h1m-1 4h1m4-4h1m-1 4h1M10 21v-3a1 1 0 011-1h2a1 1 0 011 1v3" />
    </svg>
  )
}
