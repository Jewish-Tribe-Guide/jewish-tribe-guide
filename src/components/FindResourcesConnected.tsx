'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import FindResources, { type FindResourcesProps } from './FindResources'

type Props = Omit<
  FindResourcesProps,
  'searchItem' | 'searchQuery' | 'searchOpenNow' | 'searchFilters' | 'searchHospital' | 'searchForm' | 'searchDavening' | 'searchDaveningDay' | 'onParamsChange'
>

// The query-string-aware half of FindResources, split out so the plain-URL
// case (no ?item=/?q=/?hospital=/?form= at all — the common one: a fresh
// visit, a crawler, a card tap) never has to call useSearchParams() to
// render. See FindResources' own searchItem/onParamsChange doc comments —
// this is what actually supplies them once the page has hydrated. The
// caller wraps this in <Suspense fallback={<FindResources {...props} />}>,
// so the fallback IS FindResources, just with none of the query-string
// props set — the exact same render this component produces on a plain
// URL, with zero duplicated JSX between the static and live paths.
export default function FindResourcesConnected(props: Props) {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  const setParams = (changes: Record<string, string | null>, opts?: { replace?: boolean }) => {
    // window.location.search, not the closure-captured `params` above:
    // `params` is only as fresh as this component's LAST completed render,
    // and a `router.replace` navigation doesn't resolve synchronously — it's
    // still in flight by the time a SECOND, fast-following call can arrive
    // (e.g. clicking three checkbox filters in quick succession, each one
    // calling this via GenericDirectory's own sync effect). Building off the
    // stale `params` there meant the second call's `next` never saw the
    // first call's change, so whichever replace actually committed last
    // silently dropped it — filters that visibly checked in the UI would
    // vanish from the URL a moment later. window.location.search is always
    // the CURRENT address bar, synchronously, regardless of where this
    // component's own re-render happens to be.
    const next = new URLSearchParams(window.location.search)
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key)
      else next.set(key, value)
    }
    const qs = next.toString()
    const url = qs ? `${pathname}?${qs}` : pathname
    // The directory's own search/"Open now"/filter sync (see FindResources'
    // own onParamsChange doc) goes straight through the History API, NOT
    // router.replace. Even with the URLSearchParams themselves debounced
    // and now built off window.location.search directly (see above),
    // router.replace still routes through Next's OWN navigation machinery —
    // which, on a searchParams-only change to an ALREADY-mounted route,
    // still triggers a fresh render pass through this component and
    // everything below it (FindResources → ResourceLoader →
    // GenericDirectory → the whole listing grid), because this component
    // reads those very params via useSearchParams(). That's a real
    // re-render cascade landing on every debounced sync, not a rendering
    // bug in any one component — confirmed live as the reported "pointer
    // glitching" (dropped frames from the re-render) and, separately, the
    // header's own flash reappearing once a listing dialog's scroll-lock
    // reflow (see globals.css's scrollbar-gutter fix) landed on top of an
    // already-busy main thread.
    //
    // A plain history.replaceState changes the address bar with NO React
    // re-render at all: nothing here subscribes to raw window.location, and
    // GenericDirectory already holds search/openNow/filter state locally
    // (this call exists purely so the URL is shareable and survives a
    // reload — see GenericDirectory's own hydration effects for the other
    // half of that). router.push stays for the item/form/hospital
    // navigations below — those DO need Next's own history/back-button
    // integration, which this sync deliberately opts out of.
    if (opts?.replace) window.history.replaceState(window.history.state, '', url)
    else router.push(url)
  }

  return (
    <FindResources
      {...props}
      searchItem={params.get('item')}
      searchQuery={params.get('q')}
      searchOpenNow={params.get('openNow')}
      searchFilters={Object.fromEntries(params.entries())}
      searchHospital={params.get('hospital')}
      searchForm={params.get('form')}
      searchDavening={params.get('davening')}
      searchDaveningDay={params.get('day')}
      onParamsChange={setParams}
    />
  )
}
