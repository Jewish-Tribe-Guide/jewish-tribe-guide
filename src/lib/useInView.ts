'use client'

import { useEffect, useRef, useState } from 'react'

/** True once the returned ref's element has intersected the viewport at
 *  least once — then stays true, no need to keep observing after that.
 *
 *  A `display:none` element (e.g. hidden on mobile via a `hidden sm:block`
 *  wrapper) never has a box and so never intersects anything — this
 *  correctly never flips true for it, which is exactly what a "don't mount
 *  this until it's actually going to be seen" gate needs to get right on
 *  both counts: deferred while below the fold, never mounted at all when
 *  the wrapper hides it outright.
 *
 *  SSR/first-paint safe: starts false, matching the server render — same
 *  reasoning as useIsMobile. Not a replacement for it (this is about
 *  whether an element is ever going to be visible at all, not the
 *  viewport's width). */
export function useInView<T extends Element>(rootMargin = '200px'): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    if (inView) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true)
      },
      { rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [inView, rootMargin])

  return [ref, inView]
}
