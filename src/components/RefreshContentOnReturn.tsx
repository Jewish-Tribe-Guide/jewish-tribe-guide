'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

// ─────────────────────────────────────────────────────────────────────────────
// Asks the server for the community layout's content again on the moments it
// could have gone stale unnoticed: the tab coming back into view, and the
// network coming back.
//
// [community]/layout.tsx loads categories, site settings, home sections, forms
// and hospitals once and hands them to ContentProvider. That is deliberate and
// worth keeping — it replaced five post-hydration fetches, so the HTML ships
// with the real content instead of skeletons. But an App Router layout does
// not re-render on client-side navigation between the screens under it, which
// left all five pinned to whatever they were when the tab first loaded, for as
// long as the tab stayed open. An admin could rename a category, publish a
// form, or hide a section, and an already-open tab would never show it — not
// on the next navigation, not an hour later, only on a full reload.
//
// That is worst in the case this app is actually used in. It's an installed
// PWA: a phone gets backgrounded rather than closed, and a desktop tab stays
// open for days. Those are exactly the sessions that never reload.
//
// The three triggers are the same set SWR and React Query revalidate on by
// default, minus polling — deliberately, because a background request on a
// loop costs battery and mobile data for content an admin changes a few times
// a week. What is left:
//
//   • visibilitychange — the tab was backgrounded and is being looked at again
//   • focus            — a desktop window can be fully visible and simply not
//                        focused for hours, which never fires visibilitychange
//                        (useNow.ts makes the same point for the same reason)
//   • online           — this app is used on hospital wifi and mobile data,
//                        where losing signal and regaining it is an ordinary
//                        part of a session. Without this, reconnecting leaves
//                        the content stale until something else happens to
//                        fire one of the two above.
//
// The reasoning for the first is useNow.ts's, verbatim, about the clock:
// however long the tab was away, this is the moment the screen is wrong and
// about to be looked at.
//
// router.refresh() rather than a reload: it re-renders the route on the server
// (layout included, which is the whole point) while keeping client state, so a
// half-filled form or a scroll position survives. Server-side revalidation is
// already correct and quick — an admin save reaches the server's own cache in
// 2-4 seconds, measured — so this only has to make the client ask again.
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum gap between refreshes.
 *
 *  All three triggers can arrive in bursts — alt-tabbing between two windows
 *  fires focus on every switch, and a flaky mobile connection fires `online`
 *  repeatedly as it flaps — and each refresh is a real request, so bursts
 *  collapse into one. Ten seconds is short enough that any genuine "came back
 *  to the app" gap clears it, and long enough that flipping back and forth
 *  doesn't send a request per flip. The content behind it changes when an
 *  admin saves — rarely — so there is nothing to gain from being twitchier. */
export const MIN_REFRESH_INTERVAL_MS = 10_000

export default function RefreshContentOnReturn() {
  const router = useRouter()
  // Seeded in the effect below rather than here. `useRef(Date.now())` reads
  // the clock during render, and Cache Components rejects that outright in a
  // prerendered client component ("Next.js encountered the unstable value
  // `Date.now()`") — it would bake a build-time instant into static output.
  // The production build catches it; `next dev` does not. useNow.ts seeds its
  // own clock the same way, at subscribe time, for the same reason.
  const lastRefreshedAt = useRef(0)

  useEffect(() => {
    // Mount time, not 0: the content is fresh as of this render, so the
    // throttle is measured from here. Seeding 0 would let the first focus
    // event after load — which on desktop often arrives immediately — spend a
    // request re-fetching what just arrived.
    lastRefreshedAt.current = Date.now()

    function refreshIfDue() {
      const now = Date.now()
      if (now - lastRefreshedAt.current < MIN_REFRESH_INTERVAL_MS) return
      lastRefreshedAt.current = now
      router.refresh()
    }

    function onVisibilityChange() {
      // Only on the way back in. Going away is not a moment anyone is looking
      // at the screen, and refreshing a hidden tab spends a request on a
      // render nobody sees.
      if (!document.hidden) refreshIfDue()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', refreshIfDue)
    window.addEventListener('online', refreshIfDue)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', refreshIfDue)
      window.removeEventListener('online', refreshIfDue)
    }
  }, [router])

  return null
}
