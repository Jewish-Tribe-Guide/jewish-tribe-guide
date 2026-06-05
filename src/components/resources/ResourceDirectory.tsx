'use client'

import { useState } from 'react'
import type { KosherPlace } from '@/types'

type KosherFilter = 'all' | 'kosher' | 'non-kosher'

type Props = {
  title: string
  items: KosherPlace[]
  onBack: () => void
}

export default function ResourceDirectory({ title, items, onBack }: Props) {
  const [search, setSearch] = useState('')
  const [kosherFilter, setKosherFilter] = useState<KosherFilter>('all')

  const filtered = items
    .filter((item) => {
      if (kosherFilter === 'kosher' && !item.isKosher) return false
      if (kosherFilter === 'non-kosher' && item.isKosher) return false
      if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
    .sort((a, b) => a.distance - b.distance)

  const filterOptions: { value: KosherFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'kosher', label: 'Kosher' },
    { value: 'non-kosher', label: 'Non-Kosher' },
  ]

  return (
    <div>
      {/* Back + header */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted hover:text-slate-700 mb-4 cursor-pointer transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>
      <h2 className="text-xl font-semibold text-slate-800 mb-4">{title}</h2>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <div className="flex rounded-md border border-slate-300 overflow-hidden shrink-0">
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setKosherFilter(opt.value)}
              className={[
                'px-3 py-2 text-sm font-medium transition-colors cursor-pointer',
                kosherFilter === opt.value
                  ? 'bg-primary text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <p className="text-muted text-sm">No results found.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="bg-white border border-slate-200 rounded-lg shadow-sm px-4 py-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 text-sm">{item.name}</p>
                    {item.isKosher && (
                      <span className="text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5">
                        Kosher
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-0.5">{item.address}</p>
                  {item.phone && (
                    <a href={`tel:${item.phone.replace(/\D/g, '')}`} className="text-xs text-primary hover:underline">
                      {item.phone}
                    </a>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
                    {item.distance} mi
                  </span>
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(item.address)}`}
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
