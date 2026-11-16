'use client'

import { lazy, Suspense, type ComponentType } from 'react'

// A component whose code loads on first use, like next/dynamic, that can also
// be loaded ahead of it, and then draws at once.
//
// next/dynamic can't: it is React.lazy, which pauses the first time it draws
// even when the code is already here (import() is always a promise), and
// React keeps a loading state it has shown up for at least 300ms. On a phone
// that was the first tap on a place: the sheet slid up empty and the place
// arrived ~0.3s later, every later tap at once (measured on the live site,
// Nov 16). Loaded ahead, this draws the component itself, with no pause.

export type Preloadable<P> = ComponentType<P> & {
  /** Starts loading the code; safe to call any number of times. */
  preload: () => void
}

// Every one made, so the unit suite can load them all up front, as it does
// next/dynamic's (src/test/eagerDynamic.ts, vitest.setup.ts).
const made: (() => Promise<void>)[] = []

/** Tests: loads every preloadable made so far. */
export function preloadEverything(): Promise<unknown> {
  return Promise.all(made.map((start) => start()))
}

export function preloadable<P extends object>(load: () => Promise<{ default: ComponentType<P> }>): Preloadable<P> {
  let Loaded: ComponentType<P> | null = null
  let pending: Promise<void> | null = null
  const start = () =>
    (pending ??= load().then(
      (m) => {
        Loaded = m.default
      },
      (err) => {
        // A failed download (offline, a deploy in between) can be tried again.
        pending = null
        throw err
      },
    ))
  made.push(start)
  const Lazy = lazy(() => start().then(() => ({ default: Loaded! })))

  function PreloadableComponent(props: P) {
    if (Loaded) return <Loaded {...props} />
    return (
      <Suspense fallback={null}>
        <Lazy {...props} />
      </Suspense>
    )
  }
  return Object.assign(PreloadableComponent, { preload: () => void start().catch(() => {}) })
}

/** Runs `fn` once the page has loaded and the browser is idle. Safari has no
 *  requestIdleCallback, so it falls back to a short timer. */
export function whenLoadedAndIdle(fn: () => void, idleTimeoutMs = 3000): void {
  if (typeof window === 'undefined') return
  const idle = () => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: idleTimeoutMs })
    else setTimeout(fn, 1000)
  }
  if (document.readyState === 'complete') idle()
  else window.addEventListener('load', idle, { once: true })
}
