'use client'

import { useEffect } from 'react'

// A plain `document.body.style.overflow = active ? 'hidden' : ''` (what this
// replaced) works fine for exactly one thing locking the page at a time, but
// breaks the moment two instances can be mid-transition in the same commit —
// arrow-key next/prev in ListingDetailModal closes one card's dialog and
// opens a sibling's in the same batch, and `document.body.style.overflow` is
// one global property: whichever instance's effect happens to run last wins,
// with no guarantee that's the one that should. Reference-counted instead: a
// closing instance's cleanup only ever ends the lock when NOTHING else still
// wants it, and an opening instance's effect always (re-)asserts it — so the
// count after both run in the same commit is correct regardless of which
// instance's effect React happens to run first. Addition is commutative;
// last-write-wins on a shared boolean isn't.
let lockCount = 0

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    lockCount += 1
    // documentElement, not body: `document.scrollingElement` in this app is
    // <html> (globals.css sets `overflow-x: hidden` there, which per CSS
    // Overflow 3 computes its own `overflow-y` to `auto` — see that file's
    // long comment on why that pairing lives on <html>, deliberately not on
    // <body>). Locking body.style.overflow was a no-op for real scrolling:
    // confirmed live, a scroll gesture over an "open" dialog still moved
    // window.scrollY, because the element that was actually locked wasn't
    // the one doing the scrolling.
    //
    // No overscroll-behavior-x here. That was tried once already, to paper
    // over the same scroll leak (a trackpad swipe looked like "the
    // background scrolling"), and it disabled the trackpad back-navigation
    // gesture site-wide while any dialog was open — the exact regression
    // globals.css's <html> comment already documents once (commit
    // d6261b6). Locking the real scrolling element removes the leak at its
    // source, so there's nothing left for overscroll-behavior to paper over.
    document.documentElement.style.overflow = 'hidden'
    return () => {
      lockCount -= 1
      if (lockCount === 0) {
        document.documentElement.style.overflow = ''
      }
    }
  }, [active])
}
