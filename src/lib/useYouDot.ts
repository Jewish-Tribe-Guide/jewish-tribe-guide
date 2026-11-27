'use client'

import { useEffect, useState } from 'react'
import { useOptionalCommunitySlug } from './communityContext'
import { useOptionalPinned } from './pinnedContext'
import { withCommunity } from './useCommunityData'
import { loadSeenAt, SEEN_EVENT, youHasNews } from './youChanges'
import { useYourUpdates } from './useYourUpdates'
import { hasLiveNews } from './yourUpdates'

// The blue dot on You, on the phone's tab and the computer header's link
// (board PhoneYouDot, the user, Nov 15): a saved place changed since You was
// last opened. Asks only when something is saved; once per page load for
// both places, and again when the visitor comes back to the tab.

let shared: { community: string; at: number; promise: Promise<Record<string, string> | null> } | null = null
const FRESH_MS = 60_000

function latestFor(community: string): Promise<Record<string, string> | null> {
  if (shared && shared.community === community && Date.now() - shared.at < FRESH_MS) return shared.promise
  const promise = fetch(withCommunity('/api/changes', community))
    .then((r) => r.json())
    .then((b) => (b?.ok && b.latest && typeof b.latest === 'object' ? (b.latest as Record<string, string>) : null))
    .catch(() => null)
  shared = { community, at: Date.now(), promise }
  return promise
}

export function useYouDot(): boolean {
  const community = useOptionalCommunitySlug()
  const pinned = useOptionalPinned()?.pinned
  const ids = pinned?.map((p) => p.id).join('|') ?? ''
  const [dot, setDot] = useState(false)
  useEffect(() => {
    if (!community || !ids) return
    let cancelled = false
    const list = ids.split('|')
    const check = () => {
      latestFor(community).then((latest) => {
        if (!cancelled) setDot(youHasNews(latest, list, loadSeenAt()))
      })
    }
    check()
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    window.addEventListener(SEEN_EVENT, check)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      window.removeEventListener(SEEN_EVENT, check)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [community, ids])
  // Or an update this phone sent went live since You was last opened
  // (Nov 27, board S4c: the dot, not a pop-up). Opening You puts it out.
  const updates = useYourUpdates(community)
  const [seenAt, setSeenAt] = useState<number | null>(null)
  useEffect(() => {
    const read = () => setSeenAt(loadSeenAt())
    read()
    window.addEventListener(SEEN_EVENT, read)
    return () => window.removeEventListener(SEEN_EVENT, read)
  }, [])
  const live = !!updates && hasLiveNews(updates.statuses, seenAt)
  // Nothing saved any more: no dot, whatever the last answer was.
  return (dot && !!community && !!ids) || live
}

/** For tests: forget the shared answer. */
export function resetYouDotForTests() {
  shared = null
}
