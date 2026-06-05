'use client'

import { useState } from 'react'
import type { Hotel } from '@/types'

type ShabbatFilter = 'all' | 'shabbat'

type Props = {
  items: Hotel[]
  onBack: () => void
}

export default function Hotels({ items, onBack }: Props) {
  const [shabbatFilter, setShabbatFilter] = useState<ShabbatFilter>('all')

  const filtered = [...items]
    .filter((h) => shabbatFilter === 'all' || h.shabbatFriendly)
    .sort((a, b) => a.distance - b.distance)

  const filterOptions: { value: ShabbatFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'shabbat', label: '🕯️ Shabbat Friendly' },
  ]

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted hover:text-slate-700 mb-4 cursor-pointer transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>
      <h2 className="text-xl font-semibold text-slate-800 mb-1">Hotels</h2>
      <p className="text-sm text-muted mb-3">Sorted by distance</p>

      {/* Filter */}
      <div className="flex rounded-md border border-slate-300 overflow-hidden mb-4 w-fit">
        {filterOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setShabbatFilter(opt.value)}
            className={[
              'px-3 py-2 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap',
              shabbatFilter === opt.value
                ? 'bg-primary text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted text-sm">No hotels match this filter.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((hotel) => (
            <div key={hotel.id} className="bg-white border border-slate-200 rounded-lg shadow-sm px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 text-sm">{hotel.name}</p>
                    {hotel.shabbatFriendly && (
                      <span className="text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
                        🕯️ Shabbat Friendly
                      </span>
                    )}
                    {hotel.shuttleAvailable && (
                      <span className="text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">
                        Shuttle Available
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-0.5">{hotel.address}</p>
                  <a href={`tel:${hotel.phone.replace(/\D/g, '')}`} className="text-xs text-primary hover:underline">
                    {hotel.phone}
                  </a>
                  {hotel.notes && (
                    <p className="text-xs text-slate-600 mt-1 italic">{hotel.notes}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
                    {hotel.distance} mi
                  </span>
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(hotel.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-primary border border-primary rounded px-2 py-1 hover:bg-primary hover:text-white transition-colors whitespace-nowrap"
                  >
                    Directions
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
