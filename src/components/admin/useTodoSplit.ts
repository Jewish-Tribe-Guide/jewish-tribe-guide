'use client'

import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { useSharedPreference } from '@/lib/useSharedPreference'

// ── How wide To do's list is beside the open place, on a computer ──────────
// The user, Nov 2: a way to set how much room To do takes. The line between
// the list and the place drags, as a category page's list and map do
// (useListMapSplit). Kept in pixels, not a share: the list is a column of
// rows that reads the same at any window width, and the place takes the
// rest. Remembered by the browser. Double-click the line, or Enter on it,
// for the usual width; the arrow keys move it.

/** The line between the list and the place, and the room around it. */
export const HANDLE_PX = 12
export const DEFAULT_LIST_PX = 380
/** Narrower than this and a row's name and its line get cut short. */
export const LIST_MIN_PX = 300
/** Narrower than this and the place's answers wrap onto three lines. */
export const PLACE_MIN_PX = 480
/** One arrow-key press. */
const STEP = 40
const KEY = 'jpc:todo-list-px'

/** The list's width, kept where both it and the place stay usable in a
 *  grid `width` px wide; without a width (not laid out yet), its own
 *  narrowest at least. */
export function clampListPx(px: number, width: number): number {
  const hi = width > 0 ? Math.max(LIST_MIN_PX, width - HANDLE_PX - PLACE_MIN_PX) : Infinity
  return Math.round(Math.min(hi, Math.max(LIST_MIN_PX, px)))
}

/** The grid's columns: list, line, place. The list keeps its width, held
 *  under what leaves the place its narrowest on a smaller window than the
 *  one it was set on. */
export function todoColumns(px: number): string {
  return `clamp(${LIST_MIN_PX}px, ${px}px, max(${LIST_MIN_PX}px, calc(100% - ${HANDLE_PX + PLACE_MIN_PX}px))) ${HANDLE_PX}px minmax(0, 1fr)`
}

/** A stored width, or the usual for nothing stored or nonsense. */
function parsePx(raw: string | null): number {
  const n = raw === null ? NaN : Number(raw)
  return Number.isFinite(n) ? clampListPx(n, 0) : DEFAULT_LIST_PX
}

export function useTodoSplit() {
  const [px, store] = useSharedPreference(KEY, parsePx)
  const setPx = (value: number) => store(value === DEFAULT_LIST_PX ? null : String(value))
  const gridRef = useRef<HTMLDivElement>(null)
  const drag = useRef<number | null>(null)

  const width = () => gridRef.current?.getBoundingClientRect().width ?? 0
  // While dragging, the columns move directly, without re-rendering the
  // list or the place; the width is kept on release.
  const show = (value: number) => {
    if (gridRef.current) gridRef.current.style.gridTemplateColumns = todoColumns(value)
  }
  const settle = (value: number) => {
    show(value)
    setPx(value)
  }
  const done = () => {
    document.body.style.userSelect = ''
    drag.current = null
  }

  const handleProps = {
    role: 'separator',
    'aria-orientation': 'vertical' as const,
    'aria-label': 'Resize To do and the place',
    'aria-valuemin': LIST_MIN_PX,
    'aria-valuenow': px,
    title: 'Drag to resize. Double-click for the usual width.',
    tabIndex: 0,
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      try {
        // Keeps the drag going when the pointer runs over the place.
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // A pointer the browser no longer knows: dragging still works while
        // it stays over the line.
      }
      drag.current = px
      document.body.style.userSelect = 'none'
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      if (drag.current === null || !gridRef.current) return
      const box = gridRef.current.getBoundingClientRect()
      drag.current = clampListPx(e.clientX - box.left - HANDLE_PX / 2, box.width)
      show(drag.current)
    },
    onPointerUp: () => {
      if (drag.current === null) return
      settle(drag.current)
      done()
    },
    // The browser took the gesture over: back to where it started.
    onPointerCancel: () => {
      done()
      show(px)
    },
    onDoubleClick: () => settle(DEFAULT_LIST_PX),
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        settle(clampListPx(px + (e.key === 'ArrowRight' ? STEP : -STEP), width()))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        settle(DEFAULT_LIST_PX)
      }
    },
  }

  const gridStyle: CSSProperties = { gridTemplateColumns: todoColumns(px) }
  return { gridRef, gridStyle, handleProps }
}
