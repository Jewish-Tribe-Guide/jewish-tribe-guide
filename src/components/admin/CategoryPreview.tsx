'use client'

import { useEffect, useState } from 'react'
import type { CategoryConfig } from '@/lib/categories'
import type { DirectoryResource, MapFilters } from '@/types'
import type { Coords } from '@/lib/useStoredLocation'
import { withMilesFromAddress } from '@/lib/listingTravel'
import GenericDirectory from '@/components/resources/GenericDirectory'
import ListingForm from '@/components/resources/ListingForm'
import ReportListing from '@/components/resources/ReportListing'
import ResourceMapView from '@/components/map/ResourceMapView'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import { HeaderCollapseProvider } from '@/lib/headerVisibility'
import { PinnedProvider } from '@/lib/pinnedContext'
import { DroppedPinsProvider } from '@/lib/droppedPinsContext'
import { ListingsProvider } from '@/lib/listingsContext'
import DevicePreviewFrame from './DevicePreviewFrame'

// A preview of the real directory page for a category — the exact same
// GenericDirectory/ListingForm/ReportListing components a visitor sees, driven
// by the admin's in-progress (unsaved) draft. Shows the category's real,
// already-approved listings; Add/Edit build a listing locally and drop it
// straight into the preview list instead of posting to /api/submissions, so
// the admin can see a new listing "appear" without persisting anything.
// Report similarly shows its confirmation screen without actually filing one.
// The Map button opens the real site-wide map, pre-filtered to this category —
// it reads live, already-saved data (the map has no notion of an unpublished
// draft), same as clicking Map from the live directory would.

type Action =
  | { mode: 'create' }
  | { mode: 'edit'; listing: DirectoryResource }
  | { mode: 'report'; listing: DirectoryResource }
  | { mode: 'map'; query?: string; filters?: MapFilters }

export default function CategoryPreview({
  category,
  onClose,
}: {
  /** The draft, packaged as a full CategoryConfig — never saved. */
  category: CategoryConfig
  onClose: () => void
}) {
  const [realListings, setRealListings] = useState<DirectoryResource[] | null>(null)
  // Listings added/edited during this preview session — client-only, never
  // sent to the server. An edited real listing is "shadowed" here by id (see
  // `items` below), the same way a brand-new one is simply appended.
  const [localListings, setLocalListings] = useState<DirectoryResource[]>([])
  const [action, setAction] = useState<Action | null>(null)
  // The preview's own address anchor — session-only (not persisted to the
  // visitor's real stored location) so setting a location here can't leak into
  // the live site, and vice versa.
  const [address, setAddress] = useState('')
  const [coords, setCoords] = useState<Coords | null>(null)
  // Every approved listing across every category, site-wide — ResourceMapView
  // doesn't fetch its own (on the live site that's a server component's job,
  // via ListingsProvider — see MapPage), so without this the Map action would
  // sit on "Loading map…" forever, reading a listings context that never
  // gets filled in. Fetched once, lazily, the first time the admin actually
  // clicks Map — not up front with `realListings` — since most preview
  // sessions never open it, and this is the whole site's listings, not just
  // this one category's.
  const [mapListings, setMapListings] = useState<DirectoryResource[] | null>(null)

  useEffect(() => {
    if (action?.mode !== 'map' || mapListings !== null) return
    let cancelled = false
    fetch('/api/resources')
      .then(async (res) => {
        const body = await res.json()
        if (!cancelled) setMapListings(res.ok && body.ok ? (body.resources as DirectoryResource[]) : [])
      })
      .catch(() => {
        if (!cancelled) setMapListings([])
      })
    return () => {
      cancelled = true
    }
  }, [action?.mode, mapListings])

  useEffect(() => {
    let cancelled = false
    // A brand-new, unsaved category's id has no matching rows — this just
    // resolves to an empty list, same as any other empty category.
    fetch(`/api/resources?category=${encodeURIComponent(category.id)}`)
      .then(async (res) => {
        const body = await res.json()
        if (!cancelled) setRealListings(res.ok && body.ok ? (body.resources as DirectoryResource[]) : [])
      })
      .catch(() => {
        if (!cancelled) setRealListings([])
      })
    return () => {
      cancelled = true
    }
  }, [category.id])

  function goToDirectory() {
    setAction(null)
  }

  function addOrReplaceLocal(resource: DirectoryResource) {
    setLocalListings((prev) => [...prev.filter((l) => l.id !== resource.id), resource])
    goToDirectory()
  }

  let content: React.ReactNode
  if (action?.mode === 'create') {
    content = (
      <ListingForm
        category={category}
        mode="create"
        onUp={goToDirectory}
        onSubmitted={goToDirectory}
        onPreviewSubmit={addOrReplaceLocal}
      />
    )
  } else if (action?.mode === 'edit') {
    content = (
      <ListingForm
        category={category}
        mode="edit"
        existing={action.listing}
        onUp={goToDirectory}
        onSubmitted={goToDirectory}
        onPreviewSubmit={addOrReplaceLocal}
      />
    )
  } else if (action?.mode === 'report') {
    content = (
      <ReportListing
        listing={action.listing}
        upLabel={category.pluralLabel}
        onUp={goToDirectory}
        onSubmitted={goToDirectory}
        preview
      />
    )
  } else if (action?.mode === 'map') {
    content = (
      <ListingsProvider listings={mapListings}>
        <ResourceMapView
          onUp={goToDirectory}
          userLocation={coords}
          initialCategory={category.id}
          initialQuery={action.query}
          initialFilters={action.filters}
        />
      </ListingsProvider>
    )
  } else if (realListings === null) {
    content = <p className="text-sm text-muted p-4">Loading…</p>
  } else {
    // A locally added/edited listing shadows any real listing with the same id.
    const localIds = new Set(localListings.map((l) => l.id))
    const items = [...realListings.filter((r) => !localIds.has(r.id)), ...localListings]
    content = (
      <GenericDirectory
        category={category}
        items={itemsWithDistance(items, category, coords)}
        anchorLabel={(coords && address) || undefined}
        addressPrompt={!(coords && address) && category.hasAddress !== false}
        onUp={onClose}
        onAdd={() => setAction({ mode: 'create' })}
        onEdit={(listing) => setAction({ mode: 'edit', listing })}
        onReport={(listing) => setAction({ mode: 'report', listing })}
        onViewMap={(query, filters) => setAction({ mode: 'map', query, filters })}
      />
    )
  }

  return (
    <DevicePreviewFrame onClose={onClose}>
      {/* Same provider stack SiteChrome wraps every real screen in (minus
          LocationProvider — this preview tracks its own address/coords above
          and hands them to SiteHeader directly, no context needed) — the Map
          action renders the real ResourceMapView, and PinButton shows up
          inside its own place detail, and both reach for PinnedProvider/
          DroppedPinsProvider the same way they do on the live site. Missing
          either here is invisible until an admin actually clicks Map or a
          pin from inside this preview, at which point it throws instead of
          just rendering wrong. */}
      <PinnedProvider>
        <DroppedPinsProvider>
          <HeaderCollapseProvider>
            <SiteHeader
              onGoHome={onClose}
              location={{ address, coords, onAddressChange: setAddress, onCoords: setCoords, tracking: false, geoError: null, geoErrorSilent: false, onStartTracking: () => {}, onStopTracking: () => {} }}
            />
            <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-8">{content}</main>
            <SiteFooter year={new Date().getFullYear()} />
          </HeaderCollapseProvider>
        </DroppedPinsProvider>
      </PinnedProvider>
    </DevicePreviewFrame>
  )
}

// Mirrors ResourceLoader's distance annotation — straight-line miles from the
// preview's own address anchor to each listing's geocoded coordinates. No
// anchorListingId here: "I'm here" needs a LocationProvider, which the
// preview deliberately doesn't have (see useOptionalLocation's own note).
function itemsWithDistance(
  items: DirectoryResource[],
  category: CategoryConfig,
  coords: Coords | null,
): DirectoryResource[] {
  if (category.hasAddress === false) return items
  return withMilesFromAddress(items, coords)
}
