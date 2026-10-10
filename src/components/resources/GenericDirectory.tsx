'use client'

import { Fragment, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, ViewTransition, type ReactNode } from 'react'
import type { DirectoryResource } from '@/types'
import { resolveCapabilities, selectValues, bandImageFor, type CategoryConfig } from '@/lib/categories'
import { hoursOpenNow, businessClosure } from '@/lib/hours'
import { useNow } from '@/lib/useNow'
import { isMinyanim } from '@/lib/davening'
import type { Minyan } from '@/lib/davening'
import DirectoryHeader from './DirectoryHeader'
import { TellAboutContext } from './tellAbout'
import DistanceNote from './DistanceNote'
import { NextMinyans } from './nextMinyans'
import { CategoryBandFrame, CategoryBandBadge } from './CategoryBandFrame'
import FiltersSheet from './FiltersSheet'
import ListHeading, { ClosedGroupLine, GroupHeading } from './ListHeading'
import { groupListings, parseGroupBy, type ListGroup } from '@/lib/listGroups'
import { candlesToday, isVouchedFor } from '@/lib/listingRow'
import { useZmanim } from '@/lib/useZmanim'
import { usePersistedState } from '@/lib/usePersistedState'
import { useSharedPreference } from '@/lib/useSharedPreference'
import { GenericListingCard, type GenericListingCardHandle } from './GenericListingCard'
import MinyanimView from './MinyanimView'
import { PlusIcon } from '@/components/icons'
import { useIsMobile } from '@/lib/useIsMobile'
import { useScrollShowHide, useSetScreenHeader } from '@/lib/headerVisibility'
import { foundFor, searchAsk } from '@/lib/askSearch'
import { withoutTerms } from '@/lib/ask'
import { neighborhoodsFor, placeName, townsFrom } from '@/lib/places'
import { readerPlaces } from '@/lib/questionReader'
import { needsReading, ownFrom, readingAnswers, readingChips, readingLoses, readingOffers, searchReading } from '@/lib/readingSearch'
import { useReading } from '@/lib/useReading'
import { ListingOnwardContext, type ListingOnwardSource } from './listingOnward'
import ListingColumn from './ListingColumn'
import UpvoteButton from './UpvoteButton'
import { useActiveCommunity, useOptionalCommunitySlug } from '@/lib/communityContext'
import { travelCompare } from '@/lib/listingTravel'
import { useLogSearchMiss } from '@/lib/useLogSearchMiss'
import CategoryAsk from './CategoryAsk'
import NextMinyanCard from './NextMinyanCard'
import CategoryMap, { createHighlight, useWide } from './CategoryMap'
import { WalkOnMapContext, type WalkShown } from './walkOnMap'
import RowLookSwitch, { useRowLook } from './RowLookSwitch'
import { useListMapSplit } from './useListMapSplit'
import { mapQueryString, routes } from '@/lib/routes'
import QuestionCard, { useAskedPlaces } from './QuestionCard'
import { parseQuestionCard, pickQuestion } from '@/lib/questionCards'
import { ui } from '@/lib/uiConfig'
import { useOptionalLocation } from '@/lib/locationContext'
import { usePinned } from '@/lib/pinnedContext'
import { useCategories } from '@/lib/useCategories'
import { didArriveViaBackForward } from '@/lib/backForwardNavigation'
import { getCategoryColor } from '@/lib/categoryColor'
import { CategoryGlyph } from '@/lib/categoryIcons'
import { SwipeRowGroup } from '@/components/SwipeRow'
import dynamic from 'next/dynamic'
import { tellUsPlaceholder } from '@/lib/tellUs'

/** How a change to the address is recorded. `replace`: in place, no step.
 *  `step`: a step the browser's Back undoes, named in history.state so the
 *  page's own way back can take that same step (the Minyanim view, Oct 6).
 *  Neither: a navigation of its own. */
export type ParamsOpts = { replace?: boolean; step?: string }
const MINYANIM_STEP = 'minyanim'
const LISTING_STEP = 'listing'

// Loaded on the first tap of "+": nobody browsing pays for the box.
const TellUsSheet = dynamic(() => import('@/components/TellUsSheet'))

type Props = {
  category: CategoryConfig
  items: DirectoryResource[]
  /** Shown under the category title — hospital name for patients, typed address
   *  for community. Mirrors the subtitle pattern in About Your Hospital. */
  anchorLabel?: string
  /** When true and no anchorLabel, prompt the visitor to set their location. */
  addressPrompt?: boolean
  /** A listing to mount already expanded (restored after returning from a form). */
  reopenItemId?: string | null
  /** The listing this page's own link names (/philly/food/judah-…), as
   *  opposed to a `?item=` reopening one. On a phone it's a page of its own
   *  until closed; on any screen, closing it takes the address back to the
   *  category's, so a reload doesn't bring it back. */
  linkedItemId?: string | null
  /** The search that found `reopenItemId` elsewhere (the home search, as
   *  `?match=`). Doesn't filter this list; only marks, in that listing,
   *  what the search matched. */
  reopenMatch?: string | null
  /** Seed the search box (e.g. "cheese" from a landing "Places" result). */
  initialSearch?: string
  /** Seed the "Open now" filter — `?openNow=1`, see onParamsChange below. */
  initialOpenNow?: boolean
  /** Seed the boolean/select field filters — the category's OWN raw query
   *  params (`?f_<fieldKey>=1` for a boolean, `?sel_<fieldKey>=a,b` for a
   *  select), keyed generically rather than as named props like
   *  searchQuery/searchOpenNow above: which fields exist (and are
   *  filterable) is per-category, decided by `category.detailFields`, not
   *  fixed ahead of time the way "search text" and "open now" are for every
   *  category. Extra/unrecognized keys (params for a DIFFERENT category,
   *  or `q`/`openNow` themselves) are simply ignored when read. */
  initialFilters?: Record<string, string> | null
  /** Mount on the Minyanim view (every minyan by time) instead of the list
   *  of shuls: the home screen's DaveningTimesCard and Shabbos card link
   *  here with `?davening=1`, so "All davening times" lands on what it
   *  names, not a bare category page with the same button to find again.
   *  No-op for a category with no minyanim field. */
  openMinyanimView?: boolean
  /** Open the Minyanim view on this weekday (`?day=fri`) — DaveningTimesCard
   *  sets it to tomorrow's when ITS OWN result is tomorrow's earliest
   *  minyan (result.isTomorrow), so a visitor who followed a "tomorrow"
   *  time here doesn't land on Today, with nothing left and no visible
   *  reason why. Comma-separated keys are allowed (",holiday" is appended
   *  on a secular holiday); the first that's one of the view's days wins.
   *  Only applied on arrival (see the `key` this feeds in
   *  FindResources.tsx). */
  initialDaveningDay?: string
  onUp: () => void
  /** Unused since Oct 5: every Add on the page opens the "+ Add" box. Still
   *  handed in by FindResources, whose `?form=create` links open the older
   *  add (ListingAdd); both go when those links move to the box. */
  onAdd?: () => void
  onEdit: (item: DirectoryResource) => void
  /** Pushes the search text / "Open now" toggle into the URL (`?q=`,
   *  `?openNow=`) as they change, so a search + filter combination is a
   *  shareable link — e.g. sending someone `?q=bagel&openNow=1` opens the
   *  category with "bagel" already typed and Open Now already on. `replace`
   *  (not push) for both: every keystroke or toggle flip becoming its own
   *  history entry would make browser-back a nightmare, unlike the
   *  item/form navigations elsewhere in this tree that deliberately push.
   *  Optional and a no-op by default, same reasoning as FindResources' own
   *  onParamsChange — nothing here is interactive before hydration anyway. */
  onParamsChange?: (changes: Record<string, string | null>, opts?: ParamsOpts) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GenericDirectory({ category, items, anchorLabel, addressPrompt, reopenItemId, linkedItemId = null, reopenMatch = null, initialSearch, initialOpenNow, initialFilters, openMinyanimView, initialDaveningDay, onUp, onEdit, onParamsChange }: Props) {
  // Hands the shared header this screen's own title + "up" handler — on
  // mobile, SiteHeader shows "‹ {category.pluralLabel}" in place of the site
  // name while this is mounted, and reverts automatically on unmount (see
  // useSetScreenHeader's own doc). Always active: every caller of this
  // component (categories, hospitals, synagogues) is a second-level screen a
  // visitor drilled into, never the home grid itself. Called further down,
  // once it's known whether a listing is this screen (a phone, from a link).

  const { isPinned } = usePinned()
  // Captured once, on this component's very first render — see
  // backForwardNavigation's own module doc. A visitor who presses back/
  // forward should land on a blank slate here even though the URL they're
  // arriving on still carries whatever was filtered before (browser history
  // doesn't forget a replaceState'd URL just because you navigated away and
  // back — see the fuller reasoning in the effects below); a real
  // navigation — a clicked link, a shared URL, typing an address — is
  // exactly the case that SHOULD still hydrate from it, since that's what
  // makes a filtered link shareable in the first place.
  const [arrivedViaBackForward] = useState(() => didArriveViaBackForward())
  const [search, setSearch] = useState(arrivedViaBackForward ? '' : (initialSearch ?? ''))
  const [boolFilters, setBoolFilters] = useState<Record<string, boolean>>({})
  // Multi-select: each key maps to the set of chosen values (empty = no filter).
  const [selectFilters, setSelectFilters] = useState<Record<string, string[]>>({})

  // Which card currently has its listing open — the desktop column or the
  // mobile sheet. On a phone the floating Add button steps aside while it's
  // up: the listing's own row (Suggest an edit, its overflow) passes under
  // it as the sheet scrolls. On desktop nothing passes under it, so it stays
  // (Oct 6: "not seeing the add button"), for adding anything; the listing
  // itself is Suggest an edit's, which opens the box about it
  // (ListingEditBar, via TellAboutContext).
  const [openDialogItemId, setOpenDialogItemId] = useState<string | null>(null)
  const [openNow, setOpenNow] = useState(arrivedViaBackForward ? false : (initialOpenNow ?? false))
  // Drives the "Open now" filter below. Without it the filter answers for the
  // moment the page rendered, so a list narrowed to what's open at 4pm still
  // shows those places at 10pm. Null until the page has hydrated (see
  // useNow): nothing here guesses the time.
  const clock = useNow()
  const now = clock === null ? null : new Date(clock)

  // ── Apply a shared link's search/openNow/filters once they actually arrive ──
  // The lazy initializers above already cover the common case (this component
  // mounts with the real query string already known), but SlugScreen's
  // Suspense fallback can mount THIS SAME instance first with none of it read
  // yet (see FindResources' own doc on searchQuery etc.) — too late for a
  // lazy initializer to catch. Each of these applies its prop's arrival
  // exactly once, guarded by its own ref, rather than forcing a remount of
  // this whole component the way `openMinyanimView` below still does: once
  // this component started writing search-as-you-type / toggles / filter
  // picks BACK into these same props (see the sync effects further down), a
  // remount-on-prop-change would keep firing on every one of those self
  // writes and wipe out whatever the visitor had just set mid-session.
  const appliedInitialSearchRef = useRef(false)
  useEffect(() => {
    if (appliedInitialSearchRef.current || !initialSearch) return
    appliedInitialSearchRef.current = true
    if (arrivedViaBackForward) return
    // One-time application of an external value on arrival, guarded above —
    // not the "derive state from props on every render" pattern this lint
    // rule is otherwise right to flag.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearch(initialSearch)
  }, [initialSearch, arrivedViaBackForward])
  const appliedInitialOpenNowRef = useRef(false)
  useEffect(() => {
    if (appliedInitialOpenNowRef.current || !initialOpenNow) return
    appliedInitialOpenNowRef.current = true
    if (arrivedViaBackForward) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenNow(true)
  }, [initialOpenNow, arrivedViaBackForward])
  // `initialFilters` is `null` until FindResourcesConnected hydrates, then a
  // real (possibly empty) object from then on — see FindResources' own doc —
  // so that transition alone, not any specific key inside it, is the signal
  // to read it once. Reads `category.detailFields` directly rather than the
  // `filterableBooleans`/`filterableSelects` computed further down (this runs
  // before those are in scope, and duplicating the two-line filter here is
  // cheaper than reordering the whole component around it).
  const appliedInitialFiltersRef = useRef(false)
  useEffect(() => {
    if (appliedInitialFiltersRef.current || !initialFilters) return
    appliedInitialFiltersRef.current = true
    if (arrivedViaBackForward) return
    const bools: Record<string, boolean> = {}
    const sels: Record<string, string[]> = {}
    for (const f of category.detailFields) {
      if (f.filterable && f.type === 'boolean' && initialFilters[`f_${f.key}`] === '1') bools[f.key] = true
      if (f.filterable && f.type === 'select') {
        const raw = initialFilters[`sel_${f.key}`]
        if (raw) sels[f.key] = raw.split(',').filter(Boolean)
      }
    }
    // One-time application of an external value on arrival, guarded above by
    // appliedInitialFiltersRef — not the "derive state from props on every
    // render" pattern this lint rule is otherwise right to flag.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (Object.keys(bools).length > 0) setBoolFilters((prev) => ({ ...prev, ...bools }))
    if (Object.keys(sels).length > 0) setSelectFilters((prev) => ({ ...prev, ...sels }))
  }, [initialFilters, category, arrivedViaBackForward])
  // Resets this screen's own search/openNow/filters to blank, both in local
  // state and (via onParamsChange) back out to the address bar — what a
  // back/forward arrival should show, since the URL alone can't be trusted
  // to reflect "abandoned" vs. "still wanted" (see backForwardNavigation's
  // own module doc). A ref, read through by both effects below, rather than
  // a plain function: it closes over onParamsChange, which is often a fresh
  // closure every parent render, and neither effect should re-run just
  // because of that.
  const clearFiltersRef = useRef<() => void>(undefined)
  // Written in an effect, not during render (react-hooks/refs) — a render
  // can run more than once, or be thrown away, before it commits, so writing
  // to a ref here has to wait until it's actually committed. No dependency
  // array: this needs to stay current after EVERY render, the same reason
  // this is a ref instead of a plain function in the first place (see this
  // block's own doc above) — category/onParamsChange can be a fresh value
  // each render, and the two effects below only ever call this well after
  // it, never in the same commit, so ordinary (not layout) timing is fine.
  useEffect(() => {
    clearFiltersRef.current = () => {
      setSearch('')
      setOpenNow(false)
      setBoolFilters({})
      setSelectFilters({})
      const changes: Record<string, string | null> = { q: null, openNow: null }
      for (const f of category.detailFields) {
        if (f.filterable && f.type === 'boolean') changes[`f_${f.key}`] = null
        if (f.filterable && f.type === 'select') changes[`sel_${f.key}`] = null
      }
      onParamsChange?.(changes, { replace: true })
    }
  })
  // Covers the genuine-document-reload case: arrivedViaBackForward was
  // already true at THIS component's very first mount, so the URL needs
  // catching up to the blank state already rendered above. Deliberately
  // does NOT cover a subsequent same-document back/forward into an
  // already-visited category — see the popstate listener just below for
  // why that needs an entirely different mechanism, not a wider dependency
  // array here.
  useEffect(() => {
    if (!arrivedViaBackForward) return
    clearFiltersRef.current!()
    // Deliberately once per mount only — arrivedViaBackForward itself never
    // changes after mount, so there's nothing meaningful for this to react
    // to twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A category screen is NOT torn down and remounted when a visitor
  // navigates away and back to it — it's kept alive under React's own
  // <Activity> instead (see ResourceMap.tsx's and homeRevealSignal.ts's own
  // comments on the same mechanism for Home). Activity's actual contract,
  // confirmed live here (an instrumented effect logged a fresh "activated"
  // entry on every return visit, plain click or back/forward alike, while
  // the DOM node and this component's own state both survived unchanged):
  // effects tear down while hidden and RE-RUN when Activity reactivates the
  // subtree — the same "on a true first mount, and again whenever Activity
  // reactivates it" behavior homeRevealSignal.ts documents for Landing.
  //
  // That re-run is exactly the hook this needs, and unlike trying to catch
  // the navigation event itself (confirmed live, and the wrong shape of fix
  // regardless — this effect's own reactivation always happens one tick
  // after the navigation that caused it, so it can never observe that same
  // navigation firing), it needs no external signal at all: a ref survives
  // Activity's hide/reveal the same way state does, so "have I activated
  // before" is answerable from entirely inside this component. `initialXxx`
  // props are of no help on a reactivation regardless — confirmed live,
  // they're already-undefined by the time Activity reveals this screen
  // again, hydrated-once refs and all — so any later activation blanking
  // unconditionally is the right call, not just the achievable one.
  const hasActivatedBeforeRef = useRef(false)
  useEffect(() => {
    if (hasActivatedBeforeRef.current) clearFiltersRef.current!()
    hasActivatedBeforeRef.current = true
  }, [])

  // ── Sync search + "Open now" into the URL (see onParamsChange's own doc) ──
  // Skips the very first render on purpose: `search`/`openNow` there is just
  // `initialSearch`/`initialOpenNow` echoed back, and writing it out again
  // would be a pointless replace on every mount. Debounced for `search` so
  // typing doesn't fire a history replace per keystroke; `openNow` is a
  // single toggle, so it goes out immediately.
  const searchSyncedOnce = useRef(false)
  useEffect(() => {
    if (!searchSyncedOnce.current) {
      searchSyncedOnce.current = true
      return
    }
    const timer = setTimeout(() => {
      onParamsChange?.({ q: search.trim() || null }, { replace: true })
    }, 300)
    return () => clearTimeout(timer)
  }, [search, onParamsChange])
  const openNowSyncedOnce = useRef(false)
  useEffect(() => {
    if (!openNowSyncedOnce.current) {
      openNowSyncedOnce.current = true
      return
    }
    onParamsChange?.({ openNow: openNow ? '1' : null }, { replace: true })
  }, [openNow, onParamsChange])
  // Distance is meaningless with nothing to measure from, so this tracks the
  // anchor automatically — Popular while there's none, Distance the instant
  // one exists — until the visitor makes an explicit choice below, which
  // then sticks regardless of what the anchor does afterward.
  //
  // Deliberately not a one-time lazy initializer. A saved address (or live
  // tracking resuming) restores from localStorage in a POST-MOUNT effect —
  // see useStoredLocation — so anchorLabel is still empty on this
  // component's very first render even for a returning visitor who already
  // has a location saved. A lazy initializer would freeze on that empty
  // read and this screen would silently default to Popular forever; this
  // effect re-derives the default every time anchorLabel changes instead,
  // so the anchor arriving a beat after mount still flips it.
  const [sortByPopular, setSortByPopular] = useState(!anchorLabel)
  const touchedSort = useRef(false)
  useEffect(() => {
    if (touchedSort.current) return
    setSortByPopular(!anchorLabel)
  }, [anchorLabel])
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({})
  // The Filters sheet (see ListHeading and FiltersSheet).
  const [filtersOpen, setFiltersOpen] = useState(false)
  // A plain lazy initializer here would only ever see the FIRST render:
  // SlugScreen's Suspense fallback renders this tree once with the query
  // string not yet read (openMinyanimView is undefined then, same as
  // `initialSearch` is at that point — see FindResources' own doc), then
  // FindResourcesConnected hydrates and this same component instance
  // re-renders with the real value — too late for a lazy initializer to
  // catch. Solved the same way `initialSearch` already is: FindResources
  // folds `openMinyanimView` into the `key` it gives ResourceLoader, so
  // the value arriving forces a fresh mount of this whole subtree instead
  // of an update to the existing one, and the lazy initializer below runs
  // again with the real value.
  // Synagogues' Minyanim view (step 4, agreed Oct 1): every minyan by time,
  // in place of the list of shuls. `?davening=1` (the home page's and the
  // Next minyan card's "All davening times") arrives on it. It replaced
  // the old week-of-times dialog, which knew nothing of Yom Tov.
  const [minyanimViewOn, setMinyanimViewOn] = useState(!!openMinyanimView)
  // Same one-way-in problem `search`/`openNow` already solve above: without
  // this, switching back to Synagogues left `?davening=1` sitting in the
  // URL, so a reload reopened the view the visitor had already left.
  // Clears `day` alongside `davening` — a stale `?day=` with no view to
  // pick a day in is meaningless on its own. Skips the
  // first render for the same reason `openNowSyncedOnce` does: the initial
  // value here is just `openMinyanimView` echoed back, and re-writing it
  // immediately would be a pointless replace on a URL that's already
  // correct.
  //
  // Only when the view opens or closes, never because onParamsChange is a
  // new function: on Back, Next re-renders with a new one before the
  // popstate listener below has read the address, and re-writing the
  // still-open view's `?davening=1` then undid the Back (found Oct 6).
  const minyanimViewSyncedOnce = useRef(false)
  // Set when the page itself opens the view (showMinyanimView, below).
  const openedHere = useRef(false)
  const writeMinyanimView = useEffectEvent((on: boolean) => {
    const step = on && openedHere.current
    openedHere.current = false
    onParamsChange?.(on ? { davening: '1' } : { davening: null, day: null }, step ? { step: MINYANIM_STEP } : { replace: true })
  })
  useEffect(() => {
    if (!minyanimViewSyncedOnce.current) {
      minyanimViewSyncedOnce.current = true
      return
    }
    writeMinyanimView(minyanimViewOn)
  }, [minyanimViewOn])
  // Opened from the page, the view is a step Back undoes (Oct 6): the
  // browser's, and on a phone a swipe. It used to replace the address, so
  // Back left Synagogues altogether. Its own ways back (the header's ‹ on a
  // phone, "‹ Synagogues" on a computer) take that same step when there is
  // one, so Forward doesn't reopen it; arriving on `?davening=1`, there's
  // none, and they just close it.
  const showMinyanimView = () => {
    openedHere.current = true
    setMinyanimViewOn(true)
  }
  const closeMinyanimView = () => {
    if ((window.history.state as { step?: string } | null)?.step === MINYANIM_STEP) window.history.back()
    else setMinyanimViewOn(false)
  }
  const isMobile = useIsMobile()
  // For getCategoryColor below — same call CompactCard makes for this same
  // category's home-screen badge, so the morph target's color matches
  // exactly (see categoryBadge's own doc).
  const categories = useCategories()
  // Whether the sticky controls bar below is actually capable of being stuck
  // right now — matches its own `lg:sticky` breakpoint (1024px), not
  // useIsMobile's default (640px, the `desktop:` custom variant elsewhere in
  // this file). Gates both the scroll-hide listener (no point tracking
  // scroll direction on a width where the bar just scrolls away normally)
  // and the "is it actually stuck" border below.
  const controlsCanStick = !useIsMobile('(max-width: 1023px)')
  // Same hide-on-scroll-down/reveal-on-scroll-up behavior as SiteHeader's
  // mobile header (see useScrollShowHide's own doc) — applied here on
  // desktop instead, where this bar is the thing pinned to the top of the
  // screen. Keeps "always there" from meaning "permanently glued to the top
  // no matter what you're doing," and matches an interaction the site
  // already teaches elsewhere rather than inventing a second one.
  const controlsVisible = useScrollShowHide(controlsCanStick)

  const fields = category.detailFields
  const hoursFields = fields.filter((f) => f.type === 'hours')
  const hasFilterableHours = hoursFields.some((f) => f.filterable)
  const filterableBooleans = fields.filter((f) => f.filterable && f.type === 'boolean')
  const filterableSelects = fields.filter((f) => f.filterable && f.type === 'select')

  // Sync boolFilters/selectFilters into the URL — same `?f_<key>=`/
  // `?sel_<key>=` shape initialFilters reads above, and the same
  // skip-the-first-render + replace (not push) reasoning as the search/
  // openNow sync effects. Recomputes the FULL set of this category's
  // filterable-field params from current state every time (not a diff
  // against the previous set) — cheap (a handful of fields per category)
  // and it means a field toggled off is still explicitly nulled out rather
  // than requiring separate bookkeeping of what was previously set.
  //
  // Debounced (like search) rather than firing on every click: a
  // multi-select filter is exactly the case where a visitor picks several
  // values in quick succession (e.g. three "Type" checkboxes in a row), and
  // an immediate `router.replace` per click meant each of those clicks
  // forced its own live navigation — a full re-render of this whole
  // directory's listing grid, back to back, only microseconds apart. That
  // read as actual jank (a lagging/"glitching" cursor while the main thread
  // was busy re-rendering) purely from clicking a checkbox list a few times,
  // not from anything wrong with the click handling itself. One replace
  // after the visitor pauses is both cheaper and closer to "done choosing."
  const boolFiltersSyncedOnce = useRef(false)
  useEffect(() => {
    if (!boolFiltersSyncedOnce.current) {
      boolFiltersSyncedOnce.current = true
      return
    }
    const timer = setTimeout(() => {
      const changes: Record<string, string | null> = {}
      for (const f of filterableBooleans) changes[`f_${f.key}`] = boolFilters[f.key] ? '1' : null
      onParamsChange?.(changes, { replace: true })
    }, 300)
    return () => clearTimeout(timer)
    // filterableBooleans is a fresh array every render (derived from the
    // stable `category` prop) — including it here would refire this on
    // every unrelated render instead of only when the filter state itself
    // changes; `category` doesn't change without remounting this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boolFilters, onParamsChange])

  const selectFiltersSyncedOnce = useRef(false)
  useEffect(() => {
    if (!selectFiltersSyncedOnce.current) {
      selectFiltersSyncedOnce.current = true
      return
    }
    const timer = setTimeout(() => {
      const changes: Record<string, string | null> = {}
      for (const f of filterableSelects) {
        const chosen = selectFilters[f.key] ?? []
        changes[`sel_${f.key}`] = chosen.length > 0 ? chosen.join(',') : null
      }
      onParamsChange?.(changes, { replace: true })
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectFilters, onParamsChange])

  // "All davening times" — only for categories with a `minyanim`-type field
  // (today, just Synagogues) and at least one listing with structured data.
  const minyanimField = fields.find((f) => f.type === 'minyanim')
  const hasMinyanim =
    !!minyanimField &&
    items.some((item) => isMinyanim(item[minyanimField.key]) && (item[minyanimField.key] as Minyan[]).length > 0)

  const upvotes = !!category.upvotesEnabled && ui.upvotes
  // Per-category capabilities layered under the global `ui.*` master switches.
  const caps = resolveCapabilities(category.capabilities)
  const canAdd = ui.contributions.add && caps.add
  // "+" opens "Saw something? Tell us" (agreed Oct 5); today's Add form is
  // one tap inside it, "Add a place".
  const [tellOpen, setTellOpen] = useState(false)
  // The listing the box is about, when its Suggest an edit opened it, and
  // what that Suggest an edit opened before: the listing's own editor, in
  // place, for the box's "Edit the details myself" (Oct 6). Without one,
  // the page's own edit (onEdit).
  const [openItem, setOpenItem] = useState<DirectoryResource | null>(null)
  const editYourself = useRef<(() => void) | null>(null)
  const [tellTimes, setTellTimes] = useState(false)
  const tellAbout = (item: DirectoryResource, edit?: () => void, opts?: { times?: boolean }) => {
    editYourself.current = edit ?? null
    setOpenItem(item)
    setTellTimes(!!opts?.times)
    setTellOpen(true)
  }
  // Adding to a shul's times is an edit to the shul ("+ Add a minyan").
  const canEdit = ui.contributions.edit && caps.edit
  const showSearch = ui.search.directory && caps.directorySearch
  const liveCount = (item: DirectoryResource) => voteCounts[item.id] ?? item.upvotes ?? 0

  // Every rendered card's row, keyed by listing id — a callback ref rather
  // than a plain array so a card can be found and scrolled to by id after
  // the list re-sorts, not just by its position at mount. Shared by the
  // reopen-on-mount scroll below and the "I'm here" scroll further down.
  const itemRowRefs = useRef(new Map<string, HTMLDivElement>())
  const setItemRowRef = (id: string) => (el: HTMLDivElement | null) => {
    if (el) itemRowRefs.current.set(id, el)
    else itemRowRefs.current.delete(id)
  }
  // The search/filter/sort controls below (`lg:sticky lg:top-14`) — this
  // used to only account for the site header's own height, not this SECOND
  // sticky bar sitting right under it on `lg:` widths. Every scroll target
  // landed short by however tall that bar is: the target's row ended up
  // tucked behind it, above the visible content, often the whole row.
  // `position === 'sticky'` (not a `window.innerWidth` guess) is what tells
  // us whether it's actually occupying that fixed strip right now, since
  // `lg:` isn't this component's only breakpoint concern to keep in sync.
  const controlsRef = useRef<HTMLDivElement>(null)
  // Whether the controls bar is currently actually pinned against content
  // scrolling underneath it, vs. still sitting inline before you've scrolled
  // to it — a plain `window.innerWidth`/breakpoint check can't tell the two
  // apart, only "has this specific element's own sticky position engaged."
  // Drives the border/shadow below: without it, a border on an element still
  // in normal flow reads as a stray line floating in whitespace rather than
  // a bar visibly docked against the cards below it.
  //
  // A sentinel + IntersectionObserver, not the `position === 'sticky'` check
  // scrollItemIntoView uses above: that one is read imperatively at the
  // moment of a click, which is fine for a one-off measurement, but this
  // needs to re-render whenever stuck-ness actually changes — polling
  // getComputedStyle on every scroll frame just to catch that would be far
  // more work for the same answer an observer gives you for free.
  const controlsSentinelRef = useRef<HTMLDivElement>(null)
  const [controlsStuck, setControlsStuck] = useState(false)
  useEffect(() => {
    const sentinel = controlsSentinelRef.current
    if (!sentinel) return
    // rootMargin's top matches `lg:top-14` (56px) below — the sentinel sits
    // in normal flow immediately above the controls bar, so it stops
    // "intersecting" at exactly the scroll position where the bar's own
    // sticky offset would engage, not a moment before or after.
    function makeObserver() {
      const observer = new IntersectionObserver(([entry]) => setControlsStuck(!entry.isIntersecting), {
        threshold: 0,
        rootMargin: '-56px 0px 0px 0px',
      })
      observer.observe(sentinel!)
      return observer
    }
    let observer = makeObserver()
    // Resyncing by replacing the observer alone (disconnect + a fresh
    // `makeObserver()`) isn't enough: confirmed by hand, in real browser
    // testing, that even a BRAND NEW IntersectionObserver's very first
    // callback can misreport — this isn't limited to the original,
    // mount-time instance. IntersectionObserver's callback is asynchronous
    // by spec (scheduled some time "after layout and paint"), and nothing
    // guarantees that delivery race resolves correctly on every instance,
    // every time. `getBoundingClientRect()` has no such race — it's a
    // synchronous, always-current measurement — so `resync` sets
    // `controlsStuck` directly from it. The observer is still replaced
    // alongside that (cheap, and worth doing so a later plain scroll isn't
    // still checking a sentinel bound to a stale rootMargin/layout
    // snapshot), just no longer trusted to deliver the correction itself.
    function resync() {
      setControlsStuck(sentinel!.getBoundingClientRect().top < 56)
      observer.disconnect()
      observer = makeObserver()
    }
    // Two separate races this bar's "docked" look (white background, the
    // border, the shadow — all `lg:`-gated on `controlsStuck`) can lose,
    // both confirmed by hand and both invisible on their own since neither
    // has any effect below the `lg:` breakpoint:
    //
    // Mount: this component's very first observation can land against a
    // not-yet-settled layout — content above the sentinel still streaming
    // or hydrating in — and, once wrong, does NOT self-correct from a later
    // legitimate layout shift, even long after that content has finished
    // loading. `load` (or immediately, via a double rAF, if it already
    // fired before this effect ran) is the resync point: a real signal that
    // layout has settled, not a guessed timeout.
    //
    // Resize: rotating a device, or crossing the `lg:` breakpoint by
    // resizing a browser window, reshuffles the whole page above the
    // sentinel — the mobile address banner disappears, the desktop hero/
    // badge appear. Debounced to the quiet period after the last event in a
    // resize burst so it resyncs against the settled size once, not a
    // different mid-transition layout on every intermediate event.
    if (document.readyState === 'complete') {
      requestAnimationFrame(() => requestAnimationFrame(resync))
    } else {
      window.addEventListener('load', resync, { once: true })
    }
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    function handleResize() {
      if (resizeTimer != null) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        resizeTimer = null
        resync()
      }, 150)
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('load', resync)
      if (resizeTimer != null) clearTimeout(resizeTimer)
      observer.disconnect()
    }
  }, [])
  const scrollItemIntoView = (id: string, behavior: ScrollBehavior) => {
    const headerH = (document.querySelector('header')?.getBoundingClientRect().height ?? 64) + 12
    // A listing open in the list's column (desktop): its row is hidden, so
    // bring the column's top back into view instead, and only if the page
    // has scrolled past it.
    const column = listingColumnRef.current
    if (column) {
      const top = column.getBoundingClientRect().top
      if (top < headerH) window.scrollTo({ top: Math.max(0, window.scrollY + top - headerH), behavior })
      return
    }
    const el = itemRowRefs.current.get(id)
    if (!el) return
    const controls = controlsRef.current
    const controlsH = controls && getComputedStyle(controls).position === 'sticky' ? controls.offsetHeight : 0
    const top = el.getBoundingClientRect().top + window.scrollY - headerH - controlsH
    window.scrollTo({ top: Math.max(0, top), behavior })
  }


  // Same target, but waits for the row's own position to stop moving first —
  // for a scroll fired around the same moment something else can still
  // reorder the list under it (distance-sort landing once geolocation
  // resolves, "I'm here" re-anchoring below). A one-shot scroll measured
  // before that settles targets where the row WAS, not where it ends up:
  // the visitor lands scrolled past it, or short of it, off by however far
  // the reorder moved it — with no sign the scroll even fired. Polls rather
  // than guessing a delay, since what it's waiting on (a re-render a
  // couple of contexts away) has no single fixed latency.
  //
  // setTimeout, not requestAnimationFrame: rAF is paused entirely while the
  // tab is backgrounded, which would silently drop this if the visitor
  // switched apps mid-wait and back.
  const scrollItemIntoViewWhenSettled = (id: string, behavior: ScrollBehavior) => {
    let timer = 0
    let lastTop: number | null = null
    let stableChecks = 0
    const waitForSettled = () => {
      const el = listingColumnRef.current ?? itemRowRefs.current.get(id)
      if (!el) {
        timer = window.setTimeout(waitForSettled, 32)
        return
      }
      const top = el.getBoundingClientRect().top
      stableChecks = lastTop !== null && Math.abs(top - lastTop) < 0.5 ? stableChecks + 1 : 0
      lastTop = top
      if (stableChecks >= 2) {
        scrollItemIntoView(id, behavior)
        return
      }
      timer = window.setTimeout(waitForSettled, 32)
    }
    timer = window.setTimeout(waitForSettled, 32)
    return () => window.clearTimeout(timer)
  }

  // Every rendered card's open/close handle, keyed by listing id — same
  // "callback ref in a Map, not an array" shape as itemRowRefs above, and
  // for the same reason (found by id, not position, after a re-sort).
  // Desktop-only in practice (see GenericListingCardHandle's own comment):
  // arrow-key next/prev needs to close ONE card and open a SIBLING it has
  // no other way to reach, since `expanded` is that card's own local state
  // rather than something lifted here.
  const cardRefs = useRef(new Map<string, GenericListingCardHandle>())
  const setCardRef = (id: string) => (handle: GenericListingCardHandle | null) => {
    if (handle) cardRefs.current.set(id, handle)
    else cardRefs.current.delete(id)
  }

  useEffect(() => {
    if (!reopenItemId) return
    // Actually opens the card too, not just scrolls to it — `defaultExpanded`
    // (below, on each card) only seeds that card's OWN expand state on ITS
    // OWN first mount, which does nothing if this directory is already
    // mounted from an earlier visit: Next's Cache Components keep a recent
    // route's component tree alive via <Activity> instead of unmounting it,
    // so navigating back into an already-open category with a NEW `?item=`
    // (e.g. a different listing picked from the home search dropdown) left
    // the URL pointing at the right listing but no modal actually open —
    // confirmed live, and only a full reload (a genuine fresh mount) fixed
    // it. Calling .open() on the genuine first-mount case (already true via
    // defaultExpanded) is a harmless no-op.
    cardRefs.current.get(reopenItemId)?.open()
    // Settle-aware, not a plain one-shot scrollItemIntoView — this list can
    // still reorder right after mount (distance sort landing once
    // geolocation resolves is the common case: a `?item=` deep link into a
    // distance-sorted category, opened before a location's ever been set).
    // A scroll measured before that reorder lands targets the row's
    // pre-reorder position, so the visitor ends up scrolled to wherever
    // that used to be — short of or past where the reopened listing
    // actually settled, off by however far the reorder moved it.
    return scrollItemIntoViewWhenSettled(reopenItemId, 'instant')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reopenItemId should retrigger this; scrollItemIntoViewWhenSettled is a fresh closure every render
  }, [reopenItemId])

  // Tapping a listing's "I'm here" (see SetLocationButton) re-anchors every
  // distance to it, which — for anyone not already on Distance sort — flips
  // the whole list to Distance and reorders it. On a long list, scrolled deep
  // in, that reorder happens entirely off-screen: the visitor is left looking
  // at whatever listing now occupies the spot they were scrolled to, with no
  // sign their tap did anything. This follows the tapped listing back into
  // view once the reorder actually lands.
  //
  // anchorListingId, not the whole anchor: a typed address or a GPS fix also
  // changes anchorLabel and re-sorts, but there's no single card to return
  // to for those — this is specifically the "I tapped a listing" case.
  const anchorListingId = useOptionalLocation()?.anchorListingId ?? null
  // Skips the very first commit, which is either the initial mount (nothing
  // to follow back to yet) or a returning visitor's already-stored anchor
  // restoring — neither should yank the page to a card the visitor didn't
  // just tap.
  const anchorSettledRef = useRef(false)
  useEffect(() => {
    if (!anchorSettledRef.current) {
      anchorSettledRef.current = true
      return
    }
    if (!anchorListingId) return
    // This commit is the anchor id changing — the sortByPopular effect above
    // (and every card's own distance-label recompute) hasn't reacted to the
    // new anchorLabel yet, so the tapped card's row is still at its OLD
    // position. A fixed delay isn't reliably enough: setting an anchor also
    // stops GPS tracking and touches several other contexts upstream (see
    // setListingAnchor), and their re-renders can land a tick or two apart —
    // scrollItemIntoViewWhenSettled polls instead of guessing one.
    return scrollItemIntoViewWhenSettled(anchorListingId, 'smooth')
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only anchorListingId should retrigger this; scrollItemIntoViewWhenSettled is a fresh closure every render
  }, [anchorListingId])

  // On the Minyanim tab, what's typed narrows the minyanim (MinyanimView,
  // the user's note 4): it isn't a search of the shuls, nor a question for
  // the reader.
  const searchingMinyanim = hasMinyanim && minyanimViewOn
  const q = searchingMinyanim ? '' : search.trim().toLowerCase()
  const communitySlug = useOptionalCommunitySlug()
  // Read as a question, the same way as the home search (see askSearch.ts),
  // limited to this category — so a place tapped there ("where can I get
  // cholov yisroel milk") survives this filter, and "kosher food" on the
  // restaurant page means every restaurant rather than none.
  // Each match keeps what it matched on (see SearchFound), for the card to
  // say why it's here and the listing to mark it once opened.
  const todayResult = useMemo(
    () => (q ? searchAsk(items, [category], search, { categoryId: category.id, places: neighborhoodsFor(communitySlug) }) : null),
    [q, items, category, search, communitySlug],
  )
  // A question asking for the nearest ("near me", "sort by distance") puts
  // them first while it's in the box, whatever the Sort says: "restaurant
  // near me" came back by popularity (fixes table, Sep 29).
  const asksNearest = !!todayResult?.query.nearMe
  const todayMatches = useMemo(
    () => (todayResult ? new Map(todayResult.hits.map((h) => [h.item.id, foundFor(h, todayResult)])) : null),
    [todayResult],
  )

  // ── The question reader (questionReader.ts), as on the home search ──────
  // Only when our own search left something it didn't understand
  // (needsReading), on Enter or after a pause; the reading can add to what
  // our search understood, never take it away (ownFrom). Its own part of
  // the reading (this category's filters, items, how far) answers, shown
  // as "Read as" in CategoryAsk. Never a place's own name. When its part
  // of the reading finds nothing here and today's search does ("challah"
  // on Food, read as Grocery), today's search answers: this page is about
  // this category.
  const reader = useReading(communitySlug)
  const coords = useOptionalLocation()?.coords ?? null
  // The neighbourhoods; a hospital named comes with where it is (see the route).
  const readerPlacesHere = useMemo(() => readerPlaces(items, communitySlug ?? ''), [items, communitySlug])
  const typedName = q.replace(/['’]/g, '')
  const readable = !!todayResult && needsReading(todayResult) && !items.some((i) => i.name.toLowerCase().replace(/['’]/g, '').includes(typedName))
  const own = todayResult ? ownFrom(todayResult, readerPlacesHere) : null
  const reading = readable ? reader.readingFor(search) : null
  const readResult = useMemo(() => {
    if (!reading || !readingAnswers(reading.reading, category.id) || ((todayMatches?.size ?? 0) > 0 && readingLoses(search, reading.reading, categories ?? [category]))) return null
    const result = searchReading(items, categories ?? [category], reading, search, { coords, now: new Date(clock ?? 0), places: readerPlacesHere, categoryId: category.id })
    const found = result.hits.length + result.noHours.length
    return found === 0 && (todayMatches?.size ?? 0) > 0 ? null : result
  }, [reading, items, categories, category, search, coords, readerPlacesHere, todayMatches, clock])
  useEffect(() => {
    if (!readable || !own) return
    const timer = setTimeout(() => reader.ask(search, own), 1000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readable, search])
  const readChips = readResult && reading ? readingChips(reading, categories ?? [category], { reach: readResult.reach, categoryId: category.id, excluded: readResult.excluded }) : []
  const readAs = {
    reading: reader.isReading(search) && !readResult,
    chips: readChips,
    onRemove: (chip: { without: Parameters<typeof reader.edit>[0] }) => reader.edit(chip.without),
    offers:
      readResult && reading
        ? readingOffers(reading, items, categories ?? [category], search, {
            coords,
            now: new Date(clock ?? 0),
            places: readerPlacesHere,
            categoryId: category.id,
            found: readResult.hits.length + readResult.noHours.length,
            chips: readChips,
          })
        : [],
    onPick: (offer: { next: Parameters<typeof reader.edit>[0] }) => reader.edit(offer.next),
    onSubmit: () => readable && own && reader.ask(search, own),
    result: readResult,
  }
  const askMatches = useMemo(
    () => (readResult ? new Map([...readResult.hits, ...readResult.noHours].map((h) => [h.item.id, foundFor(h, readResult)])) : todayMatches),
    [readResult, todayMatches],
  )
  const matchesSearch = (item: DirectoryResource) => askMatches === null || askMatches.has(item.id)
  // A listing opened from the home search: what that search matched in it.
  // Until that listing is closed — reopened later, it's just the listing.
  const [closedMatchFor, setClosedMatchFor] = useState<string | null>(null)
  const reopenKey = reopenItemId && reopenMatch ? `${reopenItemId}\n${reopenMatch}` : null
  const reopenFound = useMemo(() => {
    const reopened = reopenKey && items.find((i) => i.id === reopenItemId)
    if (!reopened || !reopenMatch) return null
    const result = searchAsk([reopened], [category], reopenMatch, { categoryId: category.id })
    return result.hits[0] ? foundFor(result.hits[0], result) : null
  }, [reopenKey, reopenItemId, reopenMatch, items, category])
  const foundOn = (item: DirectoryResource) =>
    askMatches?.get(item.id) ?? (item.id === reopenItemId && closedMatchFor !== reopenKey ? reopenFound : null)

  const filtered = items
    .filter((item) => {
      if (!matchesSearch(item)) return false
      for (const f of filterableBooleans) {
        if (boolFilters[f.key] && !item[f.key]) return false
      }
      for (const f of filterableSelects) {
        const chosen = selectFilters[f.key]
        // A select field can hold more than one value on a single item (e.g. a
        // place that's both a Restaurant and a Caterer) — it matches a chosen
        // filter set if ANY of its own values is one of the chosen ones.
        if (chosen?.length && !selectValues(item[f.key]).some((v) => chosen.includes(v))) return false
      }
      if (openNow && hasFilterableHours) {
        // Closed businesses are never open, whatever hours they still have
        // saved — a temporarily-closed shop kept passing this filter on last
        // season's hours.
        if (businessClosure(item as unknown as Record<string, unknown>)) return false
        // Item must be open right now according to at least one filterable
        // hours field; that waits for the time, as the rows do.
        const isOpen = !now || hoursFields
          .filter((f) => f.filterable)
          .some((f) => hoursOpenNow(item[f.key], now) === true)
        if (!isOpen) return false
      }
      return true
    })
    .sort((a, b) => {
      // Closed businesses sink to the bottom, ahead of every other sort key.
      // They stay in the list deliberately — the person most likely to walk to
      // a closed shop is the one who already knows it exists, and hiding it is
      // the one thing that guarantees they can't be warned — but they
      // shouldn't compete for attention with places that are actually
      // trading. Anyone who wants them gone entirely has the "Open now" filter.
      const closedDiff =
        Number(!!businessClosure(a as unknown as Record<string, unknown>)) -
        Number(!!businessClosure(b as unknown as Record<string, unknown>))
      if (closedDiff !== 0) return closedDiff
      // Pinned listings float to the top next, ahead of popularity/distance —
      // same tier NearbyList.tsx's own sort gives them on the map, "that's
      // the whole point of pinning something." Still below the closed check
      // above: a pinned-but-closed listing outranks other closed listings,
      // not every open one.
      const pinnedDiff = Number(isPinned(b.id)) - Number(isPinned(a.id))
      if (pinnedDiff !== 0) return pinnedDiff
      return upvotes && sortByPopular && !asksNearest
        ? liveCount(b) - liveCount(a) || travelCompare(a, b)
        : travelCompare(a, b)
    })

  // fromId is the card issuing the request (arrow key pressed while ITS
  // dialog is open) — direction moves through `filtered`, the same order
  // rendered below, so "next" always matches what's actually next on
  // screen. A no-op past either end rather than wrapping: looping from the
  // last listing back to the first (or vice versa) reads as the arrow key
  // doing something unrelated to what was just on screen, not as "there's
  // more."
  const navigateFromCard = (fromId: string, direction: 1 | -1) => {
    const index = shownItems.findIndex((i) => i.id === fromId)
    const target = shownItems[index + direction]
    if (index === -1 || !target) return
    cardRefs.current.get(fromId)?.close()
    cardRefs.current.get(target.id)?.open()
    // Settle-aware, not a one-shot scrollItemIntoView — a row's own listing
    // photo can still be loading when this fires, and an image with no
    // reserved aspect ratio grows the row (and everything below it) once it
    // arrives. A scroll measured against the shorter, image-not-yet-loaded
    // layout overshoots once that settles: the target ends up further down
    // than where this scrolled to, with the top of it — often most of it —
    // above the viewport instead of visible.
    //
    // 'instant', not 'smooth' — confirmed live: closing one card's dialog
    // and opening the next's mutates enough DOM in the same moment that
    // Chrome cancels an in-flight 'smooth' scrollTo outright, snapping the
    // page back to wherever it started (scrollY 0 in testing) rather than
    // reaching the target at all. An animated scroll can't survive a
    // concurrent modal swap; a synchronous one isn't vulnerable to being
    // cancelled mid-flight because there's no "mid-flight" for it to be in.
    scrollItemIntoViewWhenSettled(target.id, 'instant')
  }

  // Log searches that match no listing in this category — by the search text
  // alone, so an active filter (open-now, cert, etc.) doesn't look like a miss.
  useLogSearchMiss({
    query: search,
    hasResults: items.some(matchesSearch),
    ready: true,
    source: category.pluralLabel,
  })

  // Selecting the Popular/Distance toggle. Distance with no anchor set has
  // nothing to sort by (see the sortByPopular default above) — rather than
  // switch to a "Distance" sort that's actually falling back to alphabetical,
  // open the same location picker the header's pill and the map's FAB use,
  // and leave the current sort alone; the untouched-default effect above
  // (still untouched at this point — this click didn't reach the line below)
  // flips it to Distance the moment an anchor lands, same as an ordinary
  // load. An explicit Popular/Distance click marks the choice as touched so
  // it sticks even if the anchor later disappears or reappears.
  const selectSort = (byPopular: boolean) => {
    if (!byPopular && !anchorLabel) {
      document.dispatchEvent(new CustomEvent('jpc:open-location'))
      return
    }
    touchedSort.current = true
    setSortByPopular(byPopular)
  }

  // The pick-lists worth offering in the Filters sheet: a list needs two
  // values among this category's listings before choosing between them
  // means anything.
  const selectsToShow = filterableSelects.flatMap((f) => {
    const values = Array.from(new Set(items.flatMap((item) => selectValues(item[f.key]))))
    return values.length < 2 ? [] : [{ key: f.key, label: f.filterLabel ?? f.label, values, chosen: selectFilters[f.key] ?? [] }]
  })
  // Whether there's any filter at all, so a category with none (WhatsApp
  // Groups) has no Filters button opening onto an empty sheet.
  const hasActualFilters = filterableBooleans.length > 0 || selectsToShow.length > 0 || hasFilterableHours
  const typed = !searchingMinyanim && search.trim() !== ''

  const hasActiveFilters =
    typed ||
    Object.values(boolFilters).some(Boolean) ||
    Object.values(selectFilters).some((v) => v.length > 0) ||
    openNow

  const activeFilterCount =
    Object.values(boolFilters).filter(Boolean).length +
    Object.values(selectFilters).filter((v) => v.length > 0).length +
    (openNow ? 1 : 0)
  // The search found places, and the filters hid every one of them: the
  // answer above the list says "2 places have pizza", so an empty list has
  // to say why, and clearing the filters alone keeps what was asked.
  const searchMatches = typed ? items.filter(matchesSearch).length : 0
  const hiddenByFilters = activeFilterCount > 0 && (typed ? searchMatches > 0 : items.length > 0)

  // ── Groups (see listGroups.ts) ──
  // Never a search's results: those are one list, best first.
  const grouping = typed ? null : groupListings(filtered, category, now)
  // Closed groups (a pick-list's, like denominations) start closed, and this
  // browser remembers which ones were opened.
  const openGroupsKey = `jpc:open-groups:${communitySlug ?? ''}:${category.id}`
  const loadOpenGroups = () => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(openGroupsKey) ?? '[]')
      return Array.isArray(stored) ? stored.filter((v): v is string => typeof v === 'string') : []
    } catch {
      return []
    }
  }
  const saveOpenGroups = useCallback(
    (ids: string[]) => {
      try {
        localStorage.setItem(openGroupsKey, JSON.stringify(ids))
      } catch {
        // Private windows and blocked storage: the groups just start closed.
      }
    },
    [openGroupsKey],
  )
  const [openGroupIds, setOpenGroupIds] = usePersistedState<string[]>([], loadOpenGroups, saveOpenGroups)
  // While a filter is on, every group with a match opens (those without are
  // gone), and one closed then is closed only for as long as those filters
  // stay as they are; it isn't remembered.
  const filtersKey = JSON.stringify([openNow, boolFilters, selectFilters])
  const [closedWhileFiltered, setClosedWhileFiltered] = useState<{ key: string; ids: string[] }>({ key: '', ids: [] })
  const closedNow = closedWhileFiltered.key === filtersKey ? closedWhileFiltered.ids : []
  // A listing arriving open (?item=, a shared link or a reload) opens its
  // group, until that listing is closed.
  const [reopenClosedId, setReopenClosedId] = useState<string | null>(null)
  // A shul opened from the Next minyan card, or a place whose pin was
  // clicked, opens its group the same way.
  const [revealedId, setRevealedId] = useState<string | null>(null)
  const isGroupOpen = (g: ListGroup<DirectoryResource>) =>
    (!!reopenItemId && reopenItemId !== reopenClosedId && g.items.some((i) => i.id === reopenItemId)) ||
    (!!revealedId && g.items.some((i) => i.id === revealedId)) ||
    (activeFilterCount > 0 ? !closedNow.includes(g.id) : openGroupIds.includes(g.id))
  const toggleGroup = (id: string) => {
    const flip = (ids: string[]) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
    if (activeFilterCount > 0) setClosedWhileFiltered({ key: filtersKey, ids: flip(closedNow) })
    else setOpenGroupIds(flip)
  }
  // ── What each row says (see listingRow.ts) ──
  // Where each place is, beside its name: its neighbourhood or its town,
  // whichever says it more tightly (placeName).
  const rowPlaces = useMemo(() => {
    const hoods = neighborhoodsFor(communitySlug)
    const towns = townsFrom(items)
    return new Map(items.map((i) => [i.id, category.hasAddress === false ? null : placeName(i, hoods, towns)]))
  }, [items, communitySlug, category.hasAddress])
  // A row leaves out what its group heading already says: seven rows under
  // "Orthodox (Ashkenazi) · 7" needn't each say it. Search results aren't
  // grouped, so there each row says it again.
  const groupedBy = grouping ? parseGroupBy(category.groupBy) : null
  const omitKey = groupedBy?.kind === 'field' ? groupedBy.key : null
  // "Not confirmed by anyone yet" only where most of the list is vouched for
  // (see listingRowNote).
  const flagUnconfirmed = !!now && items.length > 0 && items.filter((i) => isVouchedFor(i, now)).length * 2 >= items.length

  // Synagogues' Next minyan card, until something is typed, while some shul
  // the list holds keeps times. Wherever it isn't, All davening times is
  // back in the list heading, so it's never gone.
  const showMinyanCard =
    hasMinyanim && !typed && !minyanimViewOn && filtered.some((item) => isMinyanim(item[minyanimField!.key]) && (item[minyanimField!.key] as Minyan[]).length > 0)
  // The Minyanim view in place of the list, typing included: its search
  // narrows the minyanim (the user's note 4, agreed Oct 2). It used to drop
  // back to the list of shuls.
  const minyanimView = hasMinyanim && minyanimViewOn
  // A line in that card opens its shul, as next/previous does, and opens
  // the closed group it sits in until it's closed again.
  const openListing = (id: string) => {
    setRevealedId(id)
    cardRefs.current.get(id)?.open()
    scrollItemIntoViewWhenSettled(id, 'instant')
  }

  // Tonight's candle lighting, for places that shut before it on a Friday
  // or erev Yom Tov. Fetched only where the category keeps hours, at the
  // community's centre (candle lighting hardly moves across a city), so
  // it's the same cached response for everyone.
  const { community: activeCommunity } = useActiveCommunity()
  const { data: zmanim } = useZmanim(hoursFields.length > 0 ? activeCommunity.mapCenter : null)
  const candlesAt = candlesToday(zmanim, now)

  // The listings on screen, in order: what arrow-key next/previous walks.
  const shownItems = grouping?.closed
    ? grouping.groups.flatMap((g) => (isGroupOpen(g) ? g.items : []))
    : grouping
      ? grouping.groups.flatMap((g) => g.items)
      : filtered
  const shownIndex = new Map(shownItems.map((item, i) => [item.id, i]))

  const clearFilters = () => {
    setBoolFilters({})
    setSelectFilters({})
    setOpenNow(false)
  }
  const clearAll = () => {
    setSearch('')
    clearFilters()
  }
  const toggleBool = (key: string) => setBoolFilters((prev) => ({ ...prev, [key]: !prev[key] }))
  // Adds or removes one value from a pick-list's chosen set.
  const toggleSelect = (key: string, value: string) =>
    setSelectFilters((prev) => {
      const cur = prev[key] ?? []
      return { ...prev, [key]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] }
    })
  // A word in the search an admin taught to mean one of this category's
  // filters ("dairy" is Food type: Dairy) narrows the list as that filter
  // does, so it shows as one: a chip beside the rest, which takes the word
  // out of the search. It used to narrow with nothing under Filters to say
  // so (the user, Oct 10).
  const taughtChips = ((readResult ?? todayResult)?.taught ?? []).flatMap((t) => {
    const field = t.categoryId === category.id && t.field ? category.detailFields.find((f) => f.key === t.field) : undefined
    if (!field) return []
    const label = t.value === undefined ? (field.filterLabel ?? field.label) : (field.options?.find((o) => o.value === t.value)?.label ?? t.value)
    return [{ id: `taught_${t.word}_${t.value ?? ''}`, label, onOff: () => setSearch(withoutTerms(search, t.word.split(' '))) }]
  })
  // Whatever is switched on, as chips under the list heading.
  const activeChips = [
    ...(openNow && hasFilterableHours ? [{ id: 'openNow', label: 'Open now', onOff: () => setOpenNow(false) }] : []),
    ...taughtChips,
    ...filterableBooleans
      .filter((f) => boolFilters[f.key])
      .map((f) => ({ id: `f_${f.key}`, label: f.filterLabel ?? f.label, onOff: () => toggleBool(f.key) })),
    ...filterableSelects.flatMap((f) =>
      (selectFilters[f.key] ?? []).map((v) => ({ id: `sel_${f.key}_${v}`, label: v, onOff: () => toggleSelect(f.key, v) })),
    ),
  ]

  // Desktop-only shared-element morph target for the same icon badge
  // CompactCard shows next to this category on the home screen — that's
  // the actual home-screen representation on desktop (a small colored
  // circle, not a photo tile; CardGrid's full photo tiles are mobile-only,
  // see home/sections.tsx's own doc on why). The matching `name` below is
  // what lets React's real <ViewTransition> grow that small badge into this
  // bigger one instead of a flat crossfade — it must exactly match the name
  // CompactCard gives its own copy (`category-badge-${category.id}`, both
  // keyed on the same CategoryConfig id) or no pair forms and this just
  // plays its own plain enter animation. `getCategoryColor` is called the
  // same way CompactCard calls it (same categories array, same id) so both
  // ends render the identical color — a mismatch here would make the morph
  // visibly change hue mid-flight instead of just growing.
  //
  // Not rendered at all (not just hidden) when there's no icon to morph —
  // a badge paired with nothing is pointless — or on mobile, where the
  // home->category move already has its own directional slide (see
  // navTransitions.ts) communicating the same "one level deeper" hierarchy;
  // morphing a badge AND sliding the whole screen at once would compete for
  // attention rather than reinforcing each other.
  const bandColor = getCategoryColor(categories, category.id)
  const bandImage = bandImageFor(category)

  // Not rendered at all (not just hidden) when there's no icon to morph — a
  // badge paired with nothing is pointless — or on mobile, where the
  // home->category move already has its own directional slide (see
  // navTransitions.ts) communicating the same "one level deeper" hierarchy;
  // morphing a badge AND sliding the whole screen at once would compete for
  // attention rather than reinforcing each other.
  const categoryBadge = !isMobile && category.icon ? (
    <ViewTransition name={`category-badge-${category.id}`}>
      <CategoryBandBadge color={bandColor}>
        <CategoryGlyph categoryId={category.id} icon={category.icon} className="h-[55%] w-[55%]" />
      </CategoryBandBadge>
    </ViewTransition>
  ) : null

  // What the list is drawn as: one section per group, each with what goes
  // above its rows (a closed group's line, a later open group's heading)
  // and whether its rows are showing. One section, no heading, when the
  // list isn't grouped.
  const sections: { key: string; above?: ReactNode; items: DirectoryResource[]; rowsId?: string; hidden?: boolean }[] = !grouping
    ? [{ key: 'all', items: filtered }]
    : grouping.groups.map((g, gi) => {
        if (!grouping.closed) {
          return { key: g.id, items: g.items, above: gi > 0 ? <GroupHeading label={g.label} count={g.items.length} /> : undefined }
        }
        const open = isGroupOpen(g)
        const rowsId = `${category.id}-group-${gi}`
        return {
          key: g.id,
          items: g.items,
          rowsId,
          // Rendered closed too, just hidden: a listing opened by a link
          // needs its row in place to open from.
          hidden: !open,
          above: (
            <ClosedGroupLine
              label={g.label}
              count={g.items.length}
              nearest={g.nearest}
              open={open}
              onToggle={() => toggleGroup(g.id)}
              controls={rowsId}
            />
          ),
        }
      })

  // ── The map beside the list (see CategoryMap) ──
  // Where the category has a map (an address and the Map capability). Below
  // lg it's simply not there; "Hide map" gives the list the whole width,
  // and this browser remembers it.
  const hasMapColumn = caps.map && category.hasAddress !== false
  // The same on every category page, including ones kept open for Back.
  const [mapHidden, storeMapHidden] = useSharedPreference('jpc:map-hidden', (raw) => raw === '1')
  const setMapHidden = (hidden: boolean) => storeMapHidden(hidden ? '1' : null)
  // How the width is shared between them: draggable, and dragged far
  // enough the map's way, hidden (useListMapSplit).
  const { gridRef: splitRef, gridStyle: splitStyle, handleProps: splitHandle } = useListMapSplit({ onHideMap: () => setMapHidden(true) })
  const mapBeside = hasMapColumn && !mapHidden
  // Cards or one flat list (RowLookSwitch): being tried on the preview.
  const [rowLook, setRowLook] = useRowLook()
  const flat = rowLook === 'list'
  const [highlight] = useState(createHighlight)
  // An open listing's "Within a walk" list, opened, on the map beside it
  // (walkOnMap.ts), where that map is on screen.
  const [walkShown, setWalkShown] = useState<WalkShown | null>(null)
  const wide = useWide()
  const mapOnScreen = mapBeside && wide
  const walkOnMap = mapOnScreen ? { show: setWalkShown, highlight } : null
  // A pin's row, found: opened to (its group too), scrolled to, and
  // outlined for a moment so the eye lands on it.
  const [flashId, setFlashId] = useState<string | null>(null)
  const flashTimer = useRef(0)
  const findRow = (id: string) => {
    setRevealedId(id)
    setFlashId(id)
    scrollItemIntoViewWhenSettled(id, 'smooth')
    // A second click restarts the outline's time rather than ending it early.
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlashId(null), 2500)
  }
  // The full Map page on the same places: this category, the search and
  // the filters.
  const fullMapHref = `${routes.map(activeCommunity.slug)}${mapQueryString({
    categories: [category.id],
    query: search.trim() || null,
    openNow,
    bool: Object.keys(boolFilters).filter((k) => boolFilters[k]),
    select: Object.fromEntries(Object.entries(selectFilters).filter(([, v]) => v.length > 0)),
  })}`

  // The category's one question card (see QuestionCard), right under the
  // place it asks about (decided Oct 4, built Oct 6: it sat after the fifth
  // place, whichever place it asked about). The page and the card share
  // which places this browser has been asked about, so they agree on which
  // one is next; while a thank-you shows, the card stays under the place it
  // thanks for. After the group lines when that place's group is shut. Not
  // among a search's results, which are an answer.
  const [askedPlaces, setAskedPlaces] = useAskedPlaces(category.id)
  const [heldQuestion, setHeldQuestion] = useState<string | null>(null)
  const questionShown = shownItems.length > 0 ? shownItems : filtered
  const questionOn = !typed && !!parseQuestionCard(category.questionCard)
  const questionAbout = questionOn
    ? (heldQuestion ?? pickQuestion(category, questionShown, items, new Set(askedPlaces), (item) => rowPlaces.get(item.id) ?? null)?.item.id ?? null)
    : null
  const questionSpot: { section: string; id: string } | 'end' | null = (() => {
    if (!questionAbout) return null
    for (const section of sections) {
      if (!section.hidden && section.items.some((item) => item.id === questionAbout)) return { section: section.key, id: questionAbout }
    }
    return 'end'
  })()
  // ── A listing opened on desktop takes the list's column (ListingColumn) ──
  // The list stays mounted underneath, hidden, so its cards (and what's
  // open or scrolled) are where they were when Back brings it back.
  // A listing someone arrived at from a link is, on a phone, a page of its
  // own rather than a sheet over a list they never saw: the listing this
  // page was first opened with, until it's closed (agreed Sep 30). Opened
  // from the list, a listing is the sheet as always.
  const [pagedItemId, setPagedItemId] = useState<string | null>(linkedItemId)
  const hostedId = openDialogItemId && (!isMobile || openDialogItemId === pagedItemId) ? openDialogItemId : null
  const columnItem = hostedId ? (items.find((i) => i.id === hostedId) ?? null) : null
  const phonePage = isMobile && !!columnItem
  const listingColumnRef = useRef<HTMLDivElement>(null)
  // Another listing in its place: the one being read closes, the other
  // opens (its closed group too), and the page comes back up to the top of
  // the column if it had scrolled past it.
  const switchListing = (fromId: string, toId: string) => {
    setRevealedId(toId)
    cardRefs.current.get(fromId)?.close()
    cardRefs.current.get(toId)?.open()
    scrollItemIntoViewWhenSettled(toId, 'instant')
  }
  // Back to the list, at the row just read, outlined for a moment. On a
  // phone that was the listing's own page, and from now on listings open
  // as sheets over the list.
  // Closes the listing whether or not its row is on screen: on the
  // Minyanim tab there are no shul rows, and closing through the row alone
  // left the listing stuck open (found Oct 2).
  const closeOpenListing = (id: string) => {
    cardRefs.current.get(id)?.close()
    setOpenDialogItemId((prev) => (prev === id ? null : prev))
    onParamsChange?.({ item: null, match: null }, { replace: true })
    setPagedItemId(null)
    // Closing the listing the address names: the address becomes the
    // category's, as it would have been had it been opened from the list.
    if (id === linkedItemId && window.location.pathname !== routes.slug(activeCommunity.slug, category.id)) {
      window.history.replaceState(window.history.state, '', routes.slug(activeCommunity.slug, category.id) + window.location.search)
    }
  }
  const closeColumn = (id: string) => {
    // Opened from the page, it's a step (below): take it back, and the
    // popstate listener closes it, so Forward doesn't reopen it.
    if ((window.history.state as { step?: string } | null)?.step === LISTING_STEP) {
      window.history.back()
      return
    }
    closeOpenListing(id)
    findRow(id)
  }
  // Back and Forward: the address says whether the Minyanim view is open,
  // and on a computer whether a listing is (Oct 6). Next re-renders on
  // popstate before this runs, so it reads the address, not its props.
  const onPop = useEffectEvent(() => {
    const params = new URLSearchParams(window.location.search)
    setMinyanimViewOn(params.get('davening') === '1')
    if (hostedId && !isMobile && !params.get('item')) {
      closeOpenListing(hostedId)
      findRow(hostedId)
    }
  })
  useEffect(() => {
    const listener = () => onPop()
    window.addEventListener('popstate', listener)
    return () => window.removeEventListener('popstate', listener)
  }, [])
  // The header's back arrow: home, or from a listing's own page, the list;
  // in the Minyanim view, which it names, Synagogues (Oct 6: it was a second
  // "‹ Synagogues" under the header).
  const minyanimTitle = 'Minyanim by time'
  useSetScreenHeader(
    true,
    minyanimView && !phonePage ? minyanimTitle : category.pluralLabel,
    phonePage && columnItem ? () => closeColumn(columnItem.id) : minyanimView ? closeMinyanimView : onUp,
    { named: phonePage },
  )
  // A computer's opened listing has the top of the page (Oct 6, B): the
  // search, its examples and the "Minyanim by time" row are the list's, and
  // come back with it; above the listing only "‹ Synagogues", as a phone's
  // opened listing has only the header's ‹. They pushed it halfway down.
  const deskListing = !!columnItem && !phonePage

  // An opened listing's last part: the places near it in the list as it's
  // filtered now, and the way back to all of them (ListingView's onward).
  const onwardSource: ListingOnwardSource = {
    items: filtered,
    place: (item) => rowPlaces.get(item.id) ?? null,
    open: openListing,
    allLabel: `See all ${items.length} in ${category.pluralLabel}`,
  }

  const questionCard = questionSpot && (
    <QuestionCard
      category={category}
      shown={questionShown}
      all={items}
      place={(item) => rowPlaces.get(item.id) ?? null}
      onEdit={onEdit}
      asking={{ asked: askedPlaces, setAsked: setAskedPlaces, onHeld: setHeldQuestion }}
    />
  )

  // The list's own heading: how many, and Filters and Sort, the same place
  // on every category page (see ListHeading). Under the search box, or at
  // the top of the list's column where the map sits beside it.
  const listHeading = (
      <ListHeading
        // Open groups: the first group's heading is the list's own ("Open
        // now · 57"), saving a line above the first place on a phone.
        // Closed groups: what they're grouped by and the whole count.
        label={grouping ? (grouping.closed ? grouping.title : grouping.groups[0]?.label) : undefined}
        count={grouping && !grouping.closed ? (grouping.groups[0]?.items.length ?? 0) : filtered.length}
        noun={!grouping || grouping.closed}
        total={filtered.length}
        filters={hasActualFilters ? { active: activeFilterCount, onOpen: () => setFiltersOpen(true) } : undefined}
        sort={upvotes ? { byPopular: sortByPopular, onSelect: selectSort } : undefined}
        // Only while the Next minyan card, which carries it, is gone.
        onDaveningTimes={hasMinyanim && !showMinyanCard ? showMinyanimView : undefined}
        activeChips={activeChips}
        onShowMap={hasMapColumn && mapHidden ? () => setMapHidden(false) : undefined}
      />
  )

  return (
    <TellAboutContext.Provider value={canAdd || canEdit ? tellAbout : null}>
    <WalkOnMapContext.Provider value={walkOnMap}>
    <div>
      {/* Phones: where the distances on each row are measured from, when
          the visitor hasn't set a location, with the way to set one. At the
          top, above the category band, as the old banner was; desktop has
          the same line under the title (DirectoryHeader). */}
      {addressPrompt && !anchorLabel && !phonePage && <DistanceNote className="desktop:hidden pb-3" />}
      <CategoryBandFrame color={bandColor} imageUrl={bandImage}>
          {/* Mobile used to have its own "‹ {upLabel}" row here (UpButton,
              desktop:hidden). It's gone now that useSetScreenHeader (above)
              puts the same "‹ {title}" control directly in SiteHeader on
              mobile — this component no longer needs to render its own copy
              of it. Desktop never had an equivalent row of its own (the
              since-removed Breadcrumb lived inside DirectoryHeader, not
              here) and still doesn't. */}

          <div hidden={phonePage}>
          <DirectoryHeader
            title={minyanimView ? minyanimTitle : category.pluralLabel}
            anchorLabel={anchorLabel}
            addressPrompt={addressPrompt}
            titleInHeader
            banner={categoryBadge}
            // A computer's way back from the Minyanim view: small, over the
            // title it replaced. A phone's is the header's ‹.
            up={minyanimView && !columnItem && !isMobile ? { label: category.pluralLabel, onClick: closeMinyanimView } : undefined}
            titleOnly={deskListing}
          />
          </div>

      {/* Controls — sticky from lg up so search/filters/sort stay reachable
          on a long list instead of scrolling away above the fold. `top-14`
          matches SiteHeader's own fixed `h-14` (see that component) — on
          desktop SiteHeader itself stays pinned (no scroll-hide there), so
          this can sit at a fixed offset rather than measuring it. This bar
          gets its own scroll-hide instead (controlsVisible), so "always
          reachable" doesn't also mean "permanently glued to the top of the
          screen" while you're just reading down the list.
          Not gated on the `desktop:` custom variant (640px) — that's wide
          enough to fit the sticky bar but too narrow for it to be worth the
          fixed screen real estate it costs; `lg:` (1024px) is where a phone
          landscape or small tablet stops paying more than it gets back.
          The sentinel above it is a 1px scroll marker, not truly zero-height
          — an actual zero-area target can report `isIntersecting` as
          unreliably always-false in some browsers, since there's no overlap
          area to compute a ratio from. See controlsStuck's own doc for what
          it's for. Plain `h-px`, not `lg:h-px`: the observer that reads it
          is created unconditionally regardless of viewport width, so a
          zero-height sentinel on mobile could already latch in a wrong
          `isIntersecting` reading there — invisible at the time, since
          `controlsStuck`'s only visible effects are `lg:`-gated, but the
          bad reading doesn't self-correct just because the viewport later
          crosses into `lg:` (by rotating a device, or resizing a browser
          window past it). The docked white background then shows up on an
          unscrolled desktop page, sourced from a mobile-era reading that
          was already wrong before desktop-only styling ever had a chance
          to reveal it. */}
      <div ref={controlsSentinelRef} aria-hidden className="h-px" />
      <div
        ref={controlsRef}
        hidden={phonePage || deskListing}
        // The "docked" look (white background, the padding it needs, the
        // negative margin that pulls it flush against the header above, the
        // shadow, and the hide-on-scroll transform) only ever applies once
        // `controlsStuck` says the bar has actually engaged its sticky
        // position. Applying `lg:-mt-3`/`lg:bg-white` unconditionally used to
        // pull this bar's own solid background up 12px REGARDLESS of scroll
        // position — while still sitting in normal flow, that overlapped
        // whatever sat directly above it (DirectoryHeader's title row),
        // clipping its bottom few pixels even on a page load with no
        // scrolling at all. The hide-on-scroll transform had the same bug in
        // reverse: applied unconditionally, it reacted to ANY downward
        // scroll on the page, so the bar slid away while a visitor was still
        // scrolling through content well above it — before it had ever
        // become sticky, let alone been scrolled past.
        //
        // lg:border-x once docked: the bar's white is only a few shades off
        // the page's own grey background, and the shadow above only reads
        // on its bottom edge — with nothing marking the left/right edges,
        // the two near-whites just ran together there. A thin border gives
        // it the same framing the full-bleed results panel below already
        // has (border-slate-200).
        //
        // lg:px-4 once docked, too: the search input and filter pills have
        // no horizontal padding of their own — un-docked, they just line up
        // flush with the grid below, which is fine there. But the moment
        // this box gets its own visible edges (the border above), that same
        // zero-padding reads as the search box and pills touching the frame
        // directly, with no breathing room. The inset only appears once
        // docked, same as the border/shadow/background it's paired with.
        //
        // lg:transition-all, not lg:transition-transform: the hide-on-scroll
        // slide is the only thing that was ever animated — background,
        // padding, margin, border and shadow all popped in/out the instant
        // `controlsStuck` flipped, no transition at all. That's a smooth
        // slide with several other properties snapping on top of it in the
        // same frame, which reads as a stutter right at the moment it docks
        // rather than one clean motion. transition-all covers all of it with
        // the same duration, so it settles together.
        // Not sticky where the map sits beside the list: the map stays in
        // view instead, and the list's heading moves to the top of its
        // column (see hasMapColumn).
        className={`mb-4 space-y-2 ${hasMapColumn ? '' : 'lg:sticky lg:top-14 lg:z-30 lg:transition-all lg:duration-300'} ${
          hasMapColumn
            ? ''
            : controlsStuck
            ? `lg:border-x lg:border-slate-200 lg:bg-white lg:px-4 lg:pt-3 lg:pb-3 lg:-mt-3 lg:shadow-[0_6px_12px_-8px_rgba(15,23,42,0.35)] ${controlsVisible ? 'lg:translate-y-0' : 'lg:-translate-y-full'}`
            : 'lg:translate-y-0'
        }`}
      >
        {/* The page's one search box, limited to this category, with
            example searches under it and, once something is typed, the
            sentence answering it (see CategoryAsk). */}
        {/* Under them, Synagogues' "Minyanim by time" row. Gone once
            anything is typed: then the search's own answer says what's next
            (see NextMinyanCard). */}
        <div className={showMinyanCard ? 'space-y-3' : undefined}>
          {showSearch && (
            <div className={hasMapColumn ? 'lg:max-w-[720px]' : undefined}>
              <CategoryAsk
                category={category}
                items={items}
                search={search}
                onSearch={setSearch}
                hasMinyanim={hasMinyanim}
                scope={minyanimView ? 'minyanim' : undefined}
                readAs={minyanimView ? undefined : readAs}
              />
            </div>
          )}
          {/* "Minyanim by time", with the next minyan under it: the way in
              to every minyan, on every screen size (Oct 6). */}
          {showMinyanCard && (
            <div className={hasMapColumn ? 'lg:max-w-[720px]' : undefined}>
              <NextMinyanCard items={filtered} onDaveningTimes={showMinyanimView} />
            </div>
          )}
        </div>
        {!hasMapColumn && !columnItem && !minyanimView && listHeading}
      </div>

      <div ref={splitRef} className={mapBeside ? 'group/split lg:grid lg:items-start' : undefined} style={mapBeside ? splitStyle : undefined}>
      <div className="min-w-0">
      {columnItem && (
        <div ref={listingColumnRef}>
          {/* Each shul's next minyan, for the listing's status and the
              shuls near it, as the list has. */}
          <NextMinyans enabled={hasMinyanim} items={items}>
          <ListingColumn
            phone={phonePage}
            item={columnItem}
            category={category}
            color={bandColor}
            place={rowPlaces.get(columnItem.id) ?? null}
            found={foundOn(columnItem)}
            upvote={
              upvotes ? (
                <UpvoteButton
                  variant="recommend"
                  name={columnItem.name}
                  resourceId={columnItem.id}
                  count={liveCount(columnItem)}
                  onCountChange={(c) => setVoteCounts((prev) => ({ ...prev, [columnItem.id]: c }))}
                />
              ) : undefined
            }
            onward={{
              items: filtered,
              place: (i) => rowPlaces.get(i.id) ?? null,
              onOpen: (other) => switchListing(columnItem.id, other.id),
              seeAll: { label: onwardSource.allLabel, onClick: () => closeColumn(columnItem.id) },
            }}
            backLabel={minyanimView ? minyanimTitle : category.pluralLabel}
            onBack={() => closeColumn(columnItem.id)}
            position={{ index: Math.max(0, shownIndex.get(columnItem.id) ?? 0), total: shownItems.length }}
            onStep={(direction) => navigateFromCard(columnItem.id, direction)}
            alone={!mapBeside}
            onShowMap={hasMapColumn && mapHidden ? () => setMapHidden(false) : undefined}
          />
          </NextMinyans>
        </div>
      )}
      <div hidden={!!columnItem}>
      {hasMapColumn && !minyanimView && listHeading}
      {minyanimView ? (
        <MinyanimView
          items={filtered}
          categoryId={category.id}
          initialDay={initialDaveningDay}
          // A minyan and its shul's pin light up together, as a shul's row does.
          onHoverShul={mapBeside ? highlight.set : undefined}
          search={search}
          canAdd={canEdit}
          shulText={(item) => filterableSelects.flatMap((f) => selectValues(item[f.key])).join(' · ')}
        />
      ) : filtered.length === 0 && typed && !hiddenByFilters ? (
        // The search found nothing: the box under the search says so, with
        // one way to ask (AskTheGroup). A second "No groceries match your
        // search" with its own buttons was more to read (the user, Oct 10).
        null
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-muted">
            {hiddenByFilters
              ? typed
                ? `${searchMatches} match your search, but none with these filters.`
                : 'None with these filters.'
              : hasActiveFilters
                ? `No ${category.pluralLabel.toLowerCase()} match your search.`
                : `No ${category.pluralLabel.toLowerCase()} listed yet.`}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {hasActiveFilters && (
              <button
                onClick={hiddenByFilters ? clearFilters : clearAll}
                className="text-sm font-medium text-slate-600 border border-slate-300 rounded-md px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                {hiddenByFilters ? 'Clear filters' : 'Clear search & filters'}
              </button>
            )}
            {canAdd && (
              // The same box as the "+": adding looks the same however it
              // starts (Oct 5).
              <button
                onClick={() => {
                  setOpenItem(null)
                  setTellOpen(true)
                }}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary border border-primary rounded-md px-3 py-1.5 hover:bg-primary hover:text-white transition-colors cursor-pointer"
              >
                <PlusIcon className="h-4 w-4" /> Add {category.label.toLowerCase()}
              </button>
            )}
          </div>
        </div>
      ) : (
        // One column on a phone. From sm up, a grid of 420px-minimum
        // columns: one on a narrow window, two on a laptop, never three.
        // Rows are two lines now (see listingRow.ts) and read best wide;
        // three 280px columns squeezed a name and its facts line into a
        // third of the page each.
        //
        // auto-fill, not auto-fit: auto-fit collapses empty tracks and hands
        // their width to the cards that exist, so a category of two listings
        // got two page-wide cards. auto-fill keeps the empty track as space
        // at the end of the row.
        //
        // SwipeRowGroup: only one card's swipe actions stay revealed at a
        // time, the same rule the map's nearby list follows.
        // NextMinyans: each shul row's next minyan (shul categories only).
        <NextMinyans enabled={hasMinyanim} items={items}>
        <ListingOnwardContext.Provider value={onwardSource}>
        <SwipeRowGroup>
        <div className={grouping?.closed ? 'space-y-2' : undefined}>
        {sections.map((section) => (
          <div key={section.key}>
          {section.above}
          <div id={section.rowsId} hidden={section.hidden} className={grouping?.closed ? 'pt-2 pb-2' : undefined}>
        {/* The flat list is one white box with a line under each row; the
            last row's line tucks under the box's own border (-mb-px). */}
        <div className={flat ? 'overflow-hidden rounded-xl border border-slate-200 bg-white' : undefined} data-testid={flat ? 'flat-list' : undefined}>
        <div
          className={
            flat
              ? '-mb-px sm:grid sm:grid-cols-[repeat(auto-fill,minmax(420px,1fr))]'
              : 'space-y-2 sm:space-y-0 sm:grid sm:gap-3 sm:grid-cols-[repeat(auto-fill,minmax(420px,1fr))]'
          }
        >
          {section.items.map((item) => (
            <Fragment key={item.id}>
            <div
              ref={setItemRowRef(item.id)}
              // A row and its pin light up together (CategoryMap).
              onMouseEnter={mapBeside ? () => highlight.set(item.id) : undefined}
              onMouseLeave={mapBeside ? () => highlight.set(null) : undefined}
              className={
                flat
                  ? // An outline, drawn over the row: a ring outside it would
                    // be cut off by the list's box.
                    `border-b border-slate-100 ${flashId === item.id ? 'outline-2 -outline-offset-2 outline-primary/60' : ''}`
                  : flashId === item.id
                    ? 'rounded-xl ring-2 ring-primary/60 ring-offset-2 transition-shadow'
                    : undefined
              }
            >
            <GenericListingCard
              ref={setCardRef(item.id)}
              inColumn={!isMobile || item.id === pagedItemId}
              onNavigate={(direction) => navigateFromCard(item.id, direction)}
              hasPrev={(shownIndex.get(item.id) ?? 0) > 0}
              hasNext={(shownIndex.get(item.id) ?? Infinity) < shownItems.length - 1}
              item={item}
              category={category}
              showCategoryLabel={false}
              place={rowPlaces.get(item.id) ?? null}
              omitKey={omitKey}
              flagUnconfirmed={flagUnconfirmed}
              likes={upvotes && sortByPopular ? liveCount(item) : undefined}
              look={rowLook}
              candlesAt={candlesAt}
              upvotes={upvotes}
              count={liveCount(item)}
              defaultExpanded={item.id === reopenItemId}
              // Keeps ?item=<id> in the URL in sync with whichever card is
              // actually open — a reload (or a shared link) lands back on
              // the same expanded listing, same as `davening`/`day` do for
              // the Minyanim view above. `replace`, not `push`: an
              // expand/collapse is a one-off, not something that should
              // pile up browser-back history entries the way opening an
              // Add/Edit/Report form (which does use push, see
              // FindResources' openAction) reasonably does.
              // Except on a computer, opening one from the list (Oct 6): it
              // has the page now, so it's a step Back undoes. Stepping to
              // the next one replaces it, so Back doesn't walk back through
              // every listing read.
              found={foundOn(item)}
              onExpandedChange={(expanded) => {
                onParamsChange?.(
                  { item: expanded ? item.id : null, ...(expanded ? {} : { match: null }) },
                  // Not when the address already names it: a link, or
                  // Forward, reopening it. (On a phone arriving from its
                  // link, the first render still thinks it's a computer.)
                  expanded &&
                  !hostedId &&
                  !isMobile &&
                  item.id !== reopenItemId &&
                  item.id !== linkedItemId &&
                  new URLSearchParams(window.location.search).get('item') !== item.id
                    ? { step: LISTING_STEP }
                    : { replace: true },
                )
                if (!expanded && item.id === revealedId) setRevealedId(null)
                if (!expanded && item.id === reopenItemId) {
                  setClosedMatchFor(reopenKey)
                  setReopenClosedId(item.id)
                }
                // See openDialogItemId's own note. Cleared by id rather
                // than unconditionally: arrow-key next/prev closes
                // one card and opens a sibling in the same commit, and the
                // closing card's callback can run after the opening one's,
                // which would otherwise clear the flag the new dialog just set.
                setOpenDialogItemId((prev) => (expanded ? item.id : prev === item.id ? null : prev))
              }}
              onVote={(c) => setVoteCounts((prev) => ({ ...prev, [item.id]: c }))}
              onEdit={() => onEdit(item)}
            />
            </div>
            {questionSpot !== 'end' && questionSpot?.section === section.key && questionSpot.id === item.id && (
              <div className={flat ? 'border-b border-slate-100 p-3 sm:col-span-full' : 'sm:col-span-full'}>{questionCard}</div>
            )}
            </Fragment>
          ))}
        </div>
        </div>
          </div>
          </div>
        ))}
        {questionSpot === 'end' && <div className="pt-2">{questionCard}</div>}
        </div>
        </SwipeRowGroup>
        </ListingOnwardContext.Provider>
        </NextMinyans>
      )}
      {/* A link an admin set for what this guide doesn't list ("Other
          Mikvahs" → mikvah.org's directory). After the last row, where
          someone who hasn't found it here has just finished looking, and
          under an empty list too; not in the list heading, which is for
          arranging the list. */}
      {category.externalLink && (
        <p data-testid="external-link" className="mt-5 text-center text-[13.5px] text-slate-500">
          Not listed here?{' '}
          <a href={category.externalLink.url} target="_blank" rel="noopener noreferrer" className="font-bold text-primary hover:underline">
            {category.externalLink.label} ↗
          </a>
        </p>
      )}
      </div>
      </div>
      {/* The map, beside the list from lg up and staying in view while the
          list scrolls. Not rendered at all below that (CategoryMap loads
          nothing until it's wide enough). */}
      {/* The line between list and map: drag it to share the width
          differently, double-click it for half and half. */}
      {mapBeside && (
        <div
          {...splitHandle}
          className="group hidden cursor-col-resize touch-none items-center justify-center outline-none lg:sticky lg:top-[4.5rem] lg:flex lg:h-[min(calc(100vh-6rem),720px)]"
        >
          <span className="h-12 w-1.5 rounded-full bg-slate-300 transition-colors group-hover:bg-slate-500 group-focus-visible:bg-primary group-focus-visible:ring-2 group-focus-visible:ring-primary/40" />
        </div>
      )}
      {mapBeside && (
        <div className="relative hidden lg:sticky lg:top-[4.5rem] lg:block lg:h-[min(calc(100vh-6rem),720px)]">
          <div className="h-full transition-opacity group-data-[snap=map]/split:opacity-30">
          <CategoryMap
            category={category}
            items={filtered}
            searchActive={typed || activeFilterCount > 0}
            highlight={highlight}
            selectedId={columnItem?.id ?? null}
            walk={columnItem && mapOnScreen ? walkShown : null}
            onSelect={columnItem ? (id) => switchListing(columnItem.id, id) : findRow}
            onHide={() => setMapHidden(true)}
            fullMapHref={fullMapHref}
          />
          </div>
          {/* While the line is dragged far enough to hide the map. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden items-center justify-center group-data-[snap=map]/split:flex">
            <span className="rounded-full bg-slate-900/85 px-4 py-2 text-[14px] font-semibold text-white shadow-lg">Let go to hide the map</span>
          </div>
        </div>
      )}
      </div>
      </CategoryBandFrame>

      {/* The category page's Add — a floating circular button,
          Gmail-compose-style, on both mobile and desktop now (used to be
          mobile-only, with desktop instead carrying a toolbar button up in
          DirectoryHeader and a site-wide "Add a listing" picker in
          SiteHeader — both removed in favor of this one control everywhere).
          Since Oct 5 it opens the "+ Add" box (TellUsSheet), which knows
          this category: a place found with "Find the place" is added here
          without asking which kind it is. Home and the other screens have
          the site-wide "+" (SiteAddButton), which asks.
          `bottom-[calc(3.75rem+env(safe-area-inset-bottom)+1rem)]` clears
          MobileTabBar the same way ResourceMapView's own fixed mobile
          panels already do — 3.75rem is that bar's own height. MobileTabBar
          itself is `desktop:hidden` (no bottom bar to clear there), so
          desktop gets its own, simpler `bottom-6` instead of that clearance
          math.
          A bare icon circle is a mobile convention (Gmail compose, Google
          Maps) that people already have a trained reflex for — desktop
          visitors don't have the same reflex for an icon floating in a
          corner with no label, and this had none: just an aria-label,
          invisible unless you already knew to hover-and-guess. Desktop gets
          the label made visible instead, widening into a pill; mobile stays
          the plain circle, where the label would just be redundant with the
          reflex people already bring to the shape. */}
      {filtered.length > 0 && !openDialogItemId && !minyanimView && <RowLookSwitch look={rowLook} onChange={setRowLook} />}

      {canAdd && (!openDialogItemId || (!isMobile && columnItem)) && (
        <button
          onClick={() => {
            setOpenItem(null)
            setTellOpen(true)
          }}
          // Generic, not "Add {category label}" — the empty-state button
          // further up already uses that exact phrasing, and giving this
          // the same name would make the two indistinguishable to anything
          // querying by accessible name (they're both in the DOM at once
          // for an empty category, since this isn't gated on `filtered`).
          // Kept even now that desktop shows the same words visibly —
          // aria-label always wins for the accessible name regardless, so
          // this keeps mobile's icon-only button correctly named without
          // needing a second, viewport-conditional way of deriving it.
          aria-label="Add"
          className={`fixed right-4 bottom-[calc(3.75rem+env(safe-area-inset-bottom)+1rem)] desktop:bottom-6 z-40 flex h-14 w-14 desktop:w-auto items-center justify-center gap-2 rounded-full bg-primary px-0 desktop:px-5 text-white shadow-lg cursor-pointer active:scale-95 transition-transform`}
        >
          <PlusIcon className="h-6 w-6 shrink-0" />
          <span className="hidden desktop:inline font-medium whitespace-nowrap">Add</span>
        </button>
      )}
      {tellOpen && (
        <TellUsSheet
          isOpen
          onClose={() => setTellOpen(false)}
          about={openItem ? { id: openItem.id, name: openItem.name } : undefined}
          category={category}
          placeholder={tellUsPlaceholder(category, { times: minyanimViewOn || (!!openItem && tellTimes) })}
          heading={openItem && tellTimes ? `Update ${openItem.name}’s times` : undefined}
          onEditYourself={
            openItem
              ? () => {
                  setTellOpen(false)
                  if (editYourself.current) editYourself.current()
                  else onEdit(openItem)
                }
              : undefined
          }
        />
      )}

      {hasActualFilters && (
        <FiltersSheet
          isOpen={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          hasOpenNow={hasFilterableHours}
          openNow={openNow}
          onOpenNow={() => setOpenNow((v) => !v)}
          booleans={filterableBooleans.map((f) => ({ key: f.key, label: f.filterLabel ?? f.label, on: !!boolFilters[f.key] }))}
          onBoolean={toggleBool}
          selects={selectsToShow}
          onSelect={toggleSelect}
          onClearAll={clearFilters}
          count={filtered.length}
        />
      )}

    </div>
    </WalkOnMapContext.Provider>
    </TellAboutContext.Provider>
  )
}
