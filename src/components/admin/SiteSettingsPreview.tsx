'use client'

import { useState } from 'react'
import type { SiteSettings } from '@/lib/siteSettings'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import HeroHeading from '@/components/home/HeroHeading'
import { CardGrid, groupCardsIntoSections, resourceCards, useEntryCards } from '@/components/home/sections'
import { useCategories } from '@/lib/useCategories'
import { useHomeSections } from '@/lib/useHomeSections'
import DevicePreviewFrame from './DevicePreviewFrame'

const noopNavigate = () => {}
const noopOpenFlow = () => {}
const noopViewMap = () => {}

// A preview of the whole home page — header, hero, card grid (in the current,
// already-saved section grouping), and footer — the exact same components a
// visitor sees, fed by the admin's in-progress (unsaved) name/tagline/logo
// draft. The card grid itself reads live data (categories, sections, forms):
// unlike the text fields above, section edits save immediately rather than
// sitting in a draft, so "live" and "current" are the same thing here. Cards
// aren't clickable — this is a look, not a working page.

export default function SiteSettingsPreview({ settings, onClose }: { settings: SiteSettings; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const categories = useCategories()
  const homeSections = useHomeSections()
  const entryCards = useEntryCards(noopOpenFlow)
  const mapCategory = categories?.find((c) => c.kind === 'map')
  const resources = resourceCards(noopNavigate, categories)
  const allCards = resources ? [...entryCards, ...resources] : null
  const sections = allCards ? groupCardsIntoSections(allCards, homeSections ?? []) : []

  return (
    <DevicePreviewFrame onClose={onClose}>
      <SiteHeader onGoHome={() => {}} location={{ address: '', onAddressChange: () => {}, onCoords: () => {} }} previewSettings={settings} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-24 w-full flex-1">
        <HeroHeading
          settings={settings}
          query={query}
          onQueryChange={setQuery}
          interactive={false}
          mapIcon={mapCategory?.icon}
          onViewMap={noopViewMap}
        />

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
