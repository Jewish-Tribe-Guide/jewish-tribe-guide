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
    document.body.style.overflow = 'hidden'
    // overflow: hidden alone stops real scrolling but not this: a trackpad
    // swipe over the page is also how Chrome/Safari recognize "you might be
    // swiping back," a gesture-preview animation that visibly slides the
    // whole page — separate from actual scrolling, and not something
    // overflow:hidden opts out of. Without this, that swipe read as "the
    // background is scrolling" behind an open dialog, most noticeable
    // moving left/right (a vertical scroll has nowhere to go regardless).
    document.body.style.overscrollBehaviorX = 'none'
    return () => {
      lockCount -= 1
      if (lockCount === 0) {
        document.body.style.overflow = ''
        document.body.style.overscrollBehaviorX = ''
      }
    }
  }, [active])
}
