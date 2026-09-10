'use client'

import { useEffect, useLayoutEffect, useRef, useState, ViewTransition } from 'react'
import type { DirectoryResource } from '@/types'
import { resolveCapabilities, selectValues, bandImageFor, type CategoryConfig } from '@/lib/categories'
import { hoursOpenNow, businessClosure } from '@/lib/hours'
import { useNow } from '@/lib/useNow'
import { ALL_MINYAN_DAYS, isMinyanim, type MinyanDayKey } from '@/lib/davening'
import type { Minyan } from '@/lib/davening'
import DirectoryHeader from './DirectoryHeader'
import { CategoryBandFrame, CategoryBandBadge } from './CategoryBandFrame'
import CheckboxDropdown from './CheckboxDropdown'
import { GenericListingCard, type GenericListingCardHandle } from './GenericListingCard'
import DaveningTimesModal from '@/components/synagogues/DaveningTimesModal'
import { PlusIcon, ClockIcon } from '@/components/icons'
import { useIsMobile } from '@/lib/useIsMobile'
import { useScrollShowHide, useSetScreenHeader } from '@/lib/headerVisibility'
import { listingSearchText } from '@/lib/searchListing'
import { travelCompare } from '@/lib/listingTravel'
import { useLogSearchMiss } from '@/lib/useLogSearchMiss'
import { ui } from '@/lib/uiConfig'
import { useOptionalLocation } from '@/lib/locationContext'
import { usePinned } from '@/lib/pinnedContext'
import { useCategories } from '@/lib/useCategories'
import { didArriveViaBackForward } from '@/lib/backForwardNavigation'
import { getCategoryColor } from '@/lib/categoryColor'
import { CategoryGlyph } from '@/lib/categoryIcons'

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
  /** Mount with the "All davening times" modal already open — the home
   *  screen's DaveningTimesCard links here with `?davening=1` (see
   *  routes.ts's own daveningTimes helper) so "See all" actually lands on
   *  the sheet it names, instead of a bare category page the visitor then
   *  has to find the same button on again. No-op for a category with no
   *  minyanim field to show a modal for. */
  openDaveningModal?: boolean
  /** Mount the modal already filtered to this day (or days) — DaveningTimesCard
   *  sets it to tomorrow's key when ITS OWN result is tomorrow's earliest
   *  minyan (result.isTomorrow), so a visitor who followed a "tomorrow"
   *  time here doesn't land on the modal's own "Today" default, which would
   *  show nothing left for today and no visible reason why. Comma-separated
   *  when tomorrow is also a secular holiday (DaveningTimesCard appends
   *  `,holiday`), so a shul's holiday-specific minyan isn't invisible on a
   *  view that's otherwise correctly showing tomorrow. Only ever applied on
   *  arrival (see the `key` this feeds in FindResources.tsx) — the modal's
   *  own day filter otherwise persists across opens by design (see
   *  DaveningTimesModal's own doc), which this doesn't touch for the
   *  ordinary in-page "All davening times" button. */
  initialDaveningDay?: string
  onUp: () => void
  /** What `onUp` actually goes to — "Home" on mobile (the home grid IS the
   *  index there), "All resources" on desktop (a separate index page). See
   *  FindResources' upToAllResources, which this mirrors. Defaults to "All
   *  resources" for callers (the admin's category preview) that always mean
   *  that literally, regardless of device. */
  upLabel?: string
  onAdd: () => void
  onEdit: (item: DirectoryResource) => void
  onReport: (item: DirectoryResource) => void
  /** Pushes the search text / "Open now" toggle into the URL (`?q=`,
   *  `?openNow=`) as they change, so a search + filter combination is a
   *  shareable link — e.g. sending someone `?q=bagel&openNow=1` opens the
   *  category with "bagel" already typed and Open Now already on. `replace`
   *  (not push) for both: every keystroke or toggle flip becoming its own
   *  history entry would make browser-back a nightmare, unlike the
   *  item/form navigations elsewhere in this tree that deliberately push.
   *  Optional and a no-op by default, same reasoning as FindResources' own
   *  onParamsChange — nothing here is interactive before hydration anyway. */
  onParamsChange?: (changes: Record<string, string | null>, opts?: { replace?: boolean }) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GenericDirectory({ category, items, anchorLabel, addressPrompt, reopenItemId, initialSearch, initialOpenNow, initialFilters, openDaveningModal, initialDaveningDay, onUp, upLabel = 'All resources', onAdd, onEdit, onReport, onParamsChange }: Props) {
  // Hands the shared header this screen's own title + "up" handler — on
  // mobile, SiteHeader shows "‹ {category.pluralLabel}" in place of the site
  // name while this is mounted, and reverts automatically on unmount (see
  // useSetScreenHeader's own doc). Always active: every caller of this
  // component (categories, hospitals, synagogues) is a second-level screen a
  // visitor drilled into, never the home grid itself.
  useSetScreenHeader(true, category.pluralLabel, onUp)

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
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [openNow, setOpenNow] = useState(arrivedViaBackForward ? false : (initialOpenNow ?? false))
  // Drives the "Open now" filter below. Without it the filter answers for the
  // moment the page rendered, so a list narrowed to what's open at 4pm still
  // shows those places at 10pm.
  const now = new Date(useNow())

  // ── Apply a shared link's search/openNow/filters once they actually arrive ──
  // The lazy initializers above already cover the common case (this component
  // mounts with the real query string already known), but SlugScreen's
  // Suspense fallback can mount THIS SAME instance first with none of it read
  // yet (see FindResources' own doc on searchQuery etc.) — too late for a
  // lazy initializer to catch. Each of these applies its prop's arrival
  // exactly once, guarded by its own ref, rather than forcing a remount of
  // this whole component the way `openDaveningModal` below still does: once
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
  const [filtersOpen, setFiltersOpen] = useState(false)
  // A plain lazy initializer here would only ever see the FIRST render:
  // SlugScreen's Suspense fallback renders this tree once with the query
  // string not yet read (openDaveningModal is undefined then, same as
  // `initialSearch` is at that point — see FindResources' own doc), then
  // FindResourcesConnected hydrates and this same component instance
  // re-renders with the real value — too late for a lazy initializer to
  // catch. Solved the same way `initialSearch` already is: FindResources
  // folds `openDaveningModal` into the `key` it gives ResourceLoader, so
  // the value arriving forces a fresh mount of this whole subtree instead
  // of an update to the existing one, and the lazy initializer below runs
  // again with the real value.
  const [daveningModalOpen, setDaveningModalOpen] = useState(!!openDaveningModal)
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
  const tagFields = fields.filter((f) => f.type === 'tags')
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
    const observer = new IntersectionObserver(([entry]) => setControlsStuck(!entry.isIntersecting), {
      threshold: 0,
      rootMargin: '-56px 0px 0px 0px',
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])
  const scrollItemIntoView = (id: string, behavior: ScrollBehavior) => {
    const el = itemRowRefs.current.get(id)
    if (!el) return
    const headerH = (document.querySelector('header')?.getBoundingClientRect().height ?? 64) + 12
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
      const el = itemRowRefs.current.get(id)
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
    // Settle-aware, not a plain one-shot scrollItemIntoView — this list can
    // still reorder right after mount (distance sort landing once
    // geolocation resolves is the common case: a `?item=` deep link into a
    // distance-sorted category, opened before a location's ever been set).
    // A scroll measured before that reorder lands targets the row's
    // pre-reorder position, so the visitor ends up scrolled to wherever
    // that used to be — short of or past where the reopened listing
    // actually settled, off by however far the reorder moved it.
    if (reopenItemId) return scrollItemIntoViewWhenSettled(reopenItemId, 'instant')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — only fire on mount

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

  const q = search.trim().toLowerCase()
  const tokens = q.split(/\s+/).filter(Boolean)
  // Every word must appear somewhere in the listing's search text — name, address,
  // tags, or scalar detail fields (AND across words). Shares listingSearchText with
  // the landing search, so a place tapped there ("kosher cheese") survives this filter.
  const matchesSearch = (item: DirectoryResource) => {
    if (tokens.length === 0) return true
    const hay = listingSearchText(item, category)
    return tokens.every((t) => hay.includes(t))
  }

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
        // Item must be open right now according to at least one filterable hours field.
        const isOpen = hoursFields
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
      return upvotes && sortByPopular
        ? liveCount(b) - liveCount(a) || travelCompare(a, b)
        : travelCompare(a, b)
    })

  // Aligns each visual row's content to the same height — real per-card
  // measurement (see GenericListingCardHandle's own doc), not a guess based
  // on name length or anything else static. An earlier version reserved a
  // fixed 2-line name height across an entire CATEGORY the moment any one
  // listing's name was long enough to wrap — which put a blank gap between
  // the name and address on every OTHER card in that category too, most of
  // which were nowhere near the actual long-named listing and never needed
  // it. This only ever adjusts a card that's actually sharing a row with a
  // taller one, and never touches the name/address gap at all.
  //
  // Two independent spacer segments, not one — the popularity/distance LINE
  // itself needs to land at the same height across a row (not just the
  // badges further down it), so the single old spacer (address/header-text
  // block → badge row) is split into segment 1 (→ upvote/distance row) and
  // segment 2 (upvote/distance row → badge row). Segment 2 is measured and
  // applied AFTER segment 1 is applied, not in the same pass — its "from"
  // point is the upvote row's own rendered bottom edge, which shifts once
  // segment 1's spacer above it changes height.
  //
  // Row membership is read from the DOM (itemRowRefs' own getBoundingClientRect
  // top, rounded, grouped) rather than computed from column count — this
  // grid's auto-fill column count depends on the container's actual pixel
  // width, which isn't something to re-derive here when the browser has
  // already laid it out.
  const filteredIds = filtered.map((item) => item.id).join(',')
  useLayoutEffect(() => {
    function groupRows() {
      const rows = new Map<number, string[]>()
      for (const item of filtered) {
        const rowEl = itemRowRefs.current.get(item.id)
        if (!rowEl) continue
        const top = Math.round(rowEl.getBoundingClientRect().top)
        const existing = rows.get(top)
        if (existing) existing.push(item.id)
        else rows.set(top, [item.id])
      }
      return [...rows.values()]
    }

    function alignRows() {
      // Reset every spacer first — a stale spacer from a previous pass
      // (or a previous, wider layout) would otherwise inflate this pass's
      // own reading of "natural" content height.
      for (const item of filtered) {
        cardRefs.current.get(item.id)?.setUpvoteSpacerHeight(0)
        cardRefs.current.get(item.id)?.setBadgeSpacerHeight(0)
      }

      const rows = groupRows()

      // Segment 1: card root → upvote/distance row. Only among cards that
      // actually have one — a card with no upvote row has nothing to align
      // at this segment, and gets its total height caught up entirely by
      // segment 2 instead (measureBadgeGap falls back to the card root when
      // there's no upvote row).
      for (const ids of rows) {
        if (ids.length < 2) continue
        const heights = ids
          .map((id) => [id, cardRefs.current.get(id)?.measureUpvoteRowOffset()] as const)
          .filter((pair): pair is [string, number] => pair[1] !== null && pair[1] !== undefined)
        if (heights.length < 2) continue
        const max = Math.max(...heights.map(([, h]) => h))
        for (const [id, h] of heights) {
          if (max - h > 0) cardRefs.current.get(id)?.setUpvoteSpacerHeight(max - h)
        }
      }

      // Segment 2: upvote/distance row's own bottom (or the card root, for
      // a card with no upvote row) → badge row. Measured after segment 1 is
      // applied, since it reads the upvote row's real rendered position.
      for (const ids of rows) {
        if (ids.length < 2) continue
        const heights = ids
          .map((id) => [id, cardRefs.current.get(id)?.measureBadgeGap()] as const)
          .filter((pair): pair is [string, number] => pair[1] !== null && pair[1] !== undefined)
        if (heights.length < 2) continue
        const max = Math.max(...heights.map(([, h]) => h))
        for (const [id, h] of heights) {
          if (max - h > 0) cardRefs.current.get(id)?.setBadgeSpacerHeight(max - h)
        }
      }
    }

    alignRows()

    // Column count (and therefore row membership) depends on the grid's
    // actual pixel width, which only a real resize can change — window
    // resize, not a ResizeObserver on any one card, is what should trigger
    // a re-pass here.
    window.addEventListener('resize', alignRows)
    return () => window.removeEventListener('resize', alignRows)
    // Re-aligns when the actual rendered SET of listings changes
    // (filter/search/sort narrows or reorders it) — filteredIds, not
    // filtered itself: a vote-count-only re-render produces a new array
    // reference with the same ids in the same order, which shouldn't
    // trigger a re-pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredIds])

  // fromId is the card issuing the request (arrow key pressed while ITS
  // dialog is open) — direction moves through `filtered`, the same order
  // rendered below, so "next" always matches what's actually next on
  // screen. A no-op past either end rather than wrapping: looping from the
  // last listing back to the first (or vice versa) reads as the arrow key
  // doing something unrelated to what was just on screen, not as "there's
  // more."
  const navigateFromCard = (fromId: string, direction: 1 | -1) => {
    const index = filtered.findIndex((i) => i.id === fromId)
    const target = filtered[index + direction]
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

  const searchPlaceholder =
    tagFields.length > 0
      ? isMobile
        ? `Search ${category.pluralLabel.toLowerCase()} or items…`
        : `Search ${category.pluralLabel.toLowerCase()} or kosher items (e.g. cheese)…`
      : 'Search…'

  // The toolbar row (filters + sort) only renders when there's something in it;
  // a select needs ≥2 distinct values before it's worth showing.
  const hasRenderedSelects = filterableSelects.some(
    (f) => new Set(items.flatMap((item) => selectValues(item[f.key]))).size >= 2,
  )
  // Whether there's an actual filter control to show — as opposed to
  // `hasFilterRow` below, which also covers the sort toggle/davening button
  // that can appear in this same row without any filter existing at all. Gates
  // the "Filters" toggle button itself so it doesn't show (opening onto an
  // empty panel) for a category with upvotes/minyanim but no filterable field.
  const hasActualFilters = filterableBooleans.length > 0 || hasRenderedSelects || hasFilterableHours
  const hasFilterRow = hasActualFilters || !!upvotes || hasMinyanim

  const hasActiveFilters =
    search.trim() !== '' ||
    Object.values(boolFilters).some(Boolean) ||
    Object.values(selectFilters).some((v) => v.length > 0) ||
    openNow

  const activeFilterCount =
    Object.values(boolFilters).filter(Boolean).length +
    Object.values(selectFilters).filter((v) => v.length > 0).length +
    (openNow ? 1 : 0)
  const clearAll = () => {
    setSearch('')
    setBoolFilters({})
    setSelectFilters({})
    setOpenNow(false)
  }

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

  return (
    <div>
      <CategoryBandFrame color={bandColor} imageUrl={bandImage}>
          {/* Mobile used to have its own "‹ {upLabel}" row here (UpButton,
              desktop:hidden) alongside DirectoryHeader's desktop-only Breadcrumb.
              It's gone now that useSetScreenHeader (above) puts the same "‹
              {title}" control directly in SiteHeader on mobile — this component
              no longer needs to render its own copy of it. Desktop is
              unaffected: Breadcrumb still renders exactly as before. */}

          <DirectoryHeader
            title={category.pluralLabel}
            count={filtered.length}
            hasAddress={category.hasAddress}
            anchorLabel={anchorLabel}
            addressPrompt={addressPrompt}
            upLabel={upLabel}
            onUp={onUp}
            titleInHeader
            banner={categoryBadge}
            actions={
              <>
                {canAdd && (
                  <button
                    onClick={onAdd}
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary border border-primary rounded-md px-3 py-1.5 hover:bg-primary hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <PlusIcon className="h-4 w-4" /> Add
                  </button>
                )}
              </>
            }
          />

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
          it's for. */}
      <div ref={controlsSentinelRef} aria-hidden className="lg:h-px" />
      <div
        ref={controlsRef}
        // The "docked" look (white background, the padding it needs, the
        // negative margin that pulls it flush against the header above, the
        // shadow, and the hide-on-scroll transform) only ever applies once
        // `controlsStuck` says the bar has actually engaged its sticky
        // position. Applying `lg:-mt-3`/`lg:bg-white` unconditionally used to
        // pull this bar's own solid background up 12px REGARDLESS of scroll
        // position — while still sitting in normal flow, that overlapped
        // whatever sat directly above it (DirectoryHeader's Add button),
        // clipping its bottom few pixels even on a page load with no
        // scrolling at all. The hide-on-scroll transform had the same bug in
        // reverse: applied unconditionally, it reacted to ANY downward
        // scroll on the page, so the bar slid away while a visitor was still
        // scrolling through content well above it — before it had ever
        // become sticky, let alone been scrolled past.
        className={`mb-4 space-y-2 lg:sticky lg:top-14 lg:z-30 lg:transition-transform lg:duration-300 ${
          controlsStuck
            ? `lg:bg-white lg:pt-3 lg:pb-3 lg:-mt-3 lg:shadow-[0_6px_12px_-8px_rgba(15,23,42,0.35)] ${controlsVisible ? 'lg:translate-y-0' : 'lg:-translate-y-full'}`
            : 'lg:translate-y-0'
        }`}
      >
        {showSearch && (
          <div className="relative">
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}
        {showSearch && q && tagFields.length > 0 && (
          <p className="text-xs text-muted">Showing places matching &ldquo;{search.trim()}&rdquo;</p>
        )}
        {hasFilterRow && (
          <>
            {/* ── Mobile: Filters + Map buttons, then sort toggle — all one line ── */}
            <div className="flex items-center gap-1.5 desktop:hidden">
              {hasActualFilters && (
                <button
                  onClick={() => setFiltersOpen((v) => !v)}
                  className={[
                    'inline-flex items-center gap-1.5 px-2.5 py-2 text-sm font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap',
                    activeFilterCount > 0
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50',
                  ].join(' ')}
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d="M3 4a1 1 0 000 2h14a1 1 0 000-2H3zm3 5a1 1 0 000 2h8a1 1 0 000-2H6zm2 5a1 1 0 000 2h4a1 1 0 000-2H8z" />
                  </svg>
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/30 text-xs font-bold">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              )}
              {/* No mobile Map button here (desktop keeps its own, further
                  down) — mobile already has a persistent, always-visible way
                  to reach the map via the bottom tab bar, so this was a
                  second copy of the same destination. Removed rather than
                  made "smarter" (e.g. carrying the category along
                  automatically): a global nav element quietly behaving
                  differently depending on where you tapped it from breaks
                  the one thing it's supposed to guarantee — that it always
                  means the same thing. */}
              {category.externalLink && (
                <a
                  href={category.externalLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex items-center gap-1 px-2.5 py-2 text-sm font-medium rounded-md border bg-white text-slate-600 border-slate-300 hover:bg-slate-50 transition-colors whitespace-nowrap"
                >
                  {category.externalLink.label} ↗
                </a>
              )}
              {hasMinyanim && (
                <button
                  onClick={() => setDaveningModalOpen(true)}
                  aria-label="All davening times"
                  title="All davening times"
                  className={[
                    'inline-flex items-center gap-1 px-2.5 py-2 text-sm font-medium rounded-md border bg-white text-slate-600 border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap',
                    !upvotes && !category.externalLink ? 'ml-auto' : '',
                  ].join(' ')}
                >
                  <ClockIcon className="h-4 w-4" />
                  {/* Full label once the row has room — hidden below this so it
                      never crowds Filters/Map on the narrowest phones. */}
                  <span className="hidden min-[390px]:inline">All davening times</span>
                </button>
              )}
              {upvotes && (
                <div
                  className={[
                    'flex rounded-md border border-slate-300 overflow-hidden',
                    !hasMinyanim && !category.externalLink ? 'ml-auto' : '',
                  ].join(' ')}
                >
                  {[{ v: true, label: 'Popularity' }, { v: false, label: 'Distance' }].map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => selectSort(opt.v)}
                      className={[
                        'px-2.5 py-2 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap',
                        sortByPopular === opt.v ? 'bg-primary text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
                      ].join(' ')}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Filter controls: collapsible on mobile, always visible on desktop —
                    one horizontally-scrolling line on both, never wrapping to a
                    second row (a wrapped row read as broken/cut-off layout). This
                    same row also carries the desktop versions of external
                    link/davening/sort (their mobile versions are in the row above),
                    so it still renders even with no actual filter — just without a
                    mobile Filters button to open it (that's gated separately). ── */}
            <div
              className={[
                'gap-2 flex-nowrap overflow-x-auto pb-1',
                filtersOpen ? 'flex' : 'hidden',
                'desktop:flex',
              ].join(' ')}
              style={{ scrollbarWidth: 'none' }}
            >
              {hasFilterableHours && (
                <button
                  onClick={() => setOpenNow((v) => !v)}
                  className={[
                    'inline-flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap',
                    openNow
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50',
                  ].join(' ')}
                >
                  <span className={['inline-block h-2 w-2 rounded-full', openNow ? 'bg-white' : 'bg-green-500'].join(' ')} aria-hidden="true" />
                  Open now
                </button>
              )}
              {filterableBooleans.map((f) => {
                const active = !!boolFilters[f.key]
                return (
                  <button
                    key={f.key}
                    onClick={() => setBoolFilters((prev) => ({ ...prev, [f.key]: !prev[f.key] }))}
                    className={[
                      'shrink-0 px-3 py-2 text-sm font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap',
                      active ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    {f.filterLabel ?? f.label}
                  </button>
                )
              })}
              {filterableSelects.map((f) => {
                const presentValues = Array.from(new Set(items.flatMap((item) => selectValues(item[f.key])))).sort()
                if (presentValues.length < 2) return null
                const chosen = selectFilters[f.key] ?? []
                const toggle = (v: string) =>
                  setSelectFilters((prev) => {
                    const cur = prev[f.key] ?? []
                    return { ...prev, [f.key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] }
                  })
                // The filter always lets a visitor pick more than one value to
                // filter by, regardless of whether a single listing can hold more
                // than one value (that's `f.multiSelect`, a separate, per-listing
                // setting — see CategoryField.multiSelect).
                const isOpen = openDropdown === f.key
                const label = chosen.length === 0
                  ? `All ${f.filterLabel ?? f.label}s`
                  : chosen.length === 1
                  ? chosen[0]
                  : `${chosen.length} selected`
                return (
                  <CheckboxDropdown
                    key={f.key}
                    label={label}
                    active={chosen.length > 0}
                    isOpen={isOpen}
                    onToggleOpen={() => setOpenDropdown(isOpen ? null : f.key)}
                    onClose={() => setOpenDropdown(null)}
                    values={presentValues}
                    chosen={chosen}
                    onToggle={toggle}
                  />
                )
              })}
              {/* No desktop Map button either now — same reasoning as
                  mobile's removal above: the header's own "Map" nav link
                  (HeaderNav.tsx) is already a persistent, always-visible way
                  to reach the map from any screen. One generic Map entry
                  point per platform (the header link on desktop, the bottom
                  tab on mobile), not a second copy scoped to whichever
                  category you happen to be on. */}
              {category.externalLink && (
                <a
                  href={category.externalLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden desktop:inline-flex desktop:ml-auto shrink-0 items-center gap-1 px-3 py-2 text-sm font-medium rounded-md border bg-white text-slate-600 border-slate-300 hover:bg-slate-50 transition-colors whitespace-nowrap"
                >
                  {category.externalLink.label} ↗
                </a>
              )}
              {hasMinyanim && (
                <button
                  onClick={() => setDaveningModalOpen(true)}
                  className={[
                    'hidden desktop:inline-flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border bg-white text-slate-600 border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap',
                    !upvotes && !category.externalLink ? 'desktop:ml-auto' : '',
                  ].join(' ')}
                >
                  <ClockIcon className="h-4 w-4" />
                  All davening times
                </button>
              )}
              {upvotes && (
                <div
                  className={[
                    'hidden desktop:flex rounded-md border border-slate-300 overflow-hidden shrink-0',
                    !hasMinyanim && !category.externalLink ? 'desktop:ml-auto' : '',
                  ].join(' ')}
                >
                  {[{ v: true, label: 'Popularity' }, { v: false, label: 'Distance' }].map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => selectSort(opt.v)}
                      className={[
                        'px-3 py-2 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap',
                        sortByPopular === opt.v ? 'bg-primary text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
                      ].join(' ')}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-muted">
            {hasActiveFilters
              ? `No ${category.pluralLabel.toLowerCase()} match your search.`
              : `No ${category.pluralLabel.toLowerCase()} listed yet.`}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {hasActiveFilters && (
              <button
                onClick={clearAll}
                className="text-sm font-medium text-slate-600 border border-slate-300 rounded-md px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Clear search &amp; filters
              </button>
            )}
            {canAdd && (
              <button
                onClick={onAdd}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary border border-primary rounded-md px-3 py-1.5 hover:bg-primary hover:text-white transition-colors cursor-pointer"
              >
                <PlusIcon className="h-4 w-4" /> Add {category.label.toLowerCase()}
              </button>
            )}
          </div>
        </div>
      ) : (
        // sm+ (640px — matches useIsMobile's own cutover, not an arbitrary
        // choice), not lg+: a grid instead of a single column — see
        // GenericListingCard's isMobile split, which is what makes this
        // safe: desktop cards open their detail in a dialog rather than
        // expanding in place, so a card growing taller never has to fight
        // its grid neighbors for space. Anchoring the breakpoint to `lg`
        // (1024px) instead of this made the grid jump straight from 3
        // columns to 1 the moment the window narrowed past 1024 — nothing
        // in between ever got a chance to be 2, since 1024px of content
        // width is already comfortably enough for auto-fill to reserve all
        // 3 of its 280px tracks. Starting the grid at `sm` instead means
        // auto-fill (see its own doc below) does the same job it already
        // does at 3 columns, just also at the narrower widths where only 2
        // of those tracks actually fit — a real 3 → 2 → 1 progression
        // driven by the same mechanism, not a second one bolted on.
        //
        // auto-fill, not auto-fit and not a fixed grid-cols-2/xl:grid-cols-3.
        //
        // Not fixed columns: a sparse category (Networking's 7 plain
        // name+link cards, WhatsApp Groups' 2) doesn't know how many items
        // it has ahead of time, and a fixed column count left short
        // categories with cards pinned to the top-left of a max-w-6xl row.
        //
        // Not a definite max like 448px in place of 1fr (tried and reverted
        // — see git history if this comes up again): how many tracks
        // auto-fill/auto-fit even creates is computed from a track's MAX
        // sizing function when it's definite — swap in a definite max and
        // the browser counts columns using THAT instead of the 280px
        // minimum, so a full 72-listing category collapsed from its normal
        // 3-up layout down to 2 much-wider columns with dead space reserved
        // on the right (`getComputedStyle` showed `448px 448px`, not three
        // tracks). `1fr` is a flex value, not definite, so the count falls
        // back to the 280px minimum, same as before any of this.
        //
        // Not auto-fit: auto-fit COLLAPSES a track with nothing placed in
        // it, and a collapsed track's `1fr` share gets redistributed to
        // whatever tracks remain — so with only 1-2 real listings, the
        // handful of tracks that DO exist grow to split the ENTIRE row
        // between just them, each item then sitting left-aligned in an
        // oversized track (confirmed live: a 2-item row left a 118px gap
        // between the cards, not the normal 12px). auto-fill reserves the
        // SAME number of tracks a full row would (still computed from the
        // 280px minimum) whether or not there's a card to put in each one —
        // an unfilled trailing track keeps its normal 1fr share as empty
        // space at the END of the row, not redistributed into the cards
        // that do exist, so 1-2 real listings render at the exact same
        // width and gap a full row's cards would, just followed by blank
        // space instead of more cards. Verified live: 3 tracks reserved,
        // each ~365px (the same width as the full 72-listing case), cards
        // packed with the normal 12px gap between them.
        //
        // lg:max-w-md on each item below is a safety cap, not the mechanism
        // doing the work here — it only matters on a viewport wide enough
        // that even a properly-counted track's 1fr share would exceed a
        // normal card's width.
        <div className="space-y-2 sm:space-y-0 sm:grid sm:gap-3 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
          {filtered.map((item, index) => (
            // sm:max-w-md (matches the grid's own breakpoint above), no
            // auto-margin: a 1fr track stretches to the
            // grid's normal per-column share, which is fine once there are
            // enough cards to fill it (the typical case) — capped here only
            // matters when a sparse row hands one card way more than a
            // normal card's worth of width. CSS Grid's default item
            // alignment (justify-self: stretch) falls back to sitting at the
            // START of an over-wide track once max-width stops it from
            // actually filling that track — this needs nothing explicit to
            // left-align, and previous attempts that added `mx-auto` here
            // were undoing that default to center it instead, which is the
            // opposite of what a normal packed-left layout looks like.
            <div key={item.id} ref={setItemRowRef(item.id)} className="sm:max-w-md">
            <GenericListingCard
              ref={setCardRef(item.id)}
              onNavigate={(direction) => navigateFromCard(item.id, direction)}
              hasPrev={index > 0}
              hasNext={index < filtered.length - 1}
              item={item}
              category={category}
              showCategoryLabel={false}
              // Same signal the header's prompt already uses: no location set,
              // and this category is distance-based. In the row it is the one
              // that gets seen — the header's pill sits above the fold once.
              showDistanceSlot={addressPrompt}
              upvotes={upvotes}
              count={liveCount(item)}
              defaultExpanded={item.id === reopenItemId}
              onVote={(c) => setVoteCounts((prev) => ({ ...prev, [item.id]: c }))}
              onTagClick={setSearch}
              onFilterOpen={() => setOpenNow((v) => !v)}
              onFilterBool={(key) => setBoolFilters((prev) => ({ ...prev, [key]: !prev[key] }))}
              onFilterSelect={(key, value) =>
                setSelectFilters((prev) => {
                  const cur = prev[key] ?? []
                  // Add/remove this value from the filter's chosen set. Clicking
                  // the badge again undoes it.
                  return { ...prev, [key]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] }
                })
              }
              onEdit={() => onEdit(item)}
              onReport={() => onReport(item)}
            />
            </div>
          ))}
        </div>
      )}
      </CategoryBandFrame>

      {hasMinyanim && (
        <DaveningTimesModal
          items={items}
          isOpen={daveningModalOpen}
          onClose={() => setDaveningModalOpen(false)}
          initialDenomination={selectFilters['denomination']?.[0] ?? ''}
          // Comma-separated (see this prop's own doc), each piece validated
          // against the real day-key set rather than a bare cast — this
          // came in through a URL query param, so it's untrusted input, and
          // a garbage piece should just drop out rather than being handed
          // to the modal as if it were a real MinyanDayKey. undefined (not
          // an empty array) when nothing valid survives, so the modal falls
          // back to its own "Today" default instead of an empty filter.
          initialDayFilter={(() => {
            const days = (initialDaveningDay ?? '')
              .split(',')
              .filter((d): d is MinyanDayKey => (ALL_MINYAN_DAYS as string[]).includes(d))
            return days.length > 0 ? days : undefined
          })()}
        />
      )}
    </div>
  )
}
