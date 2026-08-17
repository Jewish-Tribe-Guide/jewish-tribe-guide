'use client'

import { useEffect } from 'react'

// The fetch-on-mount effect, extracted: every admin screen (and /inbox) does
// `const load = useCallback(async () => {...}, [deps])` for its own
// endpoint(s), then fires it once on mount. Six call sites had this exact
// three-line wrapper (each with its own react-hooks/set-state-in-effect
// suppression comment, since `load` only touches state after its own
// `await` — a real cascading render the rule can't see past the function
// call); routed through here, the rule can't trace into a generic `() =>
// void` parameter either, so none of those suppressions are needed anymore.
// This collapses just the wrapper, not the fetch logic itself, which varies
// too much per screen (different endpoints, some with 401 handling,
// CategoryManager calling `load` again after every mutation) to safely
// unify further.
export function useLoadOnMount(load: () => void): void {
  useEffect(() => {
    load()
  }, [load])
}
