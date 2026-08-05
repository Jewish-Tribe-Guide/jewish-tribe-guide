'use client'

import { useState } from 'react'
import type { SiteSettings } from '@/lib/siteSettings'
import type { DraftHomeSection } from '@/lib/homeSections'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import HeroHeading from '@/components/home/HeroHeading'
import { CardGrid, groupCardsIntoSections, resourceCards, useEntryCards } from '@/components/home/sections'
import FeaturedCards from '@/components/home/FeaturedCards'
import { pickFeaturedCards } from '@/lib/featuredCards'
import { useAllListings } from '@/lib/useAllListings'
import { useCategories } from '@/lib/useCategories'
import DevicePreviewFrame from './DevicePreviewFrame'

const noopNavigate = () => {}
const noopOpenFlow = () => {}
const noopViewMap = () => {}

// A preview of the whole home page — header, hero, card grid, and footer —
// the exact same components a visitor sees, fed by the admin's in-progress
// (unsaved) draft for both the name/tagline/logo text AND the section
// grouping. Categories/forms/listings themselves are still live data (only
// this tab's own fields are draft-able). Cards aren't clickable — this is a
// look, not a working page.

export default function SiteSettingsPreview({
  settings,
  sections: draftSections,
  onClose,
}: {
  settings: SiteSettings
  sections: DraftHomeSection[]
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const categories = useCategories()
  const entryCards = useEntryCards(noopOpenFlow)
  const mapCategory = categories?.find((c) => c.kind === 'map')
  const resources = resourceCards(noopNavigate, categories)
  const allCards = resources ? [...entryCards, ...resources] : null
  const sections = allCards ? groupCardsIntoSections(allCards, draftSections) : []
  // Mirrors the live desktop home screen's featured row, so the trio picked
  // just above this preview's own button can actually be seen before saving.
  const listings = useAllListings()
  const featured = allCards ? pickFeaturedCards(allCards, listings, settings.featuredCardIds) : []

  return (
    <DevicePreviewFrame onClose={onClose}>
      <SiteHeader
        onGoHome={() => {}}
        location={{ address: '', onAddressChange: () => {}, onCoords: () => {}, tracking: false, geoError: null, onStartTracking: () => {}, onStopTracking: () => {} }}
        previewSettings={settings}
      />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-24 w-full flex-1">
        <HeroHeading
          settings={settings}
          query={query}
          onQueryChange={setQuery}
          interactive={false}
          mapIcon={mapCategory?.icon}
          onViewMap={noopViewMap}
        />

        <div className="pointer-events-none">
          <FeaturedCards cards={featured} loading={allCards === null} onShowAll={() => {}} />
        </div>

        <section className="mt-12 sm:mt-14 space-y-10 pointer-events-none">
          {allCards === null ? (
            <CardGrid cards={entryCards} loadingCount={6} />
          ) : (
            sections.map((s) => (
              <div key={s.title}>
                <h2 className="mb-3 text-lg font-semibold text-slate-900">{s.title}</h2>
                <CardGrid cards={s.cards} />
              </div>
            ))
          )}
        </section>
      </main>

      <SiteFooter previewSettings={settings} />
    </DevicePreviewFrame>
  )
}
