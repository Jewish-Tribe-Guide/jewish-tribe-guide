'use client'

import { useMemo, useState } from 'react'
import { buildDestinations, searchDestinations, type Destination } from '@/lib/searchIndex'
import { useCategories } from '@/lib/useCategories'
import type { NavigateFn } from '@/types'

type Props = {
  onNavigate: NavigateFn
  /** Smaller pill for the audience pages (the landing uses the large one). */
  compact?: boolean
}

// Search-with-autosuggest. Matches against every page's keyword tags and jumps
// straight there; Enter takes the top suggestion, or falls back to a plain
// text search of the resource directory.
export default function SearchBar({ onNavigate, compact = false }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const categories = useCategories()

  const destinations = useMemo(() => buildDestinations(categories ?? []), [categories])
  const suggestions = useMemo(
    () => (query.trim() ? searchDestinations(destinations, query).slice(0, 6) : []),
    [destinations, query],
  )

  function go(d: Destination) {
    setOpen(false)
    onNavigate(d.audience, d.mode, d.extra)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (suggestions.length > 0) go(suggestions[0])
    else onNavigate('patient', 'find', { findQuery: query.trim() })
  }

  const showSuggestions = open && suggestions.length > 0

  return (
    <div className="relative">
      <form onSubmit={submit}>
        <div
          className={[
            'flex items-center rounded-full border border-slate-200 bg-white shadow-[0_6px_20px_rgb(0,0,0,0.06)] transition-shadow focus-within:shadow-[0_6px_24px_rgb(0,0,0,0.12)] hover:shadow-[0_6px_24px_rgb(0,0,0,0.10)]',
            compact ? 'pl-5 pr-1.5 py-1.5' : 'pl-6 pr-2 py-2',
          ].join(' ')}
        >
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            placeholder="Search kosher food, rides, housing, synagogues…"
            aria-label="Search resources"
            aria-expanded={showSuggestions}
            className={[
              'min-w-0 flex-1 bg-transparent text-slate-900 placeholder:text-slate-400 focus:outline-none',
              compact ? 'text-sm' : 'text-[15px]',
            ].join(' ')}
          />
          <button
            type="submit"
            aria-label="Search"
            className={[
              'ml-3 grid shrink-0 place-items-center rounded-full bg-primary text-white hover:bg-primary-dark transition-colors cursor-pointer',
              compact ? 'h-9 w-9' : 'h-11 w-11',
            ].join(' ')}
          >
            <svg className={compact ? 'h-4 w-4' : 'h-5 w-5'} fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
          </button>
        </div>
      </form>

      {showSuggestions && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-slate-100 bg-white py-2 shadow-xl shadow-slate-900/10 text-left">
          {suggestions.map((d) => (
            <button
              key={d.id}
              // onMouseDown so it fires before the input's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault()
                go(d)
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 cursor-pointer"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-lg" aria-hidden="true">
                {d.icon}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-900">{d.title}</span>
                <span className="block truncate text-xs text-slate-500">{d.description}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
