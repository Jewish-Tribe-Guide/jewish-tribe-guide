'use client'

import { useState } from 'react'
import { hospitals } from '@/data/hospitals'
import type { DirectoryAnchor } from '@/types'
import { distanceMiles } from '@/lib/geo'
import UpButton from '@/components/UpButton'
import AddressPrompt from './AddressPrompt'

type Props = {
  anchor: DirectoryAnchor
  /** Open the About Your Hospital page for the chosen hospital. */
  onSelect: (hospitalId: string) => void
  onUp: () => void
}

// Lists every hospital, sorted by distance from the visitor's address (when set),
// with a search box. Tapping one opens its About Your Hospital page.
export default function HospitalsDirectory({ anchor, onSelect, onUp }: Props) {
  const [search, setSearch] = useState('')
  const coords = anchor.kind === 'address' ? anchor.coords : null

  const withDistance = hospitals.map((h) => ({
    ...h,
    miles: coords ? distanceMiles(coords, { lat: h.latitude, lng: h.longitude }) : null,
  }))

  const q = search.trim().toLowerCase()
  const filtered = withDistance
    .filter((h) => !q || h.name.toLowerCase().includes(q))
    .sort((a, b) =>
      a.miles != null && b.miles != null ? a.miles - b.miles : 0,
    )

  return (
    <div>
      <UpButton label="All resources" onClick={onUp} />

      <div className="mb-4">
        <h2 className="text-xl font-semibold text-slate-800">Hospitals</h2>
        {!coords && <AddressPrompt />}
      </div>

      {/* Search */}
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

      {filtered.length === 0 ? (
        <p className="text-muted text-sm">No hospitals match &ldquo;{search.trim()}&rdquo;.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((h) => (
            <button
              key={h.id}
              onClick={() => onSelect(h.id)}
              className="w-full text-left bg-white border border-slate-200 rounded-lg shadow-sm px-4 py-3 flex items-center justify-between gap-3 hover:border-primary transition-colors cursor-pointer"
            >
              <span className="font-semibold text-slate-900 text-sm min-w-0">{h.name}</span>
              <span className="flex items-center gap-2 shrink-0">
                {h.miles != null && (
                  <span className="text-xs font-medium text-slate-600 whitespace-nowrap">📍 {h.miles} mi</span>
                )}
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
