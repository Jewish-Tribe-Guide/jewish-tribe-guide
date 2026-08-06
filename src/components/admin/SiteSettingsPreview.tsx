'use client'

import { useState } from 'react'
import type { SiteSettings } from '@/lib/siteSettings'
import type { DraftHomeSection } from '@/lib/homeSections'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import HeroHeading from '@/components/home/HeroHeading'
import SectionTabs from '@/components/home/SectionTabs'
import HomeMap from '@/components/home/HomeMap'
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

// The site-wide live GPS watch, stubbed off. The preview's map gets a real
// tracking UI this way without the admin's browser actually being asked for
// location permission just to look at the home page.
const inertTracking = { tracking: false, error: null, start: () => {}, stop: () => {} }

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
// The map band is the real live ResourceMapView, not a stand-in — it's the
// largest thing on the desktop home screen, and a placeholder there left the
// preview's whole lower half a guess. It's fed inert location/navigation
// props so looking at the home page can't trigger a location permission
// prompt or navigate the admin out of the preview.

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
        {/* mapIcon/onViewMap are deliberately not passed: Landing doesn't pass
            them either, so the live home screen has no "View Map" button under
            the search box — the desktop redesign replaced it with the "Explore
            the map" band below. Passing them here rendered a button that
            exists on no real page. */}
        <HeroHeading
          settings={settings}
          query={query}
          onQueryChange={setQuery}
          interactive={false}
        />

        {/* Featured row — desktop only, matching Landing. */}
        {!isMobile && (
          <div className="pointer-events-none">
            <FeaturedCards cards={featured} loading={allCards === null} onShowAll={() => {}} />
          </div>
        )}

        {/* The map band — desktop only, and the real live map, same as Landing.
            It sizes itself (sm:h-[70vh]) off the frame's viewport, so it fills
            the preview the way it fills a real desktop window. */}
        {mapCategory && !isMobile && (
          <div className="mt-14">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Explore the map</h2>
            <HomeMap onNavigate={noopNavigate} coords={null} liveTracking={inertTracking} />
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
