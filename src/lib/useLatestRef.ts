'use client'

import { useEffect, useRef, type RefObject } from 'react'

/**
 * A ref that always holds the latest value, for a callback that should use
 * it without being remade when it changes.
 *
 * The admin's sign-in token is the case: Supabase hands the page a new one
 * about once an hour. A screen's `load` that lists `token` in its deps is
 * remade then, `useLoadOnMount` runs it again, and a screen that loads its
 * draft that way put the saved values back over what was being typed
 * (Nov 18 review).
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  }, [value])
  return ref
}
