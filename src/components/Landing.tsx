'use client'

import { useMemo, useState } from 'react'
import { CardGrid, type CardDef, resourceCards } from '@/components/home/sections'
import { buildDestinations, searchDestinations, type Destination } from '@/lib/searchIndex'
import { useCategories } from '@/lib/useCategories'
import type { NavigateFn } from '@/types'
import type { Flow } from '@/app/page'

const ADD_CATEGORY = '__add_category__'

// Search "service" → the Support wizard need it should pre-check.
const SERVICE_TO_NEED: Record<string, string> = {
  Meals: 'meals',
  Transportation: 'transportation',
  'Family Housing': 'familyHousing',
  'Request Visitors': 'visitors',
}

type Props = {
  onNavigate: NavigateFn
  /** Opens a full-screen guided form (Support / Volunteer). */
  onOpenFlow: (kind: Flow['kind'], preselect?: string[]) => void
}

// The whole site is one screen: a filter box, then a grid of cards. Empty box →
// browse everything (Support + Volunteer + the resource directory, A–Z). Typing
// filters the grid live against each destination's keywords and shows matches
// directly, so there's no dropdown to click through.
export default function Landing({ onNavigate, onOpenFlow }: Props) {
  const categories = useCategories()
  const [query, setQuery] = useState('')

  // Turn a search destination into a grid card that jumps straight to it —
  // support services and "direct support" open the Support wizard (pre-checking
  // the matching need); volunteer destinations open the Volunteer wizard.
  const destToCard = (d: Destination): CardDef => {
    const go = d.service || d.id === 'direct-support'
      ? () => onOpenFlow('support', SERVICE_TO_NEED[d.service ?? ''] ? [SERVICE_TO_NEED[d.service!]] : [])
      : d.mode === 'give'
        ? () => onOpenFlow('volunteer')
        : () => onNavigate(d.audience, d.mode, d.extra)
    return { icon: d.icon, title: d.title, description: d.description, go }
  }

  const destinations = useMemo(() => buildDestinations(categories ?? []), [categories])
  const q = query.trim()
  const results = q ? searchDestinations(destinations, q).map(destToCard) : null

  // ── Browse grid: Support + Volunteer pinned, then resources A–Z ─────────────
  const entryCards: CardDef[] = [
    {
      icon: '🤝',
      title: 'Support',
      description: 'Request meals, rides, housing, visitors, or other help.',
      go: () => onOpenFlow('support'),
    },
    {
      icon: '🙌',
      title: 'Volunteer Opportunities',
      description: 'Sign up to cook, drive, visit, or host a family in need.',
      go: () => onOpenFlow('volunteer'),
    },
  ]
  const resources = resourceCards(onNavigate, categories, { includeHospital: true })
  const sortedResources = resources && [...resources].sort((a, b) => a.title.localeCompare(b.title))
  const browseCards = [...entryCards, ...(sortedResources ?? [])]

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
      {/* ── Heading + filter ─────────────────────────────────────────────────── */}
      <section className="pt-12 sm:pt-16 text-center">
        <h1 className="text-3xl sm:text-[40px] font-bold tracking-tight text-slate-900 leading-tight">
          What are you looking for?
        </h1>
        <p className="mt-3 max-w-2xl mx-auto text-[15px] sm:text-base text-slate-500">
          Kosher meals, rides, housing, visitors, and community resources for patients
          and families at Philadelphia hospitals.
        </p>
        <div className="mt-8 max-w-xl mx-auto">
          <div className="flex items-center rounded-full border border-slate-200 bg-white pl-5 pr-2 py-2 shadow-[0_6px_20px_rgb(0,0,0,0.06)] transition-shadow focus-within:shadow-[0_6px_24px_rgb(0,0,0,0.12)]">
            <svg className="h-5 w-5 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter — kosher food, rides, housing, synagogues…"
              aria-label="Filter resources"
              className="min-w-0 flex-1 bg-transparent px-3 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
            {q && (
              <button
                onClick={() => setQuery('')}
                aria-label="Clear filter"
                className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── The grid ─────────────────────────────────────────────────────────── */}
      <section className="mt-12 sm:mt-14">
        {results ? (
          results.length > 0 ? (
            <CardGrid cards={results} />
          ) : (
            <p className="text-center text-sm text-slate-500">
              Nothing matches “{q}”. Try a different word, or browse everything by clearing the filter.
            </p>
          )
        ) : (
          <>
            <CardGrid cards={browseCards} loadingCount={sortedResources === null ? 6 : 0} />
            <button
              onClick={() => onNavigate('patient', 'find', { findView: ADD_CATEGORY })}
              className="mx-auto mt-10 flex items-center justify-center gap-2 rounded-lg border border-dashed border-primary/50 bg-primary/5 px-4 py-3 text-sm font-medium text-primary hover:bg-primary/10 transition-colors cursor-pointer"
            >
              <span aria-hidden="true">➕</span>
              Don&apos;t see the right category? Suggest a new one
            </button>
          </>
        )}
      </section>
    </main>
  )
}
