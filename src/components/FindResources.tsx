'use client'

import { useRef, useState } from 'react'
import AboutYourHospital from '@/components/tabs/AboutYourHospital'
import { eruvim } from '@/data/resources'
import HospitalsDirectory from '@/components/resources/HospitalsDirectory'
import ResourceLoader from '@/components/resources/ResourceLoader'
import ListingForm from '@/components/resources/ListingForm'
import ReportListing from '@/components/resources/ReportListing'
import EruvInfo from '@/components/resources/EruvInfo'
import ZmanimCard from '@/components/ZmanimCard'
import UpButton from '@/components/UpButton'
import TurnstileWidget, { type TurnstileHandle } from '@/components/TurnstileWidget'
import type { DirectoryResource, DirectoryAnchor, MapFilters } from '@/types'
import { useCategories } from '@/lib/useCategories'
import { useHospitals } from '@/lib/useHospitals'
import { useIsMobile } from '@/lib/useIsMobile'
import { resolveCapabilities } from '@/lib/categories'
import { community } from '@/community.config'

// A pending add/edit/report action on a listing within the current category.
type ListingAction =
  | { mode: 'create' }
  | { mode: 'edit'; listing: DirectoryResource }
  | { mode: 'report'; listing: DirectoryResource }

export type FindResourcesProps = {
  /** Which resource view is open — a category id, or one of the curated pages
   *  ('hospitals', 'eruv', 'zmanim'). This is the URL's slug segment, resolved
   *  and validated by the route before this renders.
   *
   *  It used to be state seeded from history.state and kept in sync by this
   *  component's own popstate listener, running alongside a second one in
   *  page.tsx. Both are gone: the URL says which view is open, so there is
   *  nothing left to keep in sync. */
  view: string
  /** The open category's approved listings, loaded by the route.
   *  `null` means the read failed — not an empty category. */
  listings: DirectoryResource[] | null
  anchor: DirectoryAnchor
  /** Expand this listing on arrival, same as `?item=` below — set by the
   *  [id] route (a listing's own canonical URL), which has no query param of
   *  its own to carry this. `?item=` still wins if both are somehow present,
   *  since it reflects an in-page navigation (e.g. Edit/Report closing) that
   *  happened after this screen mounted. */
  initialItemId?: string
  /** Up from any resource view. On mobile this is the only "up" there is —
   *  the home grid IS the index. On desktop it's the fallback for views that
   *  aren't a category's own "All resources" (the unknown/loading states
   *  below, which already say "Home") — see upToAllResources for the one
   *  that matters more, a category's own listings/hospitals/eruv/zmanim. */
  onUp: () => void
  /** Desktop only — opens the All Categories page. A category's own
   *  "All resources" back button goes here instead of `onUp` (home) on
   *  desktop, since desktop split what used to be one screen (the home grid
   *  doubling as the index) into two: a short home gateway, and this
   *  separate full index — see upToAllResources. Mobile has no such split
   *  (its home screen still IS the full index), so it's simply unused there. */
  onViewAllCategories?: () => void
  /** Navigate to the map screen pre-filtered to this category, carrying the
   *  directory's active search query and field filters. */
  onViewMap?: (categoryId: string, query?: string, filters?: MapFilters) => void
  // ── Query-string state, read by the caller (see FindResourcesConnected) ────
  // Reading it here directly via useSearchParams() used to force this
  // component's entire render — the whole directory, not just these few
  // refinements — behind a Suspense boundary that never resolves in the
  // static HTML a crawler or a no-JS visitor gets (see useSearchParams'
  // own "Prerendering" docs: it defers everything from the nearest Suspense
  // boundary down, not just the part that reads it). Taking these as props
  // instead means a caller with no query string at all (by far the common
  // case — a plain /community/category visit) can render this component with
  // no dynamic-API call anywhere in its tree, so it prerenders for real.
  // FindResourcesConnected supplies the live values once hydrated; the
  // Suspense fallback around it is this same component called with none of
  // these set, which is exactly the plain-URL render already needed.
  /** `?item=` */
  searchItem?: string | null
  /** `?q=` */
  searchQuery?: string | null
  /** `?hospital=` */
  searchHospital?: string | null
  /** `?form=` */
  searchForm?: string | null
  /** Pushes a change to these query params, keeping the path — a no-op
   *  default is safe: nothing in the fallback render (no query string yet)
   *  can be interacted with before hydration swaps in the real, connected
   *  version that supplies a real one. */
  onParamsChange?: (changes: Record<string, string | null>) => void
}

// A single resource detail view, opened by tapping a card on the home grid:
// a category's listings (with add/edit/report), or a curated page (About Your
// Hospital, Eruv, Zmanim), or the "suggest a category" form.
export default function FindResources({
  view,
  listings,
  anchor,
  initialItemId,
  onUp,
  onViewAllCategories,
  onViewMap,
  searchItem = null,
  searchQuery = null,
  searchHospital = null,
  searchForm = null,
  onParamsChange = () => {},
}: FindResourcesProps) {
  // Every "All resources" button below means what it says — the actual list
  // of every resource. On mobile that's still the home grid (onUp). On
  // desktop, home is now a short gateway with just three featured cards, not
  // the index, so "All resources" instead means the dedicated All Categories
  // page (see onViewAllCategories) — going to onUp there would silently
  // relabel "All resources" onto a screen that isn't one.
  const isMobile = useIsMobile()
  const upToAllResources = () => {
    if (!isMobile && onViewAllCategories) onViewAllCategories()
    else onUp()
  }
  // What upToAllResources above actually goes to, for the Up button's own
  // label — mobile has no separate "All resources" page to name (see the
  // comment above), so naming the button after the real destination avoids
  // promising an index screen mobile doesn't have.
  const upToAllResourcesLabel = isMobile ? 'Home' : 'All resources'
  // Zmanim is a city-wide resource. It anchors on the visitor's typed address
  // when set, otherwise on the community's configured center + label — so it
  // works for any community, with or without hospitals.
  const zmanimCoords = anchor.coords ?? community.mapCenter
  const locationLabel = anchor.label || community.region

  // The listing being edited or reported. Only the *subject* is state — whether
  // a form is open at all is `?form=` in the URL (see formOpen below), so
  // browser back closes it. The listing itself can't live in the URL: the form
  // needs the whole record, not an id it would have to re-fetch.
  const [actionSubject, setActionSubject] = useState<ListingAction | null>(null)
  const categories = useCategories()
  const hospitals = useHospitals() ?? []

  // Started as soon as a category with Add/Edit loads (below), not only once
  // the visitor opens the form — the Turnstile challenge takes a few seconds
  // to resolve, so kicking it off while they're still browsing the list means
  // it's usually already solved by the time they hit Submit, instead of
  // making Add/Edit open into a multi-second "Verifying…" wait every time.
  const [turnstileToken, setTurnstileToken] = useState('')
  const turnstileRef = useRef<TurnstileHandle>(null)
  // ── Sub-view state, read from the query string ─────────────────────────────
  // These were four useStates seeded from history.state and reset by the
  // popstate handler above. As query params they survive a reload, make each
  // sub-view a real shareable link, and get browser back/forward for free.
  // Supplied by FindResourcesConnected (see searchItem etc.'s own doc above),
  // not read directly here.
  //
  //   ?item=<id>      expand this listing on arrival
  //   ?q=<text>       pre-fill the category's search box
  //   ?hospital=<id>  show that hospital's About page
  //   ?form=<mode>    an add/edit/report form is open over the list
  const reopenItemId = searchItem ?? initialItemId ?? null
  const initialSearch = searchQuery
  const hospitalDetailId = searchHospital

  const setParams = onParamsChange

  // A form is only open while its param says so, so browser back closes it
  // without this component listening for anything.
  //
  // Derived rather than synced: an effect that cleared the subject whenever the
  // param went away would be a second source of truth chasing the first, and
  // would render one frame of a form the URL says is closed. Reading them
  // together means there is no in-between state to get wrong.
  //
  // A deep link (e.g. Edit/Report tapped on a home-screen search result) never
  // went through openAction, so actionSubject is still null on first render —
  // but `listings` arrived with this screen as a prop, not fetched after
  // mount, so the listing named by ?item= is already in hand and edit/report
  // can be resolved from the URL alone, same as reopenItemId already is for
  // the expanded card.
  const formParam = searchForm
  const deepLinkListing =
    (formParam === 'edit' || formParam === 'report') && reopenItemId
      ? (listings?.find((l) => l.id === reopenItemId) ?? null)
      : null
  const action =
    formParam !== null
      ? (actionSubject ??
        // 'create' deep-links straight in with no listing to resolve first —
        // unlike edit/report, which need `reopenItemId` to look one up. This
        // is what lets the home screen's Add/Edit/Report picker (HomeBreak)
        // land directly on the create form via `?form=create`, the same way
        // a search result's Edit/Report button already deep-links into
        // those.
        (formParam === 'create'
          ? ({ mode: 'create' } as ListingAction)
          : deepLinkListing
            ? ({ mode: formParam, listing: deepLinkListing } as ListingAction)
            : null))
      : null

  // Open one hospital's About page (from the Hospitals list).
  function openHospital(id: string) {
    setParams({ hospital: id })
  }

  // Up from a hospital's About page → back to the Hospitals list.
  const goToHospitals = () => {
    setParams({ hospital: null })
  }

  // Open a listing action (create/edit/report form). Pushes its own history
  // entry so browser-back from the form lands on the category list, not home.
  function openAction(act: ListingAction) {
    setActionSubject(act)
    setParams({
      form: act.mode,
      // Re-expands the relevant card when the form closes.
      ...(act.mode === 'edit' || act.mode === 'report' ? { item: act.listing.id } : {}),
    })
  }

  // Up from a listing form / report form → the category list it was opened from
  // (the path is still the category; `item` re-expands the relevant card).
  const goToCategoryList = () => {
    setActionSubject(null)
    setParams({ form: null })
  }

  // ── Special (non-category) detail views ─────────────────────────────────────
  if (view === 'hospitals' && !hospitalDetailId) {
    return <HospitalsDirectory anchor={anchor} onSelect={openHospital} onUp={upToAllResources} upLabel={upToAllResourcesLabel} onViewMap={onViewMap ? () => onViewMap('__hospitals__') : undefined} />
  }
  if (view === 'hospitals' && hospitalDetailId) {
    // The hospital chosen from the list; its name (not the address) is the subtitle.
    // (Patient feature — hospitals is non-empty whenever this view is reachable.)
    const id = hospitalDetailId ?? hospitals[0]?.id ?? ''
    const hospital = hospitals.find((h) => h.id === id)
    const medical = categories?.find((c) => c.kind === 'medical')
    return (
      <AboutYourHospital
        hospitalName={hospital?.name ?? ''}
        info={hospital?.info}
        onUp={goToHospitals}
        upLabel={medical?.pluralLabel}
      />
    )
  }
  if (view === 'eruv') {
    const eruv = categories?.find((c) => c.kind === 'eruv')
    return <EruvInfo eruvim={eruvim} onUp={upToAllResources} upLabel={upToAllResourcesLabel} title={eruv?.pluralLabel} />
  }
  if (view === 'zmanim') {
    // Pass raw coords (the visitor's address, or the community's center) so the
    // API computes zmanim directly — no hospital lookup.
    const zmanim = categories?.find((c) => c.kind === 'zmanim')
    return (
      <ZmanimCard
        key={locationLabel}
        coords={zmanimCoords}
        locationLabel={locationLabel}
        onUp={upToAllResources}
        upLabel={upToAllResourcesLabel}
        title={zmanim?.pluralLabel}
      />
    )
  }
  // ── Database-backed categories (with add / edit / report) ───────────────────
  const category = view ? categories?.find((c) => c.id === view && c.kind === 'listing') : undefined
  if (category) {
    const caps = resolveCapabilities(category.capabilities)
    // Kept mounted across list ⇄ form transitions within this category (same
    // JSX slot every render, so React never tears it down between them) —
    // that's what lets the challenge finish in the background before Add/Edit
    // is even opened. Skipped entirely when neither action is available.
    const sharedTurnstileWidget = (caps.add || caps.edit) && (
      <TurnstileWidget ref={turnstileRef} onVerify={setTurnstileToken} />
    )
    const sharedTurnstile = { token: turnstileToken, reset: () => { turnstileRef.current?.reset(); setTurnstileToken('') } }

    if (action?.mode === 'create') {
      return (
        <>
          {sharedTurnstileWidget}
          <ListingForm category={category} mode="create" onUp={goToCategoryList} onSubmitted={goToCategoryList} sharedTurnstile={sharedTurnstile} />
        </>
      )
    }
    if (action?.mode === 'edit') {
      return (
        <>
          {sharedTurnstileWidget}
          <ListingForm category={category} mode="edit" existing={action.listing} onUp={goToCategoryList} onSubmitted={goToCategoryList} sharedTurnstile={sharedTurnstile} />
        </>
      )
    }
    if (action?.mode === 'report') {
      return <ReportListing listing={action.listing} upLabel={category.pluralLabel} onUp={goToCategoryList} onSubmitted={goToCategoryList} />
    }
    return (
      <>
        {sharedTurnstileWidget}
        <ResourceLoader
          key={category.id + (initialSearch ?? '')}
          category={category}
          items={listings}
          anchor={anchor}
          reopenItemId={reopenItemId}
          initialSearch={initialSearch ?? undefined}
          onUp={upToAllResources}
          upLabel={upToAllResourcesLabel}
          onAdd={() => openAction({ mode: 'create' })}
          onEdit={(listing) => openAction({ mode: 'edit', listing })}
          onReport={(listing) => openAction({ mode: 'report', listing })}
          onViewMap={onViewMap ? (query, filters) => onViewMap(category.id, query, filters) : undefined}
        />
      </>
    )
  }

  // A category-id view whose data hasn't loaded yet.
  if (view && categories === null) {
    return (
      <div>
        <UpButton label="Home" onClick={onUp} />
        <p className="text-muted text-sm">Loading…</p>
      </div>
    )
  }

  // Unknown / empty view — nothing to show; offer a way back to the grid.
  return (
    <div>
      <UpButton label="Home" onClick={onUp} />
      <p className="text-muted text-sm">This resource isn’t available. Head back to browse everything.</p>
    </div>
  )
}
