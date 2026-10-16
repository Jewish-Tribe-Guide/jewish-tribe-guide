'use client'

import { useCallback, useRef, type UIEvent } from 'react'

/**
 * Where the map's list was scrolled to, put back when it comes back: open a
 * place from deep in the list, go Back, and you're where you were, not at
 * the top (the user, Oct 16: "that feels like a bad experience").
 *
 * The list and a place each get their own scroll element (so a place opens
 * at its own top), which means the list's element is gone while a place is
 * open; this remembers its offset meanwhile. Spread the result onto the
 * list's scroll element only.
 *
 * `listKey` names what the list holds (its places' ids): a different list —
 * a new search, another category — starts at its top, as it should.
 */
export function useKeptListScroll(listKey: string) {
  const saved = useRef<{ key: string; top: number } | null>(null)
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      if (el && saved.current?.key === listKey) el.scrollTop = saved.current.top
    },
    [listKey],
  )
  const onScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      saved.current = { key: listKey, top: e.currentTarget.scrollTop }
    },
    [listKey],
  )
  return { ref, onScroll }
}
