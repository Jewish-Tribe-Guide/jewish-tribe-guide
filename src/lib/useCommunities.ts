'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { Community } from './communityStore'

// ─────────────────────────────────────────────────────────────────────────────
// Which community the visitor is looking at.
//
// Persisted in localStorage, no login — same mechanism useStoredLocation
// already uses for the address. That's per-device and iOS Safari evicts it
// after ~7 days of not visiting, so the stored value is treated as a
// preference to restore, never as something the visitor must curate: losing it
// just means landing on the default community again.
//
// Deliberately separate from location. Location drives distance sorting;
// community selects which directory you're reading. They can disagree (someone
// in Philly planning a Baltimore trip), so nothing here reads coordinates — a
// mismatch is surfaced as an offer to switch, not an automatic switch.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'jpc:community'

let cache: Community[] | null = null
let inflight: Promise<Community[]> | null = null

/** Every community this site hosts. Null while loading. */
export function useCommunities(): Community[] | null {
  const [communities, setCommunities] = useState<Community[] | null>(cache)

  useEffect(() => {
    if (cache) return
    inflight ??= fetch('/api/communities')
      .then((res) => res.json())
      .then((body) => (body.ok ? (body.communities as Community[]) : []))
      .catch(() => [])
    let active = true
    inflight.then((loaded) => {
      cache = loaded
      if (active) setCommunities(loaded)
    })
    return () => {
      active = false
    }
  }, [])

  return communities
}

export type ActiveCommunity = {
  /** The chosen community, or null until the list has loaded. */
  community: Community | null
  /** Every community, for the switcher. Null while loading. */
  communities: Community[] | null
  /** True once more than one exists — the switcher stays hidden below this, so
   *  a single-community site looks exactly as it did before any of this. */
  canSwitch: boolean
  setCommunity: (slug: string) => void
}

// localStorage as an external store, read through useSyncExternalStore rather
// than copied into state by an effect. That keeps the server snapshot (null —
// it can't know the visitor's choice) distinct from the client's without a
// hydration mismatch, and gets cross-tab sync for free: switching community in
// one tab moves the others too.
const listeners = new Set<() => void>()

function subscribeToStoredSlug(onChange: () => void) {
  listeners.add(onChange)
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

function readStoredSlug(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null // private mode — fall through to the default community
  }
}

/** The active community, restored from localStorage and resolved against the
 *  real list (a stale slug falls back to the default rather than 404ing). */
export function useActiveCommunity(): ActiveCommunity {
  const communities = useCommunities()
  const slug = useSyncExternalStore(subscribeToStoredSlug, readStoredSlug, () => null)

  const setCommunity = useCallback((next: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* not persisting is survivable, but then there's nothing to re-read */
    }
    // `storage` only fires in OTHER tabs, so this tab is notified directly.
    listeners.forEach((l) => l())
  }, [])

  const community =
    communities?.find((c) => c.slug === slug) ??
    communities?.find((c) => c.isDefault) ??
    communities?.[0] ??
    null

  return {
    community,
    communities,
    canSwitch: (communities?.length ?? 0) > 1,
    setCommunity,
  }
}

/** The active community's slug as a query param for the data APIs, or '' when
 *  it isn't known yet. Callers append it so a request always names the
 *  community it wants rather than relying on server-side default state. */
export function communityParam(slug: string | null | undefined): string {
  return slug ? `community=${encodeURIComponent(slug)}` : ''
}
