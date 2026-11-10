'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { bandImageFor, resolveCapabilities, type CategoryConfig } from '@/lib/categories'
import { getCategoryColor } from '@/lib/categoryColor'
import type { DirectoryResource, MapFilters } from '@/types'
import { takeCategoryListings } from '@/lib/categoryListings'
import type { Coords } from '@/lib/useStoredLocation'
import { withMilesFromAddress } from '@/lib/listingTravel'
import { community } from '@/community.config'
import GenericDirectory from '@/components/resources/GenericDirectory'
import EruvInfo from '@/components/resources/EruvInfo'
import ZmanimCard from '@/components/ZmanimCard'
import ResourceMapView from '@/components/map/ResourceMapView'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import { HeaderCollapseProvider } from '@/lib/headerVisibility'
import { PinnedProvider } from '@/lib/pinnedContext'
import { DroppedPinsProvider } from '@/lib/droppedPinsContext'
import { ListingsProvider } from '@/lib/listingsContext'
import { PreviewCategoryProvider } from '@/lib/contentContext'
import { PreviewSendProvider } from '@/lib/previewSend'
import DevicePreviewFrame from './DevicePreviewFrame'
import ListingEditorScreen from './ListingEditorScreen'
import ListingView from '@/components/resources/ListingView'
import ListingEditBar from '@/components/resources/ListingEditBar'
import { ui } from '@/lib/uiConfig'
import { fullestListing } from '@/lib/fullestListing'
import { madeUpPlace, sampleName } from '@/lib/fieldLooks'

// A preview of the real directory page for a category — the exact same
// GenericDirectory/ListingEditor components a visitor sees, driven
// by the admin's in-progress (unsaved) draft. Shows the category's real,
// already-approved listings. Nothing done inside it is sent anywhere: the
// whole page sits under PreviewSendProvider (src/lib/previewSend.tsx), which
// every way a visitor can send something goes through. A listing's edit —
// the page's Edit, a box's own Edit on an opened listing, or the "+ Add"
// box's "Fill it in yourself" (the page's "+") — is built into a listing
// locally and dropped straight into the preview list (addOrReplaceLocal), so
// the admin sees the change "appear" without persisting anything. The box
// is shown as visitors see it, but reads nothing (no AI call; it says it's
// the preview). The rest — "Still right?", an item's "Still here", Update
// their times, Add a minyan, an upvote, Request removal — shows a visitor's
// own "Sent"/"Thanks" with nothing filed and the listing unchanged.
// The Map button opens the real site-wide map, pre-filtered to this category.
// Its *listings* are live, already-saved data — the map has no notion of an
// unpublished listing — but the category itself is the draft: everything below
// reads the categories list through PreviewCategoryProvider, so the pin
// colour, icon and chip label are the ones the editor is showing rather than
// the ones still in the database.

/** Which part of the page (board 5): the list, its most filled-in place
 *  opened, or the form for adding one. */
export type PreviewView = 'page' | 'listing' | 'adding'

type Action =
  | { mode: 'edit'; listing: DirectoryResource }
  | { mode: 'map'; query?: string; filters?: MapFilters }

export default function CategoryPreview({
  category,
  onClose,
  inline = false,
  onListings,
  view = 'page',
  focusField,
}: {
  /** The draft, packaged as a full CategoryConfig — never saved. */
  category: CategoryConfig
  onClose: () => void
  /** Just the page, without the full-screen frame: the small preview
   *  beside the category editor (board 6b) draws it into its own frame. */
  inline?: boolean
  /** How many places the category has, once loaded: the editor's
   *  "N places". */
  onListings?: (listings: DirectoryResource[]) => void
  view?: PreviewView
  /** Adding opens on this field's row: the field an admin is looking at. */
  focusField?: string
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
  // Read when the listings arrive, so a new callback each render doesn't
  // fetch them again.
  const onListingsRef = useRef(onListings)
  useEffect(() => {
    onListingsRef.current = onListings
  })

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
    // Already on its way when the manager asked as the page opened.
    takeCategoryListings(category.id)
      .then(({ resources: listings }) => {
        if (!cancelled) {
          setRealListings(listings)
          // The Eruv page's places are eruvim, counted by the editor
          // itself; it has no listings to count over them.
          if (category.kind !== 'eruv') onListingsRef.current?.(listings)
        }
      })
      .catch(() => {
        if (!cancelled) setRealListings([])
      })
    return () => {
      cancelled = true
    }
  }, [category.id, category.kind])

  function goToDirectory() {
    setAction(null)
  }

  // Handed to everything under PreviewSendProvider, so the same function
  // every render.
  const addOrReplaceLocal = useCallback((resource: DirectoryResource) => {
    setLocalListings((prev) => [...prev.filter((l) => l.id !== resource.id), resource])
    setAction(null)
  }, [])

  // A page with no places yet shows a made-up one, answering every field,
  // so the page can be seen before anyone adds a place (the user, Nov 9).
  // Never saved; the first real or previewed place replaces it.
  const madeUp = category.kind !== 'eruv' && category.kind !== 'zmanim' && realListings?.length === 0 && localListings.length === 0
  // A 555 phone (never a real one); no address, which would give it
  // directions to a real street.
  const orMadeUp = (items: DirectoryResource[]) =>
    items.length ? items : [{ ...madeUpPlace(category, sampleName(category.label, category.pluralLabel)), ...(category.hasPhone !== false ? { phone: '(215) 555-0100' } : {}) }]

  let content: React.ReactNode
  if (category.kind === 'eruv') {
    // No Add/Edit/Report action state applies here — it's a single info
    // page, not a directory of listings — so this bypasses the action
    // switch below entirely, same as 'zmanim' just after it.
    // A listing and Editing (Nov 9): its fullest eruv open, as a listing
    // page opens its fullest place, and on its Edit listing, which sends
    // nothing here (PreviewSendProvider below). An eruv isn't added by
    // visitors; Edit listing is where they meet a field.
    content = (
      <EruvInfo
        key={view}
        openFullest={view !== 'page'}
        startEditing={view === 'adding'}
        onUp={onClose}
        title={category.pluralLabel}
        icon={category.icon}
        color={getCategoryColor([category], category.id)}
        bandImageUrl={bandImageFor(category)}
      />
    )
  } else if (category.kind === 'zmanim') {
    // Same fallback the real screen uses when no address is set
    // (FindResources' own zmanimCoords/locationLabel) — so the preview
    // shows real, meaningful times immediately rather than an empty state.
    content = (
      <ZmanimCard
        coords={coords ?? community.mapCenter}
        locationLabel={(coords && address) || community.region}
        onUp={onClose}
        title={category.pluralLabel}
        icon={category.icon}
        color={getCategoryColor([category], category.id)}
        bandImageUrl={bandImageFor(category)}
      />
    )
  } else if (action?.mode === 'edit') {
    content = (
      <ListingEditorScreen
        key={action.listing.id}
        heading="Edit listing"
        item={action.listing}
        category={category}
        onClose={goToDirectory}
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
  } else if (view === 'adding') {
    content = <ListingEditorScreen key={`adding:${focusField ?? ''}`} heading={`Add to ${category.pluralLabel}`} category={category} onClose={onClose} backLabel={category.pluralLabel} startOpen={focusField} history={!inline && !focusField} />
  } else if (realListings === null) {
    content = <p className="text-sm text-muted p-4">Loading…</p>
  } else if (view === 'listing') {
    // An edit made here shadows the place it edited, as on the page.
    const localIds = new Set(localListings.map((l) => l.id))
    const fullest = fullestListing(orMadeUp([...localListings, ...realListings.filter((r) => !localIds.has(r.id))]), category)
    // Edit listing at its foot, as a visitor sees it (the user, Nov 9: "I'm
    // not seeing an edit listing option in the preview"). It opens the
    // editor here, which sends nothing (PreviewSendProvider below).
    const canEdit = ui.contributions.edit && resolveCapabilities(category.capabilities).edit
    content = fullest ? (
      <ListingView
        item={fullest}
        category={category}
        color={getCategoryColor([category], category.id)}
        path=""
        foot={<ListingEditBar onEdit={canEdit ? () => setAction({ mode: 'edit', listing: fullest }) : undefined} item={fullest} category={category} />}
      />
    ) : (
      <p className="text-sm text-muted p-4">No places on this page yet.</p>
    )
  } else {
    // A locally added/edited listing shadows any real listing with the same id.
    const localIds = new Set(localListings.map((l) => l.id))
    const items = orMadeUp([...realListings.filter((r) => !localIds.has(r.id)), ...localListings])
    content = (
      <GenericDirectory
        category={category}
        items={itemsWithDistance(items, category, coords)}
        anchorLabel={(coords && address) || undefined}
        addressPrompt={!(coords && address) && category.hasAddress !== false}
        onUp={onClose}
        onEdit={(listing) => setAction({ mode: 'edit', listing })}
      />
    )
  }

  const page = (
    <>
      {/* The draft category, standing in for its saved row for everything
          below. Colour and icon are resolved from the shared categories list
          (getCategoryColor) by the map's pins/chips and by every listing
          avatar — not from the `category` prop threaded down here — so
          without this the preview showed the saved colour while the editor
          showed the new one. */}
      <PreviewCategoryProvider category={category}>
        {/* Nothing below sends anything (see the note at the top). */}
        <PreviewSendProvider listing={addOrReplaceLocal}>
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
                {/* Above the site's header: the preview's, not the page's. */}
                {madeUp && view !== 'adding' && !action && (
                  <p data-testid="made-up-note" className="m-0 bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900">
                    A made-up place, until this page has real ones
                  </p>
                )}
                <SiteHeader
                  onGoHome={onClose}
                  location={{ address, coords, onAddressChange: setAddress, onCoords: setCoords, tracking: false, geoError: null, geoErrorSilent: false, onStartTracking: () => {}, onStopTracking: () => {} }}
                  hideNav
                />
                <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-8">{content}</main>
                <SiteFooter year={new Date().getFullYear()} />
              </HeaderCollapseProvider>
            </DroppedPinsProvider>
          </PinnedProvider>
        </PreviewSendProvider>
      </PreviewCategoryProvider>
    </>
  )
  return inline ? page : <DevicePreviewFrame onClose={onClose}>{page}</DevicePreviewFrame>
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
