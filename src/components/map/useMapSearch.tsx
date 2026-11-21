'use client'
// ResourceMapView's search (split out Nov 21, no behaviour change): the
// box's text, what's committed, the autocomplete, and what the committed
// query finds. Called where the block it came from sat, so the view's
// effects run in the same order.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { MobileNearbySheetHandle } from './MobileNearbySheet'
import type { LatLng } from '@/lib/googleMapsLinks'
import type { useAllListings } from '@/lib/useAllListings'
import type { useCategories } from '@/lib/useCategories'
import { haversineMiles } from '@/lib/geo'
import { foundFor, searchAsk, type SearchFound } from '@/lib/askSearch'
import { routes } from '@/lib/routes'
import { neighborhoodsFor } from '@/lib/places'
import { learnFrom } from '@/lib/askReader'
import { useLearnAfterPause } from '@/lib/useLearnAfterPause'
import AskTheGroup from '@/components/home/AskTheGroup'
import { isOpenNowWord, stripApostrophes, type MapViewPoint, type SelectablePoint } from './mapViewShared'

export function useMapSearch({
  initialQueryText,
  allPoints,
  activeLocation,
  effectiveSelected,
  categories,
  listings,
  countCommunity,
  openNowEverywhere,
  selectPlace,
  leaveEditThen,
  isMobile,
  nearbySheetRef,
  setDesktopSelected,
}: {
  initialQueryText: string
  allPoints: MapViewPoint[]
  activeLocation: LatLng | null
  effectiveSelected: Set<string>
  categories: ReturnType<typeof useCategories>
  listings: ReturnType<typeof useAllListings>
  countCommunity: string | null
  openNowEverywhere: () => void
  selectPlace: (p: SelectablePoint, frame?: boolean) => void
  leaveEditThen: (then: () => void, to?: string) => void
  isMobile: boolean
  nearbySheetRef: RefObject<MobileNearbySheetHandle | null>
  setDesktopSelected: (p: SelectablePoint | null) => void
}) {
  const [input, setInput] = useState(initialQueryText)
  const [committedQuery, setCommittedQuery] = useState(initialQueryText)

  const commitQuery = (raw: string) => {
    const v = raw.trim()
    if (!v) return
    // "open now" typed is the Filters sheet's Open now for everything, not
    // words to look for: it switches on, and the box empties.
    if (isOpenNowWord(v)) {
      openNowEverywhere()
      return
    }
    setCommittedQuery(v)
  }
  const clearQuery = () => {
    setInput('')
    setCommittedQuery('')
  }

  // ── Search autocomplete — Google-Maps-style dropdown of matching places
  // while typing, independent of the live text-filter above (which narrows
  // the map/list) and of category toggles (a name match should surface even
  // if that category's chip happens to be off). Shared logic; mobile and
  // desktop each mount their own actual <input> (see the render below). ────
  const [searchFocused, setSearchFocused] = useState(false)
  const mobileSearchInputRef = useRef<HTMLInputElement>(null)
  const desktopSearchInputRef = useRef<HTMLInputElement>(null)
  const searchSuggestions = useMemo(() => {
    const q = stripApostrophes(input.trim().toLowerCase())
    if (isOpenNowWord(q)) return []
    // Within each match-quality bucket, closest first when we have a location;
    // otherwise most-upvoted first, so ties don't fall back to storage order.
    const rank = (p: (typeof allPoints)[number]) =>
      activeLocation ? haversineMiles(activeLocation, { lat: p.lat, lng: p.lng }) : -(p.raw?.upvotes ?? 0)
    const byRank = (a: (typeof allPoints)[number], b: (typeof allPoints)[number]) => rank(a) - rank(b)
    // Nothing typed yet — list what's currently on the map given the active
    // category chips, same as Google Maps' own "nearby" suggestions on an
    // empty, focused search box, instead of showing nothing until you type.
    if (q.length === 0) {
      return allPoints
        .filter((p) => effectiveSelected.has(p.filterId))
        .sort(byRank)
        .slice(0, 6)
    }
    if (q.length < 2) return []
    const starts: typeof allPoints = []
    const contains: typeof allPoints = []
    for (const p of allPoints) {
      const name = stripApostrophes(p.name.toLowerCase())
      if (name.startsWith(q)) starts.push(p)
      else if (name.includes(q)) contains.push(p)
    }
    return [...starts.sort(byRank), ...contains.sort(byRank)].slice(0, 6)
  }, [allPoints, input, activeLocation, effectiveSelected])

  // Words that find nothing anywhere in the guide: no place's name, and
  // nothing our own search answers in any category, on or off (askSearch.ts).
  // Then it says so, with where to ask, as a category page does: under the
  // box as it's typed, and in the list once it's searched. Not only on
  // Enter, which most people never press (the user, Oct 27). Not for the
  // questions our search has its own answers to (the eruv, minyanim, times).
  const findsNothing = (text: string) => {
    const typed = stripApostrophes(text.trim().toLowerCase())
    if (typed.length < 2 || isOpenNowWord(typed) || !categories || !listings) return false
    if (allPoints.some((p) => stripApostrophes(p.searchText).includes(typed))) return false
    if (listings.some((r) => stripApostrophes(r.name.toLowerCase()).includes(typed))) return false
    // Every listing, not only the ones with a pin: a place the guide has but
    // the map can't plot isn't "nothing in the guide".
    const result = searchAsk(listings, categories, text, { places: neighborhoodsFor(countCommunity) })
    const q = result.query
    return !q.meta && !q.times && !q.eruv && !q.minyan && result.hits.length === 0 && result.noHours.length === 0
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const typedNothing = useMemo(() => findsNothing(input), [input, allPoints, categories, listings])
  // Read in the background once the typing stops, as Enter does. Not the
  // words a shared link arrived with.
  useLearnAfterPause({ query: input, foundNothing: typedNothing, ready: input !== initialQueryText, community: countCommunity })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const searchedNothing = useMemo(() => findsNothing(committedQuery), [committedQuery, allPoints, categories, listings])
  const nothingBox = (text: string, className?: string) =>
    countCommunity ? <AskTheGroup query={text.trim()} nothingClose sharePath={routes.ask(countCommunity, text.trim())} className={className} /> : null

  // "Open now" is a real, working search (see OPEN_NOW_WORDS/openNowActive)
  // but a silent one — nothing on screen ever told a visitor typing into this
  // box that it's a valid thing to search, the way Google Maps' own
  // autocomplete surfaces "open now" as a suggestion the moment it could be
  // what you're typing toward. Shown whenever the box is empty (an upfront
  // hint, same spot Google puts it) or the typed text is still a prefix of
  // "open now" — hidden the moment it diverges (e.g. "open pizza"), same as
  // any other autocomplete match narrowing away.
  const showOpenNowSuggestion = useMemo(() => {
    const q = input.trim().toLowerCase()
    return q.length === 0 || 'open now'.startsWith(q)
  }, [input])
  // The box's dropdown: the suggestions, or that nothing's there.
  const dropdownShown = searchFocused && (showOpenNowSuggestion || searchSuggestions.length > 0 || typedNothing)
  const selectOpenNow = () => {
    openNowEverywhere()
    setSearchFocused(false)
    mobileSearchInputRef.current?.blur()
    desktopSearchInputRef.current?.blur()
  }

  // Picking a suggestion jumps straight to that place — map pin + sheet detail
  // — instead of just adding it as a narrowing text filter. Setting
  // committedQuery to the place's own name (below) still broadens the
  // committed search to every place that name matches (e.g. every "GIANT"
  // location) — necessary so the map/list have a sensible fallback if the
  // visitor backs out of this one place — which would otherwise re-trigger
  // the commit effect further down and immediately clear this exact
  // selection again (multiple matches → that effect shows the LIST, not one
  // card). suppressNextCommitEffectRef tells that effect to skip its one
  // upcoming run so the specific place picked here actually sticks.
  const suppressNextCommitEffectRef = useRef(false)
  const selectSuggestion = (p: (typeof allPoints)[number]) => {
    suppressNextCommitEffectRef.current = true
    setInput(p.name)
    setCommittedQuery(p.name)
    setSearchFocused(false)
    mobileSearchInputRef.current?.blur()
    desktopSearchInputRef.current?.blur()
    selectPlace(p)
  }

  // Submitting the search (the mobile keyboard's "Search" action key, via the
  // wrapping <form> below, not a keydown check — the one reliable way to
  // catch that key across mobile browsers) does everything the Google Maps
  // app does: picks the place directly if it's the one unambiguous match,
  // otherwise commits the query so the sheet shows the result list, dismisses
  // the dropdown, and closes the keyboard.
  const submitSearch = () =>
    leaveEditThen(() => {
      if (searchSuggestions.length === 1) selectSuggestion(searchSuggestions[0])
      else commitQuery(input)
      setSearchFocused(false)
      mobileSearchInputRef.current?.blur()
      desktopSearchInputRef.current?.blur()
    })

  // Clearing the search (the × button) resets the sheet/sidebar back to its
  // normal browsing state — same as Google Maps: the selected place/result
  // list disappears and the sheet collapses — and does NOT refocus the
  // input, so the keyboard stays down until the visitor deliberately taps
  // the search box again.
  const clearSearch = () =>
    leaveEditThen(() => {
      clearQuery()
      setSearchFocused(false)
      mobileSearchInputRef.current?.blur()
      desktopSearchInputRef.current?.blur()
      if (isMobile) nearbySheetRef.current?.collapse()
      else setDesktopSelected(null)
    })

  // The committed query filters as one phrase (not per-word AND terms) —
  // except "open now", which is its own predicate (openNowActive above), not
  // a literal text match. Derived from committedQuery, not the live `input`,
  // so nothing actually filters until you commit — see point 3 in the commit
  // this replaces: typing alone no longer narrows the map/list.
  const activeTerms = useMemo(() => {
    const q = stripApostrophes(committedQuery.trim().toLowerCase())
    return q && !isOpenNowWord(q) ? [q] : []
  }, [committedQuery])
  // The listings the committed query answers, read as a question the same
  // way as the home and category searches (see askSearch.ts): "where can I
  // get cholov yisroel milk" pins the store that has it, "food" pins every
  // food place. Null when there's no query. Hospital pins carry no listing,
  // so they keep matching on their name (see visiblePoints).
  // Each keeps what it matched on, for the place panel to mark it (see
  // SearchFound), the same as a listing opened from any other search.
  const askIds = useMemo(() => {
    if (activeTerms.length === 0) return null
    const raws = allPoints.flatMap((p) => (p.raw ? [p.raw] : []))
    const result = searchAsk(raws, categories ?? [], committedQuery, { places: neighborhoodsFor(countCommunity) })
    return new Map<string, SearchFound | null>(result.hits.map((h) => [h.item.id, foundFor(h, result)]))
  }, [activeTerms, allPoints, categories, committedQuery, countCommunity])
  const foundOnPoint = (id: string | undefined) => (id ? (askIds?.get(id) ?? null) : null)

  // A question our own search found nothing for is also read by the AI in
  // the background, for the admin's Read questions tab, where its words can
  // be taught to the search (learnFrom). The map never waits for it or
  // shows it (the user, Oct 27). A question is committed on Enter; one
  // typed and left is read too (useLearnAfterPause, by typedNothing).
  useEffect(() => {
    if (!askIds || !categories || !listings) return
    const found = allPoints.some((p) => (p.raw ? askIds.has(p.raw.id) : activeTerms.every((t) => stripApostrophes(p.searchText).includes(t))))
    if (!found) learnFrom(committedQuery, countCommunity)
    // Once per question committed, once it can be answered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askIds, !!categories, !!listings])

  return {
    input,
    setInput,
    committedQuery,
    setCommittedQuery,
    setSearchFocused,
    mobileSearchInputRef,
    desktopSearchInputRef,
    searchSuggestions,
    typedNothing,
    searchedNothing,
    nothingBox,
    showOpenNowSuggestion,
    dropdownShown,
    selectOpenNow,
    suppressNextCommitEffectRef,
    selectSuggestion,
    submitSearch,
    clearSearch,
    activeTerms,
    askIds,
    foundOnPoint,
  }
}
