'use client'

import { useEffect, useRef, useState } from 'react'
import AboutYourHospital from '@/components/tabs/AboutYourHospital'
import { eruvim } from '@/data/resources'
import HospitalsDirectory from '@/components/resources/HospitalsDirectory'
import ResourceLoader from '@/components/resources/ResourceLoader'
import ListingForm from '@/components/resources/ListingForm'
import ReportListing from '@/components/resources/ReportListing'
import ActionDialog from '@/components/resources/ActionDialog'
import MobileSheet from '@/components/resources/MobileSheet'
import EruvInfo from '@/components/resources/EruvInfo'
import ZmanimCard from '@/components/ZmanimCard'
import UpButton from '@/components/UpButton'
import TurnstileWidget, { type TurnstileHandle } from '@/components/TurnstileWidget'
import type { DirectoryResource, DirectoryAnchor, MapFilters } from '@/types'
import { useCategories } from '@/lib/useCategories'
import { useHospitals } from '@/lib/useHospitals'
import { resolveCapabilities, bandImageFor } from '@/lib/categories'
import { getCategoryColor } from '@/lib/categoryColor'
import { community } from '@/community.config'
import { useIsMobile } from '@/lib/useIsMobile'

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
  /** Up from any resource view — always home. Both mobile and desktop have a
   *  real, complete category index on the home screen (mobile's own grid;
   *  desktop's "Browse everything" — see Landing.tsx), so there's no longer
   *  a separate "All resources" destination to distinguish from home. */
  onUp: () => void
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
  /** `?openNow=1` */
  searchOpenNow?: string | null
  /** Every raw query param, for the category's own `?f_<key>=`/`?sel_<key>=`
   *  boolean/select field filters — see GenericDirectory's own doc on
   *  `initialFilters`, which this becomes. A plain object (not the
   *  `URLSearchParams` FindResourcesConnected itself reads) so this file
   *  doesn't need `next/navigation` just to describe its own props. */
  searchFilters?: Record<string, string> | null
  /** `?hospital=` */
  searchHospital?: string | null
  /** `?form=` */
  searchForm?: string | null
  /** `?davening=` — "1" opens "All davening times" on arrival. See
   *  GenericDirectory's own doc on `openDaveningModal`, which this becomes. */
  searchDavening?: string | null
  /** `?day=` — filters that modal to one day on arrival. See
   *  GenericDirectory's own doc on `initialDaveningDay`, which this becomes. */
  searchDaveningDay?: string | null
  /** Pushes a change to these query params, keeping the path — a no-op
   *  default is safe: nothing in the fallback render (no query string yet)
   *  can be interacted with before hydration swaps in the real, connected
   *  version that supplies a real one. `opts.replace` swaps `router.push`
   *  for `router.replace` — used by the directory's own search/"Open now"
   *  sync so every keystroke or toggle flip doesn't become its own history
   *  entry, unlike the item/form navigations below that deliberately push. */
  onParamsChange?: (changes: Record<string, string | null>, opts?: { replace?: boolean }) => void
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
  onViewMap,
  searchItem = null,
  searchQuery = null,
  searchOpenNow = null,
  searchFilters = null,
  searchHospital = null,
  searchForm = null,
  searchDavening = null,
  searchDaveningDay = null,
  onParamsChange = () => {},
}: FindResourcesProps) {
  // Zmanim is a city-wide resource. It anchors on the visitor's typed address
  // when set, otherwise on the community's configured center + label — so it
  // works for any community, with or without hospitals.
  const zmanimCoords = anchor.coords ?? community.mapCenter
  const locationLabel = anchor.label || community.region

  // Gates Add/Edit/Report's presentation below — a bottom sheet layered over
  // the still-mounted directory on mobile, a centered dialog over it on
  // desktop (see MobileSheet's and ActionDialog's own docs).
  const isMobile = useIsMobile()
  const categories = useCategories()
  const hospitals = useHospitals() ?? []

  // Started when an Add/Edit form first opens (see `turnstileWanted` below),
  // not when the category page loads. It used to start on load, on the theory
  // that the challenge takes a few seconds and would be solved before Submit —
  // but that meant every visitor to every category page, including the great
  // majority who only browse, loaded Cloudflare's script and ran a challenge
  // (a third-party script plus two or three iframes) for a form they never
  // opened. Submit is disabled until the token arrives anyway (ListingForm),
  // and the challenge runs while they fill the form in, which takes far longer
  // than it does.
  const [turnstileToken, setTurnstileToken] = useState('')
  const turnstileRef = useRef<TurnstileHandle>(null)
  // Sticky: once wanted it stays mounted, so closing and reopening the form
  // doesn't start a second challenge.
  const [turnstileWanted, setTurnstileWanted] = useState(false)
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
  //   ?davening=1     "All davening times" is open over the list
  //   ?day=<key>      that modal is filtered to one day
  const reopenItemId = searchItem ?? initialItemId ?? null
  const initialSearch = searchQuery
  const initialOpenNow = searchOpenNow === '1'
  const openDaveningModal = searchDavening === '1'
  const initialDaveningDay = searchDaveningDay ?? undefined
  const hospitalDetailId = searchHospital

  const setParams = onParamsChange

  // `formParam`/`deepLinkListing` resolve what a fresh page load or shared
  // link's `?form=`/`?item=` names — `listings` arrived with this screen as a
  // prop, not fetched after mount, so the listing is already in hand and
  // doesn't need a round trip to look up.
  const formParam = searchForm
  const deepLinkListing =
    (formParam === 'edit' || formParam === 'report') && reopenItemId
      ? (listings?.find((l) => l.id === reopenItemId) ?? null)
      : null
  // 'create' deep-links straight in with no listing to resolve first —
  // unlike edit/report, which need `reopenItemId` to look one up. This is
  // what lets the home screen's Add/Edit/Report picker (UpdateListingsCard)
  // land directly on the create form via `?form=create`, the same way a
  // search result's Edit/Report button already deep-links into those.
  const actionFromUrl: ListingAction | null =
    formParam === 'create'
      ? { mode: 'create' }
      : (formParam === 'edit' || formParam === 'report') && deepLinkListing
        ? { mode: formParam, listing: deepLinkListing }
        : null

  // The listing being edited or reported, AND whether the form is open at
  // all — both live in this one piece of local state now, seeded from the
  // URL once on mount (the deep-link case above) and otherwise set directly
  // by openAction/goToCategoryList below. This used to be re-derived from
  // `?form=`/`?item=` on every render instead (only the listing itself was
  // state), which is what made "browser back closes the form" work with no
  // effect of its own — but it also meant OPENING the form had to go through
  // a real Next.js navigation (router.push) for `?form=` to come back around
  // into this render, and that navigation re-renders everything on this
  // route (FindResources → ResourceLoader → GenericDirectory → the whole
  // listing grid) — confirmed live as the grid visibly reloading behind the
  // dialog the instant Edit/Report/Add opened, unlike tapping the listing
  // itself (GenericDirectory's own onExpandedChange), which only ever
  // touches local state and a `history.replaceState` the URL bar shows but
  // nothing reads back. openAction/goToCategoryList now use that same
  // `replace: true` path, so this needs to stop depending on the URL
  // round-tripping back in to know it's open.
  const [actionSubject, setActionSubject] = useState<ListingAction | null>(actionFromUrl)

  // The one place this still reads the URL back: closing the form on
  // browser back. `openAction`/`goToCategoryList`'s own `replace: true`
  // never changes `formParam` (a raw history.replaceState the router doesn't
  // see — see their own docs), so this effect never fires in response to
  // them; it only fires on a REAL navigation, e.g. back landing on a URL
  // with no `?form=`. A brief extra frame of the form still visible while
  // that navigation resolves is the tradeoff for not re-deriving `actionSubject`
  // from the URL on every render any more (see above) — the same one
  // GenericDirectory's own listing-expand already accepted for "back" on a
  // card, just spelled out as an effect here because closing has to
  // positively clear local state rather than just stop rendering it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (formParam === null) setActionSubject(null)
  }, [formParam])

  const action = actionSubject

  // Adjusting state during render, not in an effect: React re-renders this
  // component immediately with the new value, before anything is painted, so
  // a deep-linked form (?form=create) mounts the widget in its very first
  // committed render. Report isn't included — it mounts its own widget.
  if (!turnstileWanted && (action?.mode === 'create' || action?.mode === 'edit')) {
    setTurnstileWanted(true)
  }

  // What ResourceLoader/GenericDirectory actually get told to auto-open —
  // `reopenItemId` itself stays the raw `?item=` value above (still needed
  // to resolve deepLinkListing regardless of whether a form is open), but
  // GenericDirectory's own reopenItemId effect opens whatever id it's given
  // unconditionally, with no way to tell "navigated here to view this" apart
  // from "this happens to be the listing an edit/report action names". Left
  // as the raw value, editing/reporting a collapsed row silently expanded
  // its detail dialog behind the one actually visible the whole time —
  // confirmed live as two overlapping dialogs, revealed once the visible
  // one closed. Suppressed here specifically (not by leaving `item` out of
  // openAction's own URL update) so the reload/deep-link resolution above
  // keeps working unchanged.
  const cardReopenItemId =
    (action?.mode === 'edit' || action?.mode === 'report') && action.listing.id === reopenItemId ? null : reopenItemId

  // Open one hospital's About page (from the Hospitals list).
  function openHospital(id: string) {
    setParams({ hospital: id })
  }

  // Up from a hospital's About page → back to the Hospitals list.
  const goToHospitals = () => {
    setParams({ hospital: null })
  }

  // Open a listing action (create/edit/report form). `replace: true` — see
  // actionSubject's own doc above for why: a plain setParams call goes
  // through router.push, which re-renders this whole route (including the
  // listing grid) behind the dialog that just opened.
  function openAction(act: ListingAction) {
    setActionSubject(act)
    setParams(
      {
        form: act.mode,
        // `item` is how edit/report resolve WHICH listing on a reload or a
        // shared deep link (see deepLinkListing above) — not a request to
        // expand its card. GenericDirectory's own reopenItemId effect can't
        // tell those two reasons apart, though: it opens whatever `?item=`
        // names unconditionally. Reached only from a COLLAPSED row's kebab or
        // a deep link now (an already-expanded card's own Edit/Report morphs
        // its dialog in place instead — see ListingDetailModal's doc — and
        // never calls this), so the card was never genuinely open before
        // this ran; goToCategoryList clears `item` back out on close so it
        // doesn't linger as a false "reopen this" signal once the reason it
        // was there (this form) is gone. Confirmed live: without that, a
        // collapsed row's Edit — cancelled — silently expanded into the full
        // detail dialog anyway, both dialogs open the whole time behind the
        // one actually visible.
        ...(act.mode === 'edit' || act.mode === 'report' ? { item: act.listing.id } : {}),
      },
      { replace: true },
    )
  }

  // Up from a listing form / report form → the category list it was opened
  // from. Also undoes openAction's own `item` (see its comment) for
  // edit/report specifically — never for 'create', which doesn't set it in
  // the first place and may be layered over a genuinely-expanded card that
  // should stay expanded once this closes (e.g. "Add" clicked while
  // already viewing a different listing's details). `replace: true` to
  // match openAction opening it — see that function's own doc.
  const goToCategoryList = () => {
    setActionSubject(null)
    setParams(
      {
        form: null,
        ...(action?.mode === 'edit' || action?.mode === 'report' ? { item: null } : {}),
      },
      { replace: true },
    )
  }

  // ── Special (non-category) detail views ─────────────────────────────────────
  if (view === 'hospitals' && !hospitalDetailId) {
    return <HospitalsDirectory anchor={anchor} onSelect={openHospital} onUp={onUp} onViewMap={onViewMap ? () => onViewMap('__hospitals__') : undefined} />
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
    return (
      <EruvInfo
        eruvim={eruvim}
        onUp={onUp}
        title={eruv?.pluralLabel}
        icon={eruv?.icon}
        color={eruv ? getCategoryColor(categories, eruv.id) : undefined}
        bandImageUrl={eruv ? bandImageFor(eruv) : undefined}
      />
    )
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
        onUp={onUp}
        title={zmanim?.pluralLabel}
        icon={zmanim?.icon}
        color={zmanim ? getCategoryColor(categories, zmanim.id) : undefined}
        bandImageUrl={zmanim ? bandImageFor(zmanim) : undefined}
      />
    )
  }
  // ── Database-backed categories (with add / edit / report) ───────────────────
  const category = view ? categories?.find((c) => c.id === view && c.kind === 'listing') : undefined
  if (category) {
    const caps = resolveCapabilities(category.capabilities)
    // Kept mounted across list ⇄ form transitions within this category (same
    // JSX slot every render, so React never tears it down between them), once
    // an Add/Edit form has opened. Skipped entirely when neither action is
    // available, and until one is opened.
    const sharedTurnstileWidget = (caps.add || caps.edit) && turnstileWanted && (
      <TurnstileWidget ref={turnstileRef} onVerify={setTurnstileToken} />
    )
    const sharedTurnstile = { token: turnstileToken, reset: () => { turnstileRef.current?.reset(); setTurnstileToken('') } }

    // Add/Edit/Report (desktop: a centered dialog; mobile: a bottom sheet —
    // see ActionDialog's and MobileSheet's own docs) all layer over a
    // ResourceLoader that stays mounted the whole time, on both platforms.
    // Both platforms used to swap in a full-screen form for at least one of
    // these three instead (mobile for all of them, desktop for Add alone),
    // before the map's own MapPlaceDetail (whose Edit/Report already live
    // inside its persistent bottom sheet) made that mismatch obvious. Report
    // itself mostly never reaches this any more — the collapsed row's own
    // kebab opens ReportSheet on mobile directly (see GenericListingCard's
    // doc) — this is what a deep link or search-result Report button still
    // falls back to.
    return (
      <>
        {sharedTurnstileWidget}
        <ResourceLoader
          key={category.id + (openDaveningModal ? `-davening${initialDaveningDay ?? ''}` : '')}
          category={category}
          items={listings}
          anchor={anchor}
          reopenItemId={cardReopenItemId}
          initialSearch={initialSearch ?? undefined}
          initialOpenNow={initialOpenNow}
          initialFilters={searchFilters}
          openDaveningModal={openDaveningModal}
          initialDaveningDay={initialDaveningDay}
          onUp={onUp}
          upLabel="Home"
          onAdd={() => openAction({ mode: 'create' })}
          onEdit={(listing) => openAction({ mode: 'edit', listing })}
          onReport={(listing) => openAction({ mode: 'report', listing })}
          onParamsChange={setParams}
        />
        {/* `action` (and therefore which overlay, if either, is actually
            open) already narrows correctly against `isMobile` here —
            re-checked per-branch below only because TypeScript can't carry
            that narrowing through sibling JSX on its own. */}
        {isMobile ? (
          <>
            {/* draggable on all three: a consistent grab-anywhere,
                slide-to-dismiss feel across Add/Edit/Report, same reasoning
                ReportSheet's own doc gives for making its short one-field
                form draggable too even though it rarely needs `full`'s
                extra room — matching behavior reads as one shell, not as
                Edit having gotten a nicer sheet than its siblings. */}
            <MobileSheet isOpen={action?.mode === 'create'} onClose={goToCategoryList} title={`Add a ${category.label}`} draggable>
              {action?.mode === 'create' && (
                <ListingForm
                  category={category}
                  mode="create"
                  onUp={goToCategoryList}
                  onSubmitted={goToCategoryList}
                  sharedTurnstile={sharedTurnstile}
                  embedded
                />
              )}
            </MobileSheet>
            <MobileSheet isOpen={action?.mode === 'edit'} onClose={goToCategoryList} title="Suggest an edit" draggable>
              {action?.mode === 'edit' && (
                <ListingForm
                  category={category}
                  mode="edit"
                  existing={action.listing}
                  onUp={goToCategoryList}
                  onSubmitted={goToCategoryList}
                  sharedTurnstile={sharedTurnstile}
                  embedded
                />
              )}
            </MobileSheet>
            <MobileSheet isOpen={action?.mode === 'report'} onClose={goToCategoryList} title="Report a problem" draggable>
              {action?.mode === 'report' && (
                <ReportListing
                  listing={action.listing}
                  onUp={goToCategoryList}
                  onSubmitted={goToCategoryList}
                  embedded
                />
              )}
            </MobileSheet>
          </>
        ) : (
          <>
            <ActionDialog isOpen={action?.mode === 'create'} onClose={goToCategoryList} title={`Add a ${category.label}`}>
              {action?.mode === 'create' && (
                <ListingForm
                  category={category}
                  mode="create"
                  onUp={goToCategoryList}
                  onSubmitted={goToCategoryList}
                  sharedTurnstile={sharedTurnstile}
                  embedded
                />
              )}
            </ActionDialog>
            <ActionDialog isOpen={action?.mode === 'edit'} onClose={goToCategoryList} title="Suggest an edit">
              {action?.mode === 'edit' && (
                <ListingForm
                  category={category}
                  mode="edit"
                  existing={action.listing}
                  onUp={goToCategoryList}
                  onSubmitted={goToCategoryList}
                  sharedTurnstile={sharedTurnstile}
                  embedded
                />
              )}
            </ActionDialog>
            <ActionDialog isOpen={action?.mode === 'report'} onClose={goToCategoryList} title="Report a problem">
              {action?.mode === 'report' && (
                <ReportListing
                  listing={action.listing}
                  onUp={goToCategoryList}
                  onSubmitted={goToCategoryList}
                  embedded
                />
              )}
            </ActionDialog>
          </>
        )}
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
