'use client'

import { useState } from 'react'
import { CardGrid, PlacesResults, cardMatches, searchListings, groupCardsIntoSections, type CardDef, resourceCards } from '@/components/home/sections'
import HeroHeading from '@/components/home/HeroHeading'
import { useLogSearchMiss } from '@/lib/useLogSearchMiss'
import { useCategories } from '@/lib/useCategories'
import { useForm, useForms } from '@/lib/useForms'
import { useAllListings } from '@/lib/useAllListings'
import type { NavigateFn } from '@/types'
import type { Flow } from '@/app/page'
import { community } from '@/community.config'
import { ui } from '@/lib/uiConfig'
import { useSiteSettings } from '@/lib/useSiteSettings'

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
  const settings = useSiteSettings()
  // Card labels mirror whatever the admin named each form (Forms tab) — falls
  // back to the historical copy while the form is still loading.
  const supportForm = useForm('support')
  const volunteerForm = useForm('volunteer')
  // Every other form is an admin-created custom one — support/volunteer keep
  // their own dedicated cards above (fixed copy/keywords), so exclude them
  // here rather than double-listing.
  const customForms = (useForms() ?? []).filter((f) => f.id !== 'support' && f.id !== 'volunteer')
  const mapCategory = categories?.find((c) => c.kind === 'map')

  const entryCards: CardDef[] = [
    ...(community.features.patientSupport
      ? [{
          title: supportForm?.title ?? 'Patient & Family Support',
          id: 'support',
          icon: '🤝',
          keywords: [
            'request support', 'support', 'help', 'assistance', 'request', 'patient', 'patients',
            'family', 'families', 'need help', 'meal', 'meals', 'food', 'kosher food', 'dinner',
            'lunch', 'breakfast', 'shabbos food', 'ride', 'rides', 'car', 'drive', 'lift', 'transport',
            'transportation', 'taxi', 'uber', 'pickup', 'appointment', 'housing', 'place to stay',
            'room', 'apartment', 'lodging', 'overnight', 'out of town', 'visit', 'visitor', 'visitors',
            'bikur cholim', 'company', 'someone to talk to', 'case manager', 'social worker',
          ],
          go: () => onOpenFlow('support'),
        }]
      : []),
    ...(community.features.volunteer
      ? [{
          title: volunteerForm?.title ?? 'Volunteer for Patients',
          id: 'volunteer',
          icon: '💛',
          keywords: [
            'volunteer', 'volunteering', 'help out', 'give', 'give back', 'chesed', 'mitzvah', 'cook',
            'cook for a family', 'deliver meals', 'host', 'hosting', 'drive', 'rides', 'give rides',
            'visit patients', 'donate time', 'sign up', 'get involved', 'tzedakah', 'lend a hand',
          ],
          go: () => onOpenFlow('volunteer'),
        }]
      : []),
    ...(mapCategory
      ? [{
          title: 'View Map',
          id: 'map',
          icon: mapCategory.icon,
          keywords: [
            'map', 'maps', 'view map', 'locations', 'where', 'nearby', 'directions', 'address',
            'addresses', 'google map', 'pin', 'pins', 'navigate', 'around me',
          ],
          go: () => onNavigate('patient', 'map'),
        }]
      : []),
    ...customForms.map((f) => ({
      title: f.title,
      id: f.id,
      go: () => onOpenFlow(f.id),
    })),
  ]

  const resources = resourceCards(onNavigate, categories)
  // Order is no longer alphabetical — see HOME_SECTIONS in sections.tsx, which
  // sorts these into labeled groups for the grid below.
  const allCards = resources ? [...entryCards, ...resources] : null

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
  // Sections only exist once loading is done and there's something to group;
  // while loading, a single flat grid of entry cards + skeletons stands in.
  const sections = filtered ? groupCardsIntoSections(filtered) : []

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
      {/* ── Heading + filter ─────────────────────────────────────────────────── */}
      <HeroHeading settings={settings} query={query} onQueryChange={setQuery} />

      {/* ── The grid — grouped into labeled sections; a search narrows each
              section's cards and hides any section left empty. ────────────── */}
      <section className="mt-12 sm:mt-14 space-y-10">
        {q && (filtered?.length ?? 0) === 0 && placeHits.length === 0 && (
          <p className="text-center text-sm text-slate-500">
            Nothing matches “{q}”. Try a different word, clear the filter, or suggest it below.
          </p>
        )}
        {loading ? (
          <CardGrid cards={entryCards} loadingCount={6} />
        ) : (
          <>
            {sections.map((s) => (
              <div key={s.title}>
                <h2 className="mb-3 text-lg font-semibold text-slate-900">{s.title}</h2>
                <CardGrid cards={s.cards} />
              </div>
            ))}
            {ui.contributions.suggestCategory && <CardGrid cards={[suggestCard]} />}
          </>
        )}
      </section>

      {/* ── Matching places (individual listings within the cards) ───────────── */}
      {placeHits.length > 0 && (
        <PlacesResults hits={placeHits} onOpen={openPlace} />
      )}
    </main>
  )
}
