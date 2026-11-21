import { useEffect, useRef, useState } from 'react'
import type { CategoryConfig } from '@/lib/categories'
import { addressFilters, carriesSearch, withoutChosen, type Landed, type ParamsOpts } from './directoryAddress'

// A category page's search, "Open now" and Filters, and how they follow the
// address: read from it on arrival, on a return to the page and on Back and
// Forward, and written back to it as they change (GenericDirectory).

type Options = {
  category: CategoryConfig
  initialSearch?: string
  initialOpenNow?: boolean
  initialFilters?: Record<string, string> | null
  onParamsChange?: (changes: Record<string, string | null>, opts?: ParamsOpts) => void
}

export function useDirectorySearch({ category, initialSearch, initialOpenNow, initialFilters, onParamsChange }: Options) {
  // What the address says, on Back and Forward too (Nov 18): Forward to a
  // search shows the search. Before, back/forward arrivals landed on a
  // blank page, and after a reload that blank page differed from the
  // server's render (a hydration error).
  const [search, setSearch] = useState(initialSearch ?? '')
  const [boolFilters, setBoolFilters] = useState<Record<string, boolean>>({})
  // Multi-select: each key maps to the set of chosen values (empty = no filter).
  const [selectFilters, setSelectFilters] = useState<Record<string, string[]>>({})
  // "Has": items in a listing's item list (`?has_<key>=Challah,Wine`; see
  // searchLands.ts), each listing having every one ticked, always or
  // sometimes.
  const [hasFilters, setHasFilters] = useState<Record<string, string[]>>({})
  // A question whose meaning is already in the Filters (`?read=1`: the AI
  // reader read it, here or on the home search): it stays in the box, as
  // asked, but isn't searched by again while it's unchanged, so switching
  // one of its filters off really widens the list. Typing anything else
  // searches as usual. And what it was read as goes with it: editing or
  // clearing the question takes off the Filters it turned on (`landed`),
  // and leaves the ones the visitor ticked.
  const [landed, setLanded] = useState<Landed | null>(null)
  const landedSearch = landed?.search ?? null

  const [openNow, setOpenNow] = useState(initialOpenNow ?? false)

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
    setSearch(initialSearch)
  }, [initialSearch])
  const appliedInitialOpenNowRef = useRef(false)
  useEffect(() => {
    if (appliedInitialOpenNowRef.current || !initialOpenNow) return
    appliedInitialOpenNowRef.current = true
    setOpenNow(true)
  }, [initialOpenNow])
  // `initialFilters` is `null` until FindResourcesConnected hydrates, then a
  // real (possibly empty) object from then on — see FindResources' own doc —
  // so that transition alone, not any specific key inside it, is the signal
  // to read it once. Reads `category.detailFields` directly rather than the
  // `filterableBooleans`/`filterableSelects` computed further down (this runs
  // before those are in scope, and duplicating the two-line filter here is
  // cheaper than reordering the whole component around it).
  const appliedInitialFiltersRef = useRef(false)
  // The Filters an address carries, and, for a question read into them
  // (`read=1`), that question with them.
  const applyAddressFilters = (params: Record<string, string>) => {
    const { bools, sels, has } = addressFilters(category, params)
    if (Object.keys(bools).length > 0) setBoolFilters((prev) => ({ ...prev, ...bools }))
    if (Object.keys(sels).length > 0) setSelectFilters((prev) => ({ ...prev, ...sels }))
    if (Object.keys(has).length > 0) setHasFilters((prev) => ({ ...prev, ...has }))
    if (params.read === '1' && params.q) {
      setLanded({ search: params.q, openNow: params.openNow === '1', bool: Object.keys(bools), select: sels, has })
    }
  }
  useEffect(() => {
    if (appliedInitialFiltersRef.current || !initialFilters) return
    appliedInitialFiltersRef.current = true
    applyAddressFilters(initialFilters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFilters, category])
  // Resets this screen's own search/openNow/filters to blank, both in local
  // state and (via onParamsChange) back out to the address bar — what a
  // return to this screen with no search in its address shows. A ref,
  // read through by the effect below, rather than
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
  // Only this screen's own state; clearFiltersRef clears the address too.
  const blankRef = useRef<() => void>(undefined)
  // This screen's state as an address has it (`?q=challah&has_m=Challah`).
  const fromAddressRef = useRef<(params: Record<string, string>) => void>(undefined)
  useEffect(() => {
    fromAddressRef.current = (params) => {
      blankRef.current!()
      setSearch(params.q ?? '')
      setOpenNow(params.openNow === '1')
      applyAddressFilters(params)
    }
    blankRef.current = () => {
      setSearch('')
      setOpenNow(false)
      setBoolFilters({})
      setSelectFilters({})
      setHasFilters({})
      setLanded(null)
    }
    clearFiltersRef.current = () => {
      blankRef.current!()
      const changes: Record<string, string | null> = { q: null, openNow: null, read: null }
      for (const f of category.detailFields) {
        if (f.filterable && f.type === 'boolean') changes[`f_${f.key}`] = null
        if (f.filterable && f.type === 'select') changes[`sel_${f.key}`] = null
        if (f.type === 'tags') changes[`has_${f.key}`] = null
      }
      onParamsChange?.(changes, { replace: true })
    }
  })
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
  //
  // But effects also tear down and re-run when a Suspense boundary above
  // hides this screen for a moment while some code loads (the user's note
  // 10, Oct 10: a listing tapped in search results on a phone loaded its
  // view, the search was cleared, and the listing closed again). Leaving
  // for another screen has already changed the address by the time this
  // screen is hidden; a pause while code loads hasn't. So it clears only
  // when the address it was hidden at isn't this screen's own.
  //
  // Come back by a link that carries a search (the home search's "Grocery ·
  // 10 with Challah" is `?q=challah`), it's that search, not a blank page:
  // the `initialXxx` props were applied once, on the first visit, and a
  // second search from home landed on the whole list (the user, Oct 13).
  // Back and Forward too: the address is what the page shows (Nov 18).
  const hasActivatedBeforeRef = useRef(false)
  const hiddenAtRef = useRef<string | null>(null)
  useEffect(() => {
    if (hasActivatedBeforeRef.current && hiddenAtRef.current !== window.location.pathname) {
      const params = Object.fromEntries(new URLSearchParams(window.location.search))
      if (!carriesSearch(category, params)) clearFiltersRef.current!()
      else fromAddressRef.current!(params)
    }
    hasActivatedBeforeRef.current = true
    return () => {
      hiddenAtRef.current = window.location.pathname
    }
    // On each activation only (Activity re-runs it), never on a change of
    // category: a category is its own screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Sync search + "Open now" into the URL (see onParamsChange's own doc) ──
  // Skips the very first render on purpose: `search`/`openNow` there is just
  // `initialSearch`/`initialOpenNow` echoed back, and writing it out again
  // would be a pointless replace on every mount. Debounced for `search` so
  // typing doesn't fire a history replace per keystroke; `openNow` is a
  // single toggle, so it goes out immediately.
  const searchSyncedOnce = useRef(false)
  // Read when the debounce fires, not when it was set: arriving by a link,
  // the question can reach `search` a render before `landed` does, and
  // `read=1` came off the address (Oct 13).
  const landedSearchRef = useRef(landedSearch)
  useEffect(() => {
    landedSearchRef.current = landedSearch
  })
  useEffect(() => {
    if (!searchSyncedOnce.current) {
      searchSyncedOnce.current = true
      return
    }
    const timer = setTimeout(() => {
      const kept = landedSearchRef.current !== null && search === landedSearchRef.current
      onParamsChange?.({ q: search.trim() || null, ...(kept ? {} : { read: null }) }, { replace: true })
    }, 300)
    return () => clearTimeout(timer)
  }, [search, onParamsChange])
  // The question edited or cleared: the Filters it was read as come off
  // with it (see `landed`). What's typed now is searched, and read again
  // if it needs it.
  useEffect(() => {
    if (!landed || search === landed.search) return
    const was = landed
    // Follows the visitor's own edit of the box, once: not state derived
    // from props.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLanded(null)
    if (was.openNow) setOpenNow(false)
    if (was.bool.length) setBoolFilters((prev) => ({ ...prev, ...Object.fromEntries(was.bool.map((key) => [key, false])) }))
    setSelectFilters((prev) => withoutChosen(prev, was.select))
    setHasFilters((prev) => withoutChosen(prev, was.has))
    // Only the box's own changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])
  const openNowSyncedOnce = useRef(false)
  useEffect(() => {
    if (!openNowSyncedOnce.current) {
      openNowSyncedOnce.current = true
      return
    }
    onParamsChange?.({ openNow: openNow ? '1' : null }, { replace: true })
  }, [openNow, onParamsChange])
  return { search, setSearch, boolFilters, setBoolFilters, selectFilters, setSelectFilters, hasFilters, setHasFilters, landedSearch, openNow, setOpenNow }
}
