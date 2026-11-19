'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { replaceAddress } from '@/lib/replaceAddress'

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
//
// But it asks first, and refreshes only when the answer changed (the user,
// Oct 18). A refresh used to go out on every return, and a tap made while it
// was out — coming back to the guide and opening a category, the commonest
// thing to do — waited for it: React holds every running transition until
// all of them finish, so the navigation sat behind a whole server render,
// seconds on a phone whose network was just waking. Measured in
// e2e/return-to-app.spec.ts: 6.4s for a tap behind a refresh held 6s. The
// question is a plain fetch of /api/content-version, a fingerprint of the
// community's content (contentVersion.ts), which no tap ever waits on; the
// content changes a few times a week, so the refresh is now rare.
//
// It still went out on nearly every return (found Nov 16, the user: taps
// "take forever or don't work" after switching tabs). The live server's
// answer flipped between two fingerprints from one request to the next (its
// instances held different cached copies), and a page cached hours earlier
// carried a third; refreshing that page brought the same old one back, so it
// never matched and every return refreshed. Now:
//   • the answer is one stored stamp every server reads fresh
//     (contentStamp.ts, migration 100), so it says "changed" only when
//     something did.
//   • a page that's still behind after a refresh (a cached copy built
//     before the change) is refreshed at most REFRESHES_PER_VERSION times
//     for that change, never on every return.
//   • the refresh waits until the visitor has been still for QUIET_MS, and
//     a tap or key restarts the wait, so the tap they came back to make is
//     never the one held behind it.
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

/** A refresh can bring back a cached copy built before the change (it's
 *  regenerated in the background), so a second try is allowed; never more. */
export const REFRESHES_PER_VERSION = 2

/** How long the visitor must be still before a refresh goes out. */
export const QUIET_MS = 1_500

export default function RefreshContentOnReturn({ community, version }: { community: string; version: string }) {
  const router = useRouter()
  // The fingerprint of what's on screen, kept current as a refresh brings a
  // new one down with the layout.
  // The version on screen, kept current as a refresh brings a new one, and
  // how many refreshes each newer version has had.
  const shown = useRef(version)
  useEffect(() => {
    shown.current = version
  }, [version])
  const tries = useRef(new Map<string, number>())
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

    async function refreshIfDue() {
      const now = Date.now()
      if (now - lastRefreshedAt.current < MIN_REFRESH_INTERVAL_MS) return
      lastRefreshedAt.current = now
      try {
        const res = await fetch(`/api/content-version?community=${encodeURIComponent(community)}`, { cache: 'no-store' })
        const body = (await res.json()) as { ok?: boolean; version?: string }
        // No answer (offline, a failed read) is no reason to re-render.
        if (!res.ok || !body.ok || !body.version || body.version === shown.current) return
        const tried = tries.current.get(body.version) ?? 0
        if (tried >= REFRESHES_PER_VERSION) return
        tries.current.set(body.version, tried + 1)
        refreshWhenStill()
      } catch {
        // Offline: `online` asks again when it's back.
      }
    }

    // A tap or key while waiting restarts the wait.
    let quiet: ReturnType<typeof setTimeout> | undefined
    const ACTIVITY = ['pointerdown', 'keydown'] as const
    function stopWaiting() {
      clearTimeout(quiet)
      quiet = undefined
      for (const type of ACTIVITY) window.removeEventListener(type, wait, true)
    }
    function wait() {
      clearTimeout(quiet)
      quiet = setTimeout(() => {
        stopWaiting()
        // The category page and the map write their search, filters, an
        // open listing and the Minyan view into the address behind Next's
        // router, so a re-render doesn't follow every keystroke. The
        // refresh's commit writes back the address the router last knew,
        // which dropped them all: a reload then showed another screen
        // (Nov 18, `?davening=1` gone on coming back). Told first, the
        // router refreshes the address as it is.
        replaceAddress(window.location.href)
        router.refresh()
      }, QUIET_MS)
    }
    function refreshWhenStill() {
      if (quiet === undefined) for (const type of ACTIVITY) window.addEventListener(type, wait, true)
      wait()
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
      stopWaiting()
    }
  }, [router, community])

  return null
}
