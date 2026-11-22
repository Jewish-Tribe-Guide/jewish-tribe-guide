'use client'

import { Suspense, useEffect, useEffectEvent, useMemo, useState, type ReactNode } from 'react'
import type { DirectoryResource } from '@/types'
import { resolveCapabilities, selectValues, type CategoryConfig } from '@/lib/categories'
import { useNow } from '@/lib/useNow'
import { isMinyanim } from '@/lib/davening'
import type { Minyan } from '@/lib/davening'
import DirectoryHeader from './DirectoryHeader'
import { TellAboutContext } from './tellAbout'
import DistanceNote from './DistanceNote'
import Image from 'next/image'
import { photoProps } from '@/lib/imageHosts'
import { NextMinyans } from './nextMinyans'
import { CategoryBandFrame } from './CategoryBandFrame'
import FiltersSheet from './FiltersSheet'
import { milesChosen, tefillosChosen } from '@/lib/minyanimFilters'
import { kindText } from '@/lib/listingView'
import ListHeading, { ClosedGroupLine, GroupHeading } from './ListHeading'
import { groupListings, parseGroupBy } from '@/lib/listGroups'
import { candlesToday, isVouchedFor } from '@/lib/listingRow'
import { useZmanim } from '@/lib/useZmanim'
import MinyanimView from './MinyanimView'
import { AddButton } from '@/components/AddButton'
import { useIsMobile, useMeasuredIsMobile } from '@/lib/useIsMobile'
import { useScrollShowHide, useSetScreenHeader } from '@/lib/headerVisibility'
import { foundFor, searchAsk } from '@/lib/askSearch'
import { readMinyanimSearch } from '@/lib/minyanimSearch'
import { withoutSortWords } from '@/lib/ask'
import { neighborhoodsFor, placeName, townsFrom } from '@/lib/places'
import { itemCounts, itemFields, listingItems } from '@/lib/itemFilter'
import { itemName } from '@/lib/itemNames'
import { learnFrom } from '@/lib/askReader'
import { useLearnAfterPause } from '@/lib/useLearnAfterPause'
import type { ListingOnwardSource } from './listingOnward'
import ListingColumn from './ListingColumn'
import UpvoteButton from './UpvoteButton'
import { useActiveCommunity, useOptionalCommunitySlug, useContributions } from '@/lib/communityContext'
import { useLogSearchMiss } from '@/lib/useLogSearchMiss'
import CategoryAsk from './CategoryAsk'
import MinyanSwitch from './MinyanSwitch'
import { WalkOnMapContext } from './walkOnMap'
import RowLookSwitch from './RowLookSwitch'
import { routes } from '@/lib/routes'
import { ui } from '@/lib/uiConfig'
import { useCategories } from '@/lib/useCategories'
import { getCategoryColor, getCategoryTilePhoto } from '@/lib/categoryColor'
import dynamic from 'next/dynamic'
import { tellUsPlaceholder } from '@/lib/tellUs'
import { TappedMinyanContext, type TappedMinyan } from './TappedMinyan'
import SearchAnnouncer from '@/components/SearchAnnouncer'

import { LISTING_STEP, type ParamsOpts } from './directoryAddress'
export type { ParamsOpts } from './directoryAddress'
import { useDirectorySearch } from './useDirectorySearch'
import { useMinyanimView } from './useMinyanimView'
import { useFiltersInAddress } from './useFiltersInAddress'
import { useControlsStuck } from './useControlsStuck'
import { useRowScroller } from './useRowScroller'
import { useListingCards } from './useListingCards'
import { useGroupOpenness } from './useGroupOpenness'
import { filterDirectory } from './filterDirectory'
import { useTellUs } from './useTellUs'
import { useMapBeside } from './useMapBeside'
import ControlsBar from './ControlsBar'
import CategoryHero from './CategoryHero'
import EmptyList from './EmptyList'
import MapBeside from './MapBeside'
import { sheetFilters } from './sheetFilters'
import { useSearchSave } from './useSearchSave'
import { useQuestionCard } from './useQuestionCard'
import { rowExpanded } from './rowExpanded'
import DirectoryList from './DirectoryList'
import { useMinyanQuestion } from './useMinyanQuestion'
import { useSortChoice } from './useSortChoice'

// Loaded on the first tap of "+": nobody browsing pays for the box.
const TellUsSheet = dynamic(() => import('@/components/TellUsSheet'), { loading: () => null })

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
  /** The minyan in Minyanim by time that opened a listing here, for that
   *  listing to open on (TappedMinyan). */
  tappedMinyan?: TappedMinyan | null
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

export default function GenericDirectory({ category, items, anchorLabel, addressPrompt, reopenItemId, linkedItemId = null, reopenMatch = null, tappedMinyan = null, initialSearch, initialOpenNow, initialFilters, openMinyanimView, initialDaveningDay, onUp, onEdit, onParamsChange }: Props) {
  // Hands the shared header this screen's own title + "up" handler — on
  // mobile, SiteHeader shows "‹ {category.pluralLabel}" in place of the site
  // name while this is mounted, and reverts automatically on unmount (see
  // useSetScreenHeader's own doc). Always active: every caller of this
  // component (categories, hospitals, synagogues) is a second-level screen a
  // visitor drilled into, never the home grid itself. Called further down,
  // once it's known whether a listing is this screen (a phone, from a link).

  // Which card currently has its listing open — the desktop column or the
  // mobile sheet. On a phone the floating Add button steps aside while it's
  // up: the listing's own row (Suggest an edit, its overflow) passes under
  // it as the sheet scrolls. On desktop nothing passes under it, so it stays
  // (Oct 6: "not seeing the add button"), for adding anything; the listing
  // itself is Suggest an edit's, which opens the box about it
  // (ListingEditBar, via TellAboutContext).
  // A listing's own link starts open, so its page is what's first painted;
  // its row opening it after the page loaded painted the whole list first
  // (the user, Nov 22; e2e/first-paint.spec.ts).
  const [openDialogItemId, setOpenDialogItemId] = useState<string | null>(linkedItemId)
  // Drives the "Open now" filter below. Without it the filter answers for the
  // moment the page rendered, so a list narrowed to what's open at 4pm still
  // shows those places at 10pm. Null until the page has hydrated (see
  // useNow): nothing here guesses the time.
  const clock = useNow()
  const now = clock === null ? null : new Date(clock)

  const { search, setSearch, boolFilters, setBoolFilters, selectFilters, setSelectFilters, hasFilters, setHasFilters, landedSearch, openNow, setOpenNow } = useDirectorySearch({
    category,
    initialSearch,
    initialOpenNow,
    initialFilters,
    onParamsChange,
  })
  // Distance first, always, Popular only with nothing to measure from
  // (useSortChoice).
  const centerDistances = items.some((i) => i.milesFromCenter != null)
  const canSortByDistance = !!anchorLabel || centerDistances
  const { sortByPopular, setSortByPopular, touchedSortRef } = useSortChoice(canSortByDistance)
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({})
  // The Filters sheet (see ListHeading and FiltersSheet).
  const [filtersOpen, setFiltersOpen] = useState(false)
  const { minyanimViewOn, setMinyanimViewOn, showMinyanimView, closeMinyanimView } = useMinyanimView(openMinyanimView, onParamsChange)
  // The Minyanim view's own Filters (Oct 15): Tefillah, and How far, one at
  // a time; and how many minyanim it shows, for the sheet's Show button.
  const [minyanTefillos, setMinyanTefillos] = useState<string[]>([])
  const [minyanWithin, setMinyanWithin] = useState<string | null>(null)
  const [minyanimShowing, setMinyanimShowing] = useState(0)
  const isMobile = useIsMobile()
  // For getCategoryColor and the tile's picture below, as the home reads them.
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

  useFiltersInAddress({ category, boolFilters, selectFilters, hasFilters, onParamsChange })

  // "All davening times" — only for categories with a `minyanim`-type field
  // (today, just Synagogues) and at least one listing with structured data.
  const minyanimField = fields.find((f) => f.type === 'minyanim')
  const hasMinyanim =
    !!minyanimField &&
    items.some((item) => isMinyanim(item[minyanimField.key]) && (item[minyanimField.key] as Minyan[]).length > 0)

  const upvotes = !!category.upvotesEnabled && ui.upvotes
  // Per-category capabilities layered under the global `ui.*` master switches.
  const caps = resolveCapabilities(category.capabilities)
  const contributions = useContributions()
  const canAdd = contributions.add && caps.add
  const { tellOpen, setTellOpen, tellMounted, openItem, setOpenItem, editYourself, tellTimes, tellMenu, tellAbout } = useTellUs()
  // Adding to a shul's times is an edit to the shul ("+ Add a minyan").
  const canEdit = contributions.edit && caps.edit
  const showSearch = ui.search.directory && caps.directorySearch
  const liveCount = (item: DirectoryResource) => voteCounts[item.id] ?? item.upvotes ?? 0

  const { controlsSentinelRef, controlsStuck } = useControlsStuck(isMobile)
  const { setItemRowRef, controlsRef, listingColumnRef, scrollItemIntoViewWhenSettled } = useRowScroller()

  const { cardRefs, setCardRef, openCardIdsRef } = useListingCards({ reopenItemId, scrollItemIntoViewWhenSettled })

  // On the Minyanim tab, what's typed narrows the minyanim (MinyanimView,
  // the user's note 4): it isn't a search of the shuls, nor a question for
  // the reader.
  const searchingMinyanim = hasMinyanim && minyanimViewOn
  // What the list is searched by: the box, unless what's in it is a
  // question already turned into the Filters (see landedSearch).
  const searchedFor = landedSearch !== null && search === landedSearch ? '' : search
  const q = searchingMinyanim ? '' : searchedFor.trim().toLowerCase()
  const communitySlug = useOptionalCommunitySlug()
  // Read as a question, the same way as the home search (see askSearch.ts),
  // limited to this category — so a place tapped there ("where can I get
  // cholov yisroel milk") survives this filter, and "kosher food" on the
  // restaurant page means every restaurant rather than none.
  // Each match keeps what it matched on (see SearchFound), for the card to
  // say why it's here and the listing to mark it once opened.
  const todayResult = useMemo(
    () => (q ? searchAsk(items, [category], searchedFor, { categoryId: category.id, places: neighborhoodsFor(communitySlug) }) : null),
    [q, items, category, searchedFor, communitySlug],
  )
  // The Minyanim view's search, past its tefillos, days and "near me"
  // (readMinyanimSearch), goes through that same search of the shuls: so
  // "orthodox" there is Denomination ticked, a typo or a neighbourhood
  // finds what it finds on the list (the user, Oct 15: the list searched
  // well and the view didn't). It had its own name match.
  const minyanShulWords = useMemo(() => {
    const sought = searchingMinyanim ? readMinyanimSearch(searchedFor) : null
    // A trailing space says the last word is finished, as typed.
    return sought?.terms.length ? `${sought.terms.join(' ')}${/\s$/.test(searchedFor) ? ' ' : ''}` : ''
  }, [searchingMinyanim, searchedFor])
  const minyanShulResult = useMemo(
    () => (minyanShulWords ? searchAsk(items, [category], minyanShulWords, { categoryId: category.id, places: neighborhoodsFor(communitySlug) }) : null),
    [minyanShulWords, items, category, communitySlug],
  )
  const todayMatches = useMemo(
    () => (todayResult ? new Map(todayResult.hits.map((h) => [h.item.id, foundFor(h, todayResult)])) : null),
    [todayResult],
  )

  // A minyan question typed over the list of shuls is asked of Minyanim by
  // time (useMinyanQuestion).
  const minyanQuestion = hasMinyanim && !minyanimViewOn && !!todayResult?.query.minyan
  useMinyanQuestion({ minyanQuestion, minyanimViewOn, setMinyanimViewOn, search })
  // ── The order the search asks for ──
  // "Pizza near me", "closest pizza": nearest first; "best pizza", "sort by
  // popularity": most liked first, while it's in the box, whatever the Sort
  // was on ("restaurant near me" came back by popularity, fixes table Sep
  // 29). The Sort button says which (Oct 10), and picking the other order
  // there takes the words out of the box (selectSort), so the two never
  // disagree.
  const askedQuery = q ? todayResult?.query : undefined
  const askedOrder: 'nearest' | 'popular' | null = askedQuery?.nearMe ? 'nearest' : askedQuery?.best && upvotes ? 'popular' : null
  const byPopular = askedOrder ? askedOrder === 'popular' : sortByPopular
  const askMatches = todayMatches
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
  // Ticked in Has, the items say why each listing is in the list
  // ("Challah · sometimes"), as a search for them would.
  const hasChosen = Object.entries(hasFilters).filter(([, v]) => v.length > 0)
  const hadItems = (item: DirectoryResource) => {
    if (hasChosen.length === 0) return null
    const wanted = new Set(hasChosen.flatMap(([, v]) => v.map((t) => itemName(t).toLowerCase())))
    const its = hasChosen.flatMap(([key]) => listingItems(item, key)).filter((t) => wanted.has(t.tag.toLowerCase()))
    return its.length ? { terms: [], items: its, fields: [] } : null
  }
  const foundOn = (item: DirectoryResource) =>
    askMatches?.get(item.id) ?? hadItems(item) ?? (item.id === reopenItemId && closedMatchFor !== reopenKey ? reopenFound : null)

  const filtered = filterDirectory(items, {
    matchesSearch,
    filterableBooleans,
    boolFilters,
    filterableSelects,
    selectFilters,
    hasFilters,
    openNow,
    hasFilterableHours,
    now,
    hoursFields,
    upvotes,
    byPopular,
    liveCount,
  })

  // fromId is the listing open in the column (its ‹ ›, or an arrow key) —
  // direction moves through `filtered`, the same order
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
    // 'instant', not 'smooth' — confirmed live (with the computer's old
    // listing dialog): closing one card and opening the next's mutates enough DOM in the same moment that
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
  //
  // Distances from the community's centre count as something to sort by
  // (the user, Oct 10): the list already shows "12 mi" from central
  // Philadelphia, so Distance sorts by those, and "Use my location" above
  // the list is there for a real one. The picker opens only when there are
  // no distances at all.
  const selectSort = (popular: boolean) => {
    if (!popular && !canSortByDistance) {
      document.dispatchEvent(new CustomEvent('jpc:open-location'))
      return
    }
    touchedSortRef.current = true
    setSortByPopular(popular)
    if (askedOrder && (askedOrder === 'popular') !== popular) setSearch((prev) => withoutSortWords(prev, askedOrder))
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
  // "Has", for each item list some listing here has anything in.
  const itemsToShow = itemFields(category).flatMap((f) => {
    const counts = itemCounts(items, f.key)
    return counts.length === 0 ? [] : [{ key: f.key, label: 'Has', counts }]
  })
  const hasActualFilters = filterableBooleans.length > 0 || selectsToShow.length > 0 || hasFilterableHours || itemsToShow.length > 0
  const typed = !searchingMinyanim && search.trim() !== ''

  const hasActiveFilters =
    typed ||
    Object.values(boolFilters).some(Boolean) ||
    Object.values(selectFilters).some((v) => v.length > 0) ||
    Object.values(hasFilters).some((v) => v.length > 0) ||
    openNow

  const activeFilterCount =
    Object.values(boolFilters).filter(Boolean).length +
    Object.values(selectFilters).filter((v) => v.length > 0).length +
    Object.values(hasFilters).filter((v) => v.length > 0).length +
    (openNow ? 1 : 0)
  // The search found places, and the filters hid every one of them: the
  // answer above the list says "2 places have pizza", so an empty list has
  // to say why, and clearing the filters alone keeps what was asked.
  const searchMatches = typed ? items.filter(matchesSearch).length : 0
  const hiddenByFilters = activeFilterCount > 0 && (typed ? searchMatches > 0 : items.length > 0)

  // ── Groups (see listGroups.ts) ──
  // Never a search's results: those are one list, best first.
  const grouping = typed ? null : groupListings(filtered, category, now)
  const { revealedId, setRevealedId, setReopenClosedId, isGroupOpen, toggleGroup } = useGroupOpenness({
    communitySlug,
    categoryId: category.id,
    openNow,
    boolFilters,
    selectFilters,
    reopenItemId,
    activeFilterCount,
  })
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

  // Synagogues' "By synagogue | By time" (Nov 11): where the list's count
  // was, in both views, so the way between them is never gone. It replaced
  // the green Next minyan card above the search (see MinyanSwitch).
  const minyanSwitch = (byTime: boolean) =>
    hasMinyanim ? (
      <MinyanSwitch
        singular={category.label}
        byTime={byTime}
        onChange={(on) => (on ? showMinyanimView() : closeMinyanimView())}
      />
    ) : undefined
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
    setHasFilters({})
    setOpenNow(false)
  }
  const clearAll = () => {
    setSearch('')
    clearFilters()
  }
  const { searchBools, sheetTefillos, sheetOpenNow, toggleSheetOpenNow, toggleSheetBool, toggleSheetHas, clearSheet, sheetItems, sheetSelects, minyanTefillahSelect, minyanWithinSelect, onSheetSelect, minyanFilterCount, sheetFilterCount } = sheetFilters({
    category,
    items,
    typed,
    todayResult,
    minyanShulResult,
    hasFilterableHours,
    minyanimView,
    search,
    setSearch,
    openNow,
    setOpenNow,
    boolFilters,
    setBoolFilters,
    selectFilters,
    setSelectFilters,
    hasFilters,
    setHasFilters,
    clearFilters,
    minyanTefillos,
    setMinyanTefillos,
    minyanWithin,
    setMinyanWithin,
    landedSearch,
    itemsToShow,
    selectsToShow,
    filterableBooleans,
    filterableSelects,
  })
  const searchSave = useSearchSave({ category, communitySlug, search, minyanimView, openNow, boolFilters, selectFilters, hasFilters, landedSearch })

  // The page's colour: the band's when the category has no picture, and
  // the listings' initials. Called as the home calls it, so the two match.
  const bandColor = getCategoryColor(categories, category.id)

  // Board H4/H5 (Nov 11): the page opens on the same picture as its tile
  // on the home, so the two read as one place. Null for a category with no
  // picture of its own: the computer's band is then its colour, and a
  // phone shows none.
  const tilePhoto = getCategoryTilePhoto(categories, category.id)

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
              onToggle={() => toggleGroup(g)}
              controls={rowsId}
            />
          ),
        }
      })

  const {
    hasMapColumn,
    mapHidden,
    setMapHidden,
    splitRef,
    splitStyle,
    splitHandle,
    mapBeside,
    rowLook,
    setRowLook,
    flat,
    highlight,
    walkShown,
    mapOnScreen,
    walkOnMap,
    flashId,
    findRow,
    fullMapHref,
    phoneMapHref,
  } = useMapBeside({
    caps,
    category,
    activeCommunity,
    search,
    openNow,
    boolFilters,
    selectFilters,
    setRevealedId,
    scrollItemIntoViewWhenSettled,
  })

  const { questionSpot, questionCard } = useQuestionCard({ category, items, filtered, shownItems, typed, sections, rowPlaces, onEdit })
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
  // Before the page has measured the screen (isMobile starts false), a
  // listing's own link draws both its pages and CSS picks: a phone's
  // first paint was the computer's column under the list's photo and
  // search (the user, Nov 22; e2e/first-paint.spec.ts).
  const measuredMobile = useMeasuredIsMobile()
  const linkedUnmeasured = measuredMobile === null && !!columnItem && columnItem.id === pagedItemId
  const phonePageHidden = linkedUnmeasured ? 'phone:hidden' : ''
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
    //
    // Written so Next's router learns it. Next patches replaceState, but
    // treats a call whose state carries its own `__NA` mark as its own and
    // passes it straight through, so handing it `window.history.state` left
    // the router holding the listing's address, and its next commit (a
    // refresh on coming back to the app, or anything just after the tap)
    // wrote the listing's back (Nov 17). Without the mark, Next copies its
    // state in and moves its own address to this one, with no navigation:
    // the list stays as it is. The other keys (a `step`) are kept.
    if (id === linkedItemId && window.location.pathname !== routes.slug(activeCommunity.slug, category.id)) {
      const state: Record<string, unknown> = { ...window.history.state }
      delete state.__NA
      window.history.replaceState(state, '', routes.slug(activeCommunity.slug, category.id) + window.location.search)
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
    // A phone's sheet, Back from its step (Nov 18).
    if (isMobile) {
      for (const id of [...openCardIdsRef.current]) {
        if (id !== params.get('item') && id !== pagedItemId) cardRefs.current.get(id)?.close()
      }
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
    category.pluralLabel,
    phonePage && columnItem ? () => closeColumn(columnItem.id) : minyanimView ? closeMinyanimView : onUp,
    { named: phonePage },
  )
  // A computer's opened listing. It had the top of the page (Oct 6, B), and
  // from Nov 15 no photo either; now (board W10 A, the user, Nov 15: "without
  // the photo it also feels a bit weird") the photo, the title and the search
  // stay as the list has them, and only the column under them changes, so
  // nothing above it moves on the click. Clicking into the search goes back
  // to the list: a search over a listing would narrow a list no one can see.
  const deskListing = !!columnItem && !phonePage

  const onRowExpanded = (item: DirectoryResource, expanded: boolean) =>
    rowExpanded(item, expanded, { openCardIdsRef, isMobile, linkedItemId, activeCommunity, category, onParamsChange, hostedId, pagedItemId, reopenItemId, revealedId, setRevealedId, setClosedMatchFor, reopenKey, setReopenClosedId, setOpenDialogItemId })

  // An opened listing's last part: the places near it in the list as it's
  // filtered now, and the way back to all of them (ListingView's onward).
  const onwardSource: ListingOnwardSource = {
    items: filtered,
    place: (item) => rowPlaces.get(item.id) ?? null,
    open: openListing,
    allLabel: `See all ${items.length} in ${category.pluralLabel}`,
  }


  // The list's own heading: how many, and Filters and Sort, the same place
  // on every category page (see ListHeading). Under the search box, or at
  // the top of the list's column where the map sits beside it.
  // A search that found nothing has no list to count or arrange: the box
  // under the search says so, and "0 listings · Filters · Sort" under it
  // was only more to read. Not when filters hid what it found: then
  // Filters is the way back.
  const searchFoundNothing = typed && filtered.length === 0 && !hiddenByFilters
  // Read in the background once the typing stops, as Enter does
  // (useLearnAfterPause). Not a search a shared link arrived with.
  useLearnAfterPause({
    query: search,
    foundNothing: !!searchFoundNothing && !minyanimView && !minyanQuestion,
    ready: search !== (initialSearch ?? ''),
    community: communitySlug,
  })
  const listHeading = searchFoundNothing ? null : (
      <ListHeading
        // Open groups: the first group's heading is the list's own ("Open
        // now · 57"), saving a line above the first place on a phone.
        // Closed groups: what they're grouped by and the whole count.
        label={grouping ? (grouping.closed ? grouping.title : grouping.groups[0]?.label) : undefined}
        count={grouping && !grouping.closed ? (grouping.groups[0]?.items.length ?? 0) : filtered.length}
        noun={!grouping || grouping.closed}
        total={filtered.length}
        filters={hasActualFilters ? { active: sheetFilterCount, onOpen: () => setFiltersOpen(true) } : undefined}
        sort={upvotes ? { byPopular, onSelect: selectSort } : undefined}
        lead={minyanSwitch(false)}
        onShowMap={hasMapColumn && mapHidden ? () => setMapHidden(false) : undefined}
        mapHref={phoneMapHref}
      />
  )
  // The categories with no map keep the list's heading under the search,
  // as the toolbar's last line.
  const headingInToolbar = !hasMapColumn && !columnItem && !minyanimView && listHeading !== null
  // The search rides up onto the computer's photo (board H4), which leaves
  // the photo's last 44px under it (HERO_PHOTO_UNDER_SEARCH_PX): the list starts 28px below that, as
  // drawn. Where the list's heading is in the sticky bar, that space is
  // inside the bar until it docks, then under it, so the list doesn't jump.
  const heroOverlap = showSearch && !phonePage
  // Each 22px more since Nov 15, when the photo under the search grew from
  // 22px to 44: the list keeps its distance from the photo's edge.
  const heroGap = heroOverlap ? (headingInToolbar ? '' : 'desktop:mb-[56px]') : ''

  return (
    <TellAboutContext.Provider value={canAdd || canEdit ? tellAbout : null}>
    <WalkOnMapContext.Provider value={walkOnMap}>
    <TappedMinyanContext.Provider value={tappedMinyan}>
    <div>
      {/* Phones: where the distances on each row are measured from, when
          the visitor hasn't set a location, with the way to set one. At the
          top, above the category band, as the old banner was; desktop has
          the same line under the title (DirectoryHeader). */}
      {/* A phone's picture (board H5): the tile's photo, short and edge to
          edge, in the gap under the header (32px on a phone: -mt-8). Its
          title is the header's. */}
      {tilePhoto && !phonePage && (
        <div className={`relative -mt-8 mb-3 bleed-x h-[120px] overflow-hidden desktop:hidden ${phonePageHidden}`} data-testid="category-phone-picture">
          <Image src={tilePhoto} alt="" fill sizes="100vw" className="object-cover object-[center_55%]" {...photoProps(tilePhoto)} />
        </div>
      )}
      {addressPrompt && !anchorLabel && !phonePage && <DistanceNote className={`desktop:hidden pb-3 ${phonePageHidden}`} />}
      <CategoryBandFrame
        color={bandColor}
        imageUrl={tilePhoto}
        heroOverlap={heroOverlap}
        hero={<CategoryHero count={items.length} title={category.pluralLabel} anchorLabel={anchorLabel} addressPrompt={addressPrompt} />}
      >
          {/* Mobile used to have its own "‹ {upLabel}" row here (UpButton,
              desktop:hidden). It's gone now that useSetScreenHeader (above)
              puts the same "‹ {title}" control directly in SiteHeader on
              mobile — this component no longer needs to render its own copy
              of it. Desktop never had an equivalent row of its own (the
              since-removed Breadcrumb lived inside DirectoryHeader, not
              here) and still doesn't. */}

          {/* A phone's title (sr-only: the site header shows it). A
              computer's is the photo's (the band's `hero` above), so this
              isn't drawn there at all: one h1 either way. */}
          {isMobile && (
          <div hidden={phonePage}>
          <DirectoryHeader
            title={category.pluralLabel}
            anchorLabel={anchorLabel}
            addressPrompt={addressPrompt}
            titleInHeader
            titleOnly={deskListing}
          />
          </div>
          )}

      <ControlsBar
        sentinelRef={controlsSentinelRef}
        barRef={controlsRef}
        hidden={phonePage}
        phoneHidden={linkedUnmeasured}
        headingInToolbar={headingInToolbar}
        heroOverlap={heroOverlap}
        controlsStuck={controlsStuck}
        hasMapColumn={hasMapColumn}
        controlsVisible={controlsVisible}
      >
        {/* The page's one search box, limited to this category, with example searches under it and,
            once something is typed, the sentence answering it (see
            CategoryAsk). */}
        <div onFocusCapture={deskListing ? () => closeColumn(columnItem.id) : undefined}>
          {showSearch && (
            <div className={`desktop:max-w-[688px] ${heroGap}`}>
              <CategoryAsk
                onPhoto
                category={category}
                search={search}
                onSearch={setSearch}
                scope={minyanimView ? 'minyanim' : undefined}
                onSubmit={() => {
                  if (minyanQuestion) setMinyanimViewOn(true)
                  // Read in the background for Read questions (learnFrom).
                  else if (searchFoundNothing) learnFrom(search, communitySlug)
                }}
                foundNothing={!minyanimView && searchFoundNothing}
                save={searchSave}
              />
            </div>
          )}
          {/* What the search found, for a screen reader (SearchAnnouncer). */}
          <SearchAnnouncer query={search} count={typed && !minyanimView ? filtered.length : null} units={['listing', 'listings']} />
        </div>
        {headingInToolbar && (heroOverlap ? <div className={`desktop:pt-[48px] ${controlsStuck ? 'lg:pt-0' : ''}`}>{listHeading}</div> : listHeading)}
      </ControlsBar>

      <div ref={splitRef} className={mapBeside ? 'group/split lg:grid lg:items-start' : undefined} style={mapBeside ? splitStyle : undefined}>
      <div className="min-w-0">
      {columnItem && (
        <div ref={listingColumnRef}>
          {/* Each shul's next minyan, for the listing's status and the
              shuls near it, as the list has. */}
          <NextMinyans enabled={hasMinyanim} items={items}>
          {(() => {
            const column = (phone: boolean) => (
              <ListingColumn
                phone={phone}
                item={columnItem}
                category={category}
                color={bandColor}
                place={rowPlaces.get(columnItem.id) ?? null}
                found={foundOn(columnItem)}
                upvote={
                  upvotes ? (
                    <UpvoteButton
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
                // "‹ All 71 places", across from "2 of 71": the title is on the
                // photo right above it, so "‹ Food" said it twice (Nov 15).
                backLabel={minyanimView ? minyanimTitle : `All ${shownItems.length} ${shownItems.length === 1 ? 'place' : 'places'}`}
                onBack={() => closeColumn(columnItem.id)}
                position={{ index: Math.max(0, shownIndex.get(columnItem.id) ?? 0), total: shownItems.length }}
                onStep={(direction) => navigateFromCard(columnItem.id, direction)}
                alone={!mapBeside}
                onShowMap={hasMapColumn && mapHidden ? () => setMapHidden(false) : undefined}
              />
            )
            return linkedUnmeasured ? (
              <>
                <div className="desktop:hidden">{column(true)}</div>
                <div className="hidden desktop:block">{column(false)}</div>
              </>
            ) : (
              column(phonePage)
            )
          })()}
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
          onDayChange={(day) => onParamsChange?.({ day }, { replace: true })}
          // A minyan and its shul's pin light up together, as a shul's row does.
          onHoverShul={mapBeside ? highlight.set : undefined}
          search={search}
          canAdd={canEdit}
          shulText={(item) => filterableSelects.flatMap((f) => selectValues(item[f.key])).join(' · ')}
          namedShuls={minyanShulResult ? minyanShulResult.hits.map((h) => h.item) : null}
          tefillos={tefillosChosen(sheetTefillos)}
          withinMiles={milesChosen(minyanWithin)}
          filters={{ active: sheetFilterCount + minyanFilterCount, onOpen: () => setFiltersOpen(true) }}
          onShowing={setMinyanimShowing}
          kindOf={(item) => kindText(item, category)}
          heading={minyanSwitch(true)}
          mapHref={phoneMapHref}
        />
      ) : searchFoundNothing ? (
        // The search found nothing: the box under the search says so, with
        // one way to ask (AskTheGroup). A second "No groceries match your
        // search" with its own buttons was more to read (the user, Oct 10).
        null
      ) : filtered.length === 0 ? (
        <EmptyList
          hiddenByFilters={hiddenByFilters}
          typed={typed}
          searchMatches={searchMatches}
          hasActiveFilters={hasActiveFilters}
          pluralLabel={category.pluralLabel}
          label={category.label}
          canAdd={canAdd}
          clearFilters={clearFilters}
          clearAll={clearAll}
          onAdd={() => {
            setOpenItem(null)
            setTellOpen(true)
          }}
        />
      ) : (
        <DirectoryList
          hasMinyanim={hasMinyanim}
          items={items}
          onwardSource={onwardSource}
          sections={sections}
          closed={grouping?.closed}
          flat={flat}
          setItemRowRef={setItemRowRef}
          mapBeside={mapBeside}
          highlight={highlight}
          flashId={flashId}
          setCardRef={setCardRef}
          isMobile={isMobile}
          pagedItemId={pagedItemId}
          category={category}
          rowPlaces={rowPlaces}
          omitKey={omitKey}
          flagUnconfirmed={flagUnconfirmed}
          upvotes={upvotes}
          byPopular={byPopular}
          liveCount={liveCount}
          rowLook={rowLook}
          candlesAt={candlesAt}
          reopenItemId={reopenItemId}
          foundOn={foundOn}
          onRowExpanded={onRowExpanded}
          onVote={(item, c) => setVoteCounts((prev) => ({ ...prev, [item.id]: c }))}
          questionSpot={questionSpot}
          questionCard={questionCard}
        />
      )}
      {/* A link an admin set for what this guide doesn't list ("Other
          Mikvahs" → mikvah.org's directory). After the last row, where
          someone who hasn't found it here has just finished looking, and
          under an empty list too; not in the list heading, which is for
          arranging the list. No arrow after it (the user, Oct 10). */}
      {category.externalLink && (
        <p data-testid="external-link" className="mt-5 text-center text-[0.84375rem] text-slate-500">
          Not listed here?{' '}
          <a href={category.externalLink.url} target="_blank" rel="noopener noreferrer" className="font-bold text-primary hover:underline">
            {category.externalLink.label}
          </a>
        </p>
      )}
      </div>
      </div>
      {mapBeside && (
        <MapBeside
          handle={splitHandle}
          map={{
            category: category,
            items: filtered,
            searchActive: typed || activeFilterCount > 0,
            highlight: highlight,
            selectedId: columnItem?.id ?? null,
            walk: columnItem && mapOnScreen ? walkShown : null,
            onSelect: columnItem ? (id) => switchListing(columnItem.id, id) : findRow,
            onHide: () => setMapHidden(true),
            fullMapHref: fullMapHref,
          }}
        />
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
        <AddButton
          onClick={() => {
            setOpenItem(null)
            setTellOpen(true)
          }}
        />
      )}
      {/* Its own boundary: loading it the first time otherwise hid the page
          for a moment, the open listing under it included. */}
      <Suspense fallback={null}>
        {tellMounted && (
          <TellUsSheet
            isOpen={tellOpen}
            onClose={() => setTellOpen(false)}
            about={openItem ? { id: openItem.id, name: openItem.name } : undefined}
            category={category}
            placeholder={tellUsPlaceholder({ times: minyanimViewOn || (!!openItem && tellTimes), menu: !!openItem && tellMenu, about: openItem ?? undefined })}
            heading={openItem && tellTimes ? `Update ${openItem.name}’s times` : undefined}
            kind={openItem && tellMenu ? 'menu' : minyanimViewOn || (openItem && tellTimes) ? 'times' : undefined}
            yourselfLabel={openItem && tellMenu ? 'Add one dish yourself' : undefined}
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
      </Suspense>

      {(hasActualFilters || minyanimView) && (
        <FiltersSheet
          isOpen={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          hasOpenNow={hasFilterableHours && !minyanimView}
          openNow={sheetOpenNow}
          onOpenNow={toggleSheetOpenNow}
          booleans={filterableBooleans.map((f) => ({ key: f.key, label: f.filterLabel ?? f.label, on: !!boolFilters[f.key] || searchBools.has(f.key) }))}
          onBoolean={toggleSheetBool}
          selects={minyanimView ? [minyanTefillahSelect, ...sheetSelects, minyanWithinSelect] : sheetSelects}
          onSelect={onSheetSelect}
          items={sheetItems}
          onItem={toggleSheetHas}
          onClearAll={clearSheet}
          count={minyanimView ? minyanimShowing : filtered.length}
          units={minyanimView ? ['minyan', 'minyanim'] : undefined}
        />
      )}

    </div>
    </TappedMinyanContext.Provider>
    </WalkOnMapContext.Provider>
    </TellAboutContext.Provider>
  )
}
