'use client'

import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { useSharedPreference } from '@/lib/useSharedPreference'

// ── How wide the list is beside the map, on a desktop category page ─────────
// Half and half until someone drags the line between them, as Claude's own
// sidebar and the Map page's results panel can be dragged (useMapSidebar).
// Kept as the list's share of the width rather than pixels, so a split made
// on a laptop still looks the same on a big monitor; remembered by the
// browser like Hide map is. Double-click the line to go back to half and
// half; the arrow keys move it for anyone not using a mouse, and Enter puts
// it back.
//
// A list wide enough for two 420px columns of rows gets them on its own:
// the rows' grid is auto-fill (see GenericDirectory).

/** The line between list and map, and the room around it. */
export const HANDLE_PX = 32
/** Narrower than this and a row's facts line gets cut short. */
export const LIST_MIN_PX = 420
/** Smaller than this and the map shows too little to be worth having. */
export const MAP_MIN_PX = 360
export const DEFAULT_SHARE = 0.5
/** One arrow-key press. */
const STEP = 0.03
const KEY = 'jpc:list-share'

/** The list's share of `avail` px (the width less the handle), kept where
 *  both list and map stay usable. Without a width (not laid out yet),
 *  between a quarter and three quarters. */
export function clampShare(share: number, avail: number): number {
  const lo = avail > 0 ? Math.min(LIST_MIN_PX / avail, 0.5) : 0.25
  const hi = avail > 0 ? Math.max(1 - MAP_MIN_PX / avail, 0.5) : 0.75
  return Math.min(hi, Math.max(lo, share))
}

/** The grid's columns for a share: list, handle, map. The px minimums hold
 *  on a screen narrower than the one the split was made on. */
export function splitColumns(share: number): string {
  return `minmax(${LIST_MIN_PX}px, ${share}fr) ${HANDLE_PX}px minmax(${MAP_MIN_PX}px, ${1 - share}fr)`
}

/** A stored share, or half and half for nothing stored or nonsense. */
function parseShare(raw: string | null): number {
  const n = raw === null ? NaN : Number(raw)
  return Number.isFinite(n) ? clampShare(n, 0) : DEFAULT_SHARE
}

export function useListMapSplit() {
  const [share, store] = useSharedPreference(KEY, parseShare)
  const setShare = (value: number) => store(value === DEFAULT_SHARE ? null : String(value))
  const gridRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ share: number } | null>(null)

  const avail = () => (gridRef.current ? gridRef.current.getBoundingClientRect().width - HANDLE_PX : 0)
  // While dragging, the columns move directly, without re-rendering the
  // list under them (a Food page is 70 rows); the share is kept on release.
  const show = (value: number) => {
    if (gridRef.current) gridRef.current.style.gridTemplateColumns = splitColumns(value)
  }
  const settle = (value: number) => {
    const rounded = Math.round(value * 1000) / 1000
    show(rounded)
    setShare(rounded)
  }

  const handleProps = {
    role: 'separator',
    'aria-orientation': 'vertical' as const,
    'aria-label': 'Resize the list and the map',
    'aria-valuemin': 0,
    'aria-valuemax': 100,
    'aria-valuenow': Math.round(share * 100),
    title: 'Drag to resize. Double-click for half and half.',
    tabIndex: 0,
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      try {
        // Keeps the drag going when the pointer runs over the map.
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // A pointer the browser no longer knows: dragging still works while
        // it stays over the line.
      }
      drag.current = { share }
      document.body.style.userSelect = 'none'
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      if (!drag.current || !gridRef.current) return
      const box = gridRef.current.getBoundingClientRect()
      const room = box.width - HANDLE_PX
      drag.current.share = clampShare((e.clientX - box.left - HANDLE_PX / 2) / room, room)
      show(drag.current.share)
    },
    onPointerUp: () => {
      if (!drag.current) return
      document.body.style.userSelect = ''
      settle(drag.current.share)
      drag.current = null
    },
    // The browser took the gesture over: back to where it started.
    onPointerCancel: () => {
      document.body.style.userSelect = ''
      drag.current = null
      show(share)
    },
    onDoubleClick: () => settle(DEFAULT_SHARE),
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        settle(clampShare(share + (e.key === 'ArrowRight' ? STEP : -STEP), avail()))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        settle(DEFAULT_SHARE)
      }
    },
  }

  const gridStyle: CSSProperties = { gridTemplateColumns: splitColumns(share) }
  return { gridRef, gridStyle, handleProps }
}
