'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// A multi-select filter dropdown used by the directory toolbar (e.g. choosing
// several kosher certs at once). Renders its popup in a fixed-position layer so
// it isn't clipped by the toolbar's horizontal scroll container.
export default function CheckboxDropdown({
  label, active, isOpen, onToggleOpen, onClose, values, chosen, onToggle, size = 'md',
}: {
  label: string
  active: boolean
  isOpen: boolean
  onToggleOpen: () => void
  onClose: () => void
  values: string[]
  chosen: string[]
  onToggle: (v: string) => void
  /** 'sm' matches the map filter controls' compact rounded-full pill sizing
   *  (so a select dropdown trigger doesn't tower over the bool-field pills
   *  sitting right next to it); default 'md' is the directory toolbar's own
   *  size, unchanged. */
  size?: 'sm' | 'md'
}) {
  const ref = useRef<HTMLDivElement>(null)
  // The popup itself is portaled to document.body (see below), so it's no
  // longer a DOM descendant of `ref` — needs its own ref for the outside-click
  // check, or clicking a checkbox inside the popup would read as "outside"
  // and close it before the click even registers.
  const popupRef = useRef<HTMLDivElement>(null)
  // `top` (opens downward) unless there isn't room below the button (e.g. a
  // row near the bottom of a full-screen list, like the map's category
  // picker) — then `bottom` (opens upward) instead, hence the two being
  // separate optional fields rather than one "y" — only one is ever set.
  // `left` is clamped so the ~200px-wide popup can't run off the right edge
  // of the viewport either.
  const [popupPos, setPopupPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null)

  useEffect(() => {
    if (!isOpen) return
    function handleClick(e: MouseEvent | TouchEvent) {
      const target = e.target as Node
      if (ref.current?.contains(target)) return
      if (popupRef.current?.contains(target)) return
      onClose()
    }
    // Close if the user scrolls so the popup doesn't float in the wrong spot.
    function handleScroll() { onClose() }
    // Capture phase, and both mousedown and touchstart — something the
    // trigger sits over (a draggable list, a map) may call
    // stopPropagation()/preventDefault() on the touch that starts its own
    // gesture, which both stops a bubble-phase listener from ever seeing it
    // and can suppress the synthetic mousedown a touch would otherwise
    // generate. A capture-phase document listener runs before any of that.
    document.addEventListener('mousedown', handleClick, true)
    document.addEventListener('touchstart', handleClick, true)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      document.removeEventListener('mousedown', handleClick, true)
      document.removeEventListener('touchstart', handleClick, true)
      window.removeEventListener('scroll', handleScroll)
    }
  }, [isOpen, onClose])

  // A rough estimate of the popup's height (each option row is ~36px, plus
  // the list's own vertical padding) — good enough to decide whether it fits
  // below the button without waiting a render to measure the real thing.
  const ESTIMATED_ROW_PX = size === 'sm' ? 30 : 36
  const POPUP_WIDTH_PX = size === 'sm' ? 160 : 200

  function handleToggleOpen() {
    if (!isOpen && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      const estimatedHeight = values.length * ESTIMATED_ROW_PX + 8
      const left = Math.min(rect.left, window.innerWidth - POPUP_WIDTH_PX - 8)
      const fitsBelow = rect.bottom + 4 + estimatedHeight <= window.innerHeight
      setPopupPos(
        fitsBelow
          ? { top: rect.bottom + 4, left }
          : { bottom: window.innerHeight - rect.top + 4, left },
      )
    }
    onToggleOpen()
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={handleToggleOpen}
        className={
          size === 'sm'
            ? [
                'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap transition-colors',
                // Open reads the same as "has a value chosen" — one filled
                // treatment for "this pill is currently engaged," not two.
                active || isOpen
                  ? 'border-primary bg-primary text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
              ].join(' ')
            : [
                'flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm cursor-pointer whitespace-nowrap transition-colors',
                active
                  ? 'border-primary bg-primary/5 text-primary font-medium'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
              ].join(' ')
        }
      >
        {label}
        <svg className={`${size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && popupPos && createPortal(
        <div
          ref={popupRef}
          style={{ position: 'fixed', top: popupPos.top, bottom: popupPos.bottom, left: popupPos.left }}
          className={`z-50 max-h-[60vh] overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg py-1 ${size === 'sm' ? 'w-[160px]' : 'w-[200px]'}`}
        >
          {values.map((v) => (
            <label
              key={v}
              className={`flex items-center gap-2 text-slate-700 hover:bg-slate-50 cursor-pointer select-none ${size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'}`}
            >
              <input
                type="checkbox"
                checked={chosen.includes(v)}
                onChange={() => onToggle(v)}
                className="accent-primary h-3.5 w-3.5 cursor-pointer"
              />
              {v}
            </label>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
