'use client'

import { useState } from 'react'
import { CardGrid, PlacesResults, cardMatches, searchListings, type CardDef, resourceCards } from '@/components/home/sections'
import { useLogSearchMiss } from '@/lib/useLogSearchMiss'
import { useIsMobile } from '@/lib/useIsMobile'
import { useCategories } from '@/lib/useCategories'
import { useAllListings } from '@/lib/useAllListings'
import type { NavigateFn } from '@/types'
import type { Flow } from '@/app/page'

const ADD_CATEGORY = '__add_category__'

type Props = {
  onNavigate: NavigateFn
  /** Opens a full-screen guided form (Support / Volunteer). */
  onOpenFlow: (kind: Flow['kind'], preselect?: string[]) => void
  /** The visitor's location (from the header pill) — lets "Places" results show
   *  distance, exactly like the category directory does. */
  coords: { lat: number; lng: number } | null
}

// The whole site is one screen: a filter box, then a grid of cards. Typing
// filters the grid live against each card's hidden keywords (so "shul" surfaces
// Synagogues), with no dropdown to click through.
export default function Landing({ onNavigate, onOpenFlow, coords }: Props) {
  const categories = useCategories()
  const listings = useAllListings()
  const [query, setQuery] = useState('')
  const isMobile = useIsMobile()

  const entryCards: CardDef[] = [
    {
      title: 'Patient & Family Support',
      keywords: [
        'request support', 'support', 'help', 'assistance', 'request', 'patient', 'patients',
        'family', 'families', 'need help', 'meal', 'meals', 'food', 'kosher food', 'dinner',
        'lunch', 'breakfast', 'shabbos food', 'ride', 'rides', 'car', 'drive', 'lift', 'transport',
        'transportation', 'taxi', 'uber', 'pickup', 'appointment', 'housing', 'place to stay',
        'room', 'apartment', 'lodging', 'overnight', 'out of town', 'visit', 'visitor', 'visitors',
        'bikur cholim', 'company', 'someone to talk to', 'case manager', 'social worker',
      ],
      go: () => onOpenFlow('support'),
    },
    {
      title: 'Volunteer for Patients',
      keywords: [
        'volunteer', 'volunteering', 'help out', 'give', 'give back', 'chesed', 'mitzvah', 'cook',
        'cook for a family', 'deliver meals', 'host', 'hosting', 'drive', 'rides', 'give rides',
        'visit patients', 'donate time', 'sign up', 'get involved', 'tzedakah', 'lend a hand',
      ],
      go: () => onOpenFlow('volunteer'),
    },
    {
      title: 'View Map',
      keywords: [
        'map', 'maps', 'view map', 'locations', 'where', 'nearby', 'directions', 'address',
        'addresses', 'google map', 'pin', 'pins', 'navigate', 'around me',
      ],
      go: () => onNavigate('patient', 'map'),
    },
  ]

  const resources = resourceCards(onNavigate, categories)
  const allCards = resources
    ? [...entryCards, ...resources].sort((a, b) => a.title.localeCompare(b.title))
    : null

  const q = query.trim()
  const loading = !q && allCards === null
  const filtered = q && allCards ? allCards.filter((c) => cardMatches(c, q)) : allCards

  // Individual places that match the query by name + tags (e.g. a grocery store
  // with a "cheese" tag for "kosher cheese"). Only computed once the visitor types.
  const placeHits = q && listings ? searchListings(listings, categories ?? [], q, coords) : []

  // Tapping a place opens its category directory, pre-filtered to the matched term
  // (so it survives that page's own search) with the place itself expanded.
  const openPlace = (hit: (typeof placeHits)[number]) =>
    onNavigate('patient', 'find', {
      findView: hit.item.category,
      findQuery: hit.term,
      findItemId: hit.item.id,
    })

  // Capture searches that come up empty — the most actionable signal for what
  // content to add next. Only counts once data has loaded, so a slow load never
  // looks like a "miss".
  useLogSearchMiss({
    query,
    hasResults: (filtered?.length ?? 0) > 0 || placeHits.length > 0,
    ready: allCards !== null && listings !== null,
    source: 'Home',
  })

  const suggestCard: CardDef = {
    title: 'Suggest a new category',
    dashed: true,
    go: () => onNavigate('patient', 'find', { findView: ADD_CATEGORY }),
  }
  // While categories load, show entry cards + skeletons (suggest card waits until
  // the real cards are in). Otherwise show the filtered grid + suggest card.
  const gridCards = loading ? entryCards : [...(filtered ?? []), suggestCard]

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
      {/* ── Heading + filter ─────────────────────────────────────────────────── */}
      <section className="pt-12 sm:pt-16 text-center">
        <h1 className="text-3xl sm:text-[40px] font-bold tracking-tight text-slate-900 leading-tight">
          What are you looking for?
        </h1>
        <p className="mt-3 max-w-2xl mx-auto text-[15px] sm:text-base text-slate-500">
          A guide to Jewish Philadelphia — community resources for
          residents, visitors, and hospital patients.
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
              placeholder={isMobile ? 'Filter — food, rides, housing…' : 'Filter — kosher food, rides, housing, synagogues…'}
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
        {q && (filtered?.length ?? 0) === 0 && placeHits.length === 0 && (
          <p className="mb-5 text-center text-sm text-slate-500">
            Nothing matches “{q}”. Try a different word, clear the filter, or suggest it below.
          </p>
        )}
        <CardGrid cards={gridCards} loadingCount={loading ? 6 : 0} />
      </section>

      {/* ── Matching places (individual listings within the cards) ───────────── */}
      {placeHits.length > 0 && (
        <PlacesResults hits={placeHits} onOpen={openPlace} />
      )}
    </main>
  )
}
