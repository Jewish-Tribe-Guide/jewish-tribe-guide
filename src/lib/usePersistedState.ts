'use client'

import { useEffect, useState } from 'react'

// The "start empty to match SSR, then restore from localStorage in a
// post-mount effect, then persist on every change" hydration dance — shared
// by pinnedContext.tsx, droppedPinsContext.tsx, and useStoredLocation.ts, each
// of which had its own copy of the same hydrated-guard, load effect, and save
// effect. Deliberately does NOT try to unify the mutation APIs those three
// files build on top (toggle, add/remove/rename, three composed setters) —
// they're genuinely different shapes for genuinely different data, and
// forcing one mutation interface on all three would be a worse fit than the
// duplication it replaces. This only collapses the hydration mechanics;
// callers still get the raw `[value, setValue]` pair to build their own
// mutators on.
//
// `hydrated` is state, not a ref, on purpose — a ref-guarded version (what
// all three originals actually had) fires `save()` with the pre-hydration
// empty value on every single mount: both effects run in the same initial
// commit, and by the time the save effect runs, the ref the load effect just
// set is already `true` even though `value` in that same pass is still the
// initial empty one. Harmless in practice (the correctly-loaded value
// immediately overwrites it, before anything else observes the intermediate
// state), but it's a wasted write every time and easy enough to actually
// avoid: as state, the save effect's closure still sees `hydrated`'s stale
// (false) value on that first pass, so it correctly skips until the
// load-triggered re-render actually lands.
export function usePersistedState<T>(
  initial: T,
  load: () => T,
  save: (value: T) => void,
) {
  const [value, setValue] = useState<T>(initial)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(load())
    setHydrated(true)
    // Deliberately once-only: `load` reads a mount-time snapshot, not a live
    // subscription — see the three callers' own reasoning for why this isn't
    // a useSyncExternalStore candidate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hydrated) return
    save(value)
  }, [value, hydrated, save])

  return [value, setValue] as const
}
