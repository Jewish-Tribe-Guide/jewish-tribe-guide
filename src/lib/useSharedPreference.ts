'use client'

import { useCallback, useSyncExternalStore } from 'react'

// ── A browser-wide preference, the same on every page that shows it ─────────
// For the category pages' Hide map, list/map split and Cards/List: one
// choice for every category, remembered by the browser.
//
// Not usePersistedState, which gives each page its own copy read once on
// mount: the app keeps recently visited pages alive for Back, so a map hidden
// on Food still showed on a Grocery page kept from before. Here every page
// reads the one stored value and hears when it changes, including from
// another tab. Where storage is blocked, the choice lasts until the tab
// closes.

const listeners = new Map<string, Set<() => void>>()
const memory = new Map<string, string | null>()

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return memory.get(key) ?? null
  }
}

function notify(key: string) {
  listeners.get(key)?.forEach((l) => l())
}

/** Stores `raw` (null removes it) and tells every page showing it. */
export function setSharedPreference(key: string, raw: string | null) {
  memory.set(key, raw)
  try {
    if (raw === null) localStorage.removeItem(key)
    else localStorage.setItem(key, raw)
  } catch {
    // Blocked storage: kept in memory above.
  }
  notify(key)
}

/** The stored string for `key` read through `parse` (which gets null when
 *  nothing is stored, and on the server), and a setter taking the string to
 *  store (null for none). */
export function useSharedPreference<T>(key: string, parse: (raw: string | null) => T): [T, (raw: string | null) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const set = listeners.get(key) ?? new Set()
      set.add(onChange)
      listeners.set(key, set)
      const onStorage = (e: StorageEvent) => {
        if (e.key === key || e.key === null) onChange()
      }
      window.addEventListener('storage', onStorage)
      return () => {
        set.delete(onChange)
        window.removeEventListener('storage', onStorage)
      }
    },
    [key],
  )
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  )
  const set = useCallback((value: string | null) => setSharedPreference(key, value), [key])
  return [parse(raw), set]
}
