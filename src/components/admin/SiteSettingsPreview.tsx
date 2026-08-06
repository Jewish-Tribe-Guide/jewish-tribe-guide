'use client'

import { useState } from 'react'
import type { SiteSettings } from '@/lib/siteSettings'
import type { DraftHomeSection } from '@/lib/homeSections'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import HeroHeading from '@/components/home/HeroHeading'
import SectionTabs from '@/components/home/SectionTabs'
import ZmanimStrip from '@/components/home/ZmanimStrip'
import { CardGrid, groupCardsIntoSections, resourceCards, useEntryCards } from '@/components/home/sections'
import FeaturedCards from '@/components/home/FeaturedCards'
import { pickFeaturedCards } from '@/lib/featuredCards'
import { useAllListings } from '@/lib/useAllListings'
import { useCategories } from '@/lib/useCategories'
import { useIsMobile } from '@/lib/useIsMobile'
import { community } from '@/community.config'
import DevicePreviewFrame from './DevicePreviewFrame'

const noopNavigate = () => {}
const noopOpenFlow = () => {}
const noopViewMap = () => {}

// A preview of the whole home page — the exact same components a visitor sees,
// fed by the admin's in-progress (unsaved) draft for the name/tagline/logo text
// AND the section grouping. Categories/forms/listings themselves are still live
// data (only this tab's own fields are draft-able). Nothing is clickable — this
// is a look, not a working page.
//
// The composition below deliberately mirrors Landing.tsx section for section,
// including which parts each viewport drops, because desktop and mobile show
// genuinely different home screens (see the note at the top of Landing):
//
//   Desktop — section tabs → hero → featured row → map → card grid (absent) →
//   zmanim band → footer.
//   Mobile  — hero → the full grouped card grid inline → footer.
//
// A preview that showed the same thing for both would misrepresent whichever
// one the admin wasn't looking at — which is exactly what it used to do, by
// always rendering the grid and never rendering the tabs, map, or zmanim.
//
// The one deliberate departure from Landing is the map: it's a real, live
// ResourceMapView there, and booting a second interactive Google map inside the
// preview iframe costs an API load and a pile of measurement work to show a
// band this screen can't edit anyway. It stands in as a labeled placeholder of
// the same shape, so the page's proportions stay honest.

export default function SiteSettingsPreview({
  settings,
  sections: draftSections,
  onClose,
}: {
  settings: SiteSettings
  sections: DraftHomeSection[]
  onClose: () => void
}) {
  return (
    <DevicePreviewFrame onClose={onClose}>
      <PreviewBody settings={settings} sections={draftSections} />
    </DevicePreviewFrame>
  )
}

// Split out so it renders *inside* DevicePreviewFrame's <ForcedViewport>, which
// is what makes `useIsMobile()` below report the selected device rather than
// the admin's own browser width.
function PreviewBody({
  settings,
  sections: draftSections,
}: {
  settings: SiteSettings
  sections: DraftHomeSection[]
}) {
  const [query, setQuery] = useState('')
  const categories = useCategories()
  const entryCards = useEntryCards(noopOpenFlow)
  const listings = useAllListings()
  const isMobile = useIsMobile()

  const mapCategory = categories?.find((c) => c.kind === 'map')
  const zmanimCategory = categories?.find((c) => c.kind === 'zmanim')
  const resources = resourceCards(noopNavigate, categories)
  const allCards = resources ? [...entryCards, ...resources] : null
  const sections = allCards ? groupCardsIntoSections(allCards, draftSections) : []
  const featured = allCards ? pickFeaturedCards(allCards, listings, settings.featuredCardIds) : []

  return (
    <>
      <SiteHeader
        onGoHome={() => {}}
        location={{ address: '', onAddressChange: () => {}, onCoords: () => {}, tracking: false, geoError: null, onStartTracking: () => {}, onStopTracking: () => {} }}
        previewSettings={settings}
      />

      {/* Desktop nav tabs — CSS-gated to `sm:` in the component itself, exactly
          as on the live page, so the frame's own width drops them on mobile.
          Sits below the header, matching page.tsx's header → Landing order. */}
      <div className="pointer-events-none">
        <SectionTabs
          sections={sections}
          listings={listings}
          onOpenCard={() => {}}
          onOpenSection={() => {}}
        />
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-24 w-full flex-1">
        <HeroHeading
          settings={settings}
          query={query}
          onQueryChange={setQuery}
          interactive={false}
          mapIcon={mapCategory?.icon}
          onViewMap={noopViewMap}
        />

        {/* Featured row — desktop only, matching Landing. */}
        {!isMobile && (
          <div className="pointer-events-none">
            <FeaturedCards cards={featured} loading={allCards === null} onShowAll={() => {}} />
          </div>
        )}

        {/* The map band — desktop only. See the note above on why this is a
            placeholder rather than a live map. */}
        {mapCategory && !isMobile && (
          <div className="mt-14">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Explore the map</h2>
            <div className="flex h-[420px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50">
              <p className="px-6 text-center text-sm text-slate-400">
                The live map renders here.
                <br />
                Not editable from this screen.
              </p>
            </div>
          </div>
        )}

        {/* The full grouped card grid — mobile only on the live home screen;
            on desktop it lives on the All Categories page instead. */}
        {isMobile && (
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
        )}
      </main>

      {/* Zmanim & Shabbos band — desktop only, full-bleed below <main>. Uses the
          community center for coordinates, same fallback the live page uses
          before a visitor has set an address. */}
      {!isMobile && zmanimCategory && (
        <div className="pointer-events-none">
          <ZmanimStrip
            coords={community.mapCenter}
            locationLabel={settings.name}
            title={zmanimCategory.pluralLabel}
            onOpenZmanim={() => {}}
          />
        </div>
      )}

      <SiteFooter previewSettings={settings} />
    </>
  )
}
