'use client'

import { useEffect, useState } from 'react'
import { withCommunity } from './useCommunityData'
import { loadUpdates, UPDATES_EVENT, type UpdateStatus, type YourUpdate } from './yourUpdates'

// "Your updates" (Nov 27, board S4c): what this phone sent, and where each
// stands, asked of /api/updates. Shared by You's list and the dot on its
// tab and link, so one page load asks once; again when the visitor comes
// back to the tab, or sends another.

let shared: { key: string; at: number; promise: Promise<Record<string, UpdateStatus> | null> } | null = null
const FRESH_MS = 60_000

function statusesFor(community: string, updates: YourUpdate[]): Promise<Record<string, UpdateStatus> | null> {
  const key = `${community}|${updates.map((u) => u.id).join(',')}`
  if (shared && shared.key === key && Date.now() - shared.at < FRESH_MS) return shared.promise
  const promise = fetch(withCommunity('/api/updates', community), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      submissions: updates.filter((u) => u.kind === 'submission').map((u) => u.id),
      messages: updates.filter((u) => u.kind === 'message').map((u) => u.id),
    }),
  })
    .then((r) => r.json())
    .then((b) => (b?.ok && b.statuses && typeof b.statuses === 'object' ? (b.statuses as Record<string, UpdateStatus>) : null))
    .catch(() => null)
  shared = { key, at: Date.now(), promise }
  return promise
}

export type YourUpdates = { updates: YourUpdate[]; statuses: Record<string, UpdateStatus> }

/** This phone's updates and where each stands; null until read (the
 *  server's render has no device), and statuses empty until answered. */
export function useYourUpdates(community: string | null): YourUpdates | null {
  const [state, setState] = useState<YourUpdates | null>(null)
  useEffect(() => {
    if (!community) return
    let cancelled = false
    const check = () => {
      const updates = loadUpdates(community)
      setState((s) => ({ updates, statuses: s?.statuses ?? {} }))
      if (updates.length === 0) return
      statusesFor(community, updates).then((statuses) => {
        if (!cancelled && statuses) setState({ updates, statuses })
      })
    }
    check()
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    window.addEventListener(UPDATES_EVENT, check)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      window.removeEventListener(UPDATES_EVENT, check)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [community])
  return state
}

/** For tests: forget the shared answer. */
export function resetYourUpdatesForTests() {
  shared = null
}
