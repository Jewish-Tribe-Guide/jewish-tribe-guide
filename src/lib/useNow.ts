'use client'

import { useSyncExternalStore } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// A shared clock for everything that renders "now": the Open/Closes Soon
// badges, today's hours row, the day-of-week the week view highlights, and the
// calculated zman times.
//
// All of those used to call `new Date()` inline during render and never look
// again — there was no `setInterval` anywhere in the app, and nothing listened
// for the tab coming back. So a tab left open showed the hours of whatever day
// it was opened on, Open badges for shops that had since closed, and yesterday's
// zmanim. That matters more here than it would elsewhere: the visitor this is
// built for backgrounds the app in a hospital corridor and comes back to it
// hours later, and "what's open right now" is the entire question they're asking.
//
// Deliberately not a pull-to-refresh gesture, which was the other way to fix
// this. The data was never stale — the service worker is network-first for
// content and the server invalidates on every admin save — so a refresh would
// have re-fetched identical bytes and changed nothing on screen. It was always
// the clock that was stale, and a clock can fix itself.
//
// One timer and one pair of listeners for the whole page, however many
// components subscribe. The timer stops while the tab is hidden: a background
// tab has nobody to show a fresh badge to, and coming back fires
// visibilitychange, which resyncs immediately.
// ─────────────────────────────────────────────────────────────────────────────

/** Minute granularity, because that's the finest distinction anything here
 *  draws — an opening time, a closing time, "closes within the hour". */
const TICK_MS = 60_000

function dayKey(now: number): string {
  const d = new Date(now)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

/** The shared snapshot. Held in a variable rather than read fresh inside
 *  getSnapshot because useSyncExternalStore compares snapshots by identity and
 *  re-reads during render — a `Date.now()` there would differ every call and
 *  loop forever. */
let current = Date.now()

/** Fixed for the life of the module, so the server render and the hydration
 *  render agree on it. React swaps to the live snapshot immediately after
 *  hydrating, which is also what corrects a page served from the CDN or the
 *  service worker whose HTML — and whose badges — may be a day old. */
const AT_LOAD = current

function broadcast() {
  current = Date.now()
  for (const listener of listeners) listener()
}

function startTicking() {
  if (timer === null) timer = setInterval(broadcast, TICK_MS)
}

function stopTicking() {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

function onVisibilityChange() {
  if (document.hidden) {
    stopTicking()
  } else {
    startTicking()
    // The important one. However long the tab was away — a minute or a
    // weekend — this is the moment the screen is wrong and about to be looked
    // at, so correct it before the next tick would.
    broadcast()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1) {
    // React subscribes after the first render, so this is the mount resync:
    // however long ago this HTML was generated, `current` is right by the time
    // anyone reads it.
    current = Date.now()
    document.addEventListener('visibilitychange', onVisibilityChange)
    // focus as well as visibilitychange: a desktop window can be fully visible
    // and simply not focused for hours, which never fires visibilitychange.
    window.addEventListener('focus', broadcast)
    if (!document.hidden) startTicking()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      stopTicking()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', broadcast)
    }
  }
}

/**
 * The current time in ms, refreshed every minute while the tab is visible and
 * immediately when it becomes visible or focused again.
 *
 * Pass it to the `hours` helpers (all of which take an optional clock) instead
 * of letting them default to `new Date()`, and a badge re-evaluates when the
 * visitor comes back instead of staying frozen at whatever moment the page
 * happened to render.
 */
export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => AT_LOAD,
  )
}

/** The local calendar day, as a `YYYY-M-D` key.
 *
 *  Reads the same clock but snapshots it as a string, so a component that only
 *  cares about the date rolling over doesn't re-render every minute for it —
 *  equal strings are `===`, so React bails out of every tick that didn't cross
 *  midnight. That makes it safe as an effect dependency. */
export function useToday(): string {
  return useSyncExternalStore(
    subscribe,
    () => dayKey(current),
    () => dayKey(AT_LOAD),
  )
}
