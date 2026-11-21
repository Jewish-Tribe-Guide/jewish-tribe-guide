import { useEffect, useRef } from 'react'
import { whenSettled } from '@/lib/whenSettled'

// Finding a listing's row on the category page and scrolling it into view,
// clear of the header and the controls bar, or to the top of the listing
// open in the list's column (GenericDirectory).

export function useRowScroller() {
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
  // The listing open in the list's column on a computer (ListingColumn).
  const listingColumnRef = useRef<HTMLDivElement>(null)
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
  //
  // It gives up after a few seconds (whenSettled), and any wait still going
  // when the list goes away is stopped, so a row that never shows up can't
  // keep a timer running.
  const settleWaits = useRef(new Set<() => void>())
  useEffect(() => {
    const waits = settleWaits.current
    return () => {
      for (const cancel of waits) cancel()
      waits.clear()
    }
  }, [])
  const scrollItemIntoViewWhenSettled = (id: string, behavior: ScrollBehavior) => {
    const cancel = whenSettled(
      () => listingColumnRef.current ?? itemRowRefs.current.get(id),
      () => {
        settleWaits.current.delete(cancel)
        scrollItemIntoView(id, behavior)
      },
    )
    settleWaits.current.add(cancel)
    return () => {
      cancel()
      settleWaits.current.delete(cancel)
    }
  }
  return { setItemRowRef, controlsRef, listingColumnRef, scrollItemIntoViewWhenSettled }
}
