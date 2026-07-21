'use client'

import { useEffect, useRef, useState } from 'react'

/** One toggleable filter (a category, or the "Hospitals" pseudo-category). */
export type FilterOption = {
  id: string
  label: string
  icon?: string
  /** The pin color, mirrored on the chip so the legend reads as a legend. */
  color: string
  /** How many points this filter currently contributes. */
  count: number
}

type Props = {
  options: FilterOption[]
  /** Currently-shown ids. */
  selected: Set<string>
  onToggle: (id: string) => void
  onAll: () => void
  onNone: () => void
}

/** The filter bar above the map: a chip per category that doubles as the color
 *  legend, plus "Show all" / "Hide all" shortcuts. */
export default function CategoryFilter({ options, selected, onToggle, onAll, onNone }: Props) {
  const allOn = options.every((o) => selected.has(o.id))
  const scrollRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  // Thumb geometry as a fraction of the track (0–1). null while there's
  // nothing to scroll, so the track renders empty instead of a full-width bar.
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null)
  // px-per-px conversion between dragging the thumb and scrolling the row,
  // and the pointer's starting position — recomputed on every drag start so
  // it stays correct if the row's content changes size mid-drag.
  const dragState = useRef<{ startX: number; startScrollLeft: number; pxPerPx: number } | null>(null)

  // Native scrollbars are hidden (see .chip-scroll in globals.css — macOS's
  // overlay scrollbars auto-hide on trackpads and don't reliably render even
  // when styled), so this row draws its own always-visible scroll indicator
  // instead, kept in sync with real scroll position/extent.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const update = () => {
      const { scrollWidth, clientWidth, scrollLeft } = el
      if (scrollWidth <= clientWidth + 1) {
        setThumb(null)
        return
      }
      setThumb({
        left: scrollLeft / scrollWidth,
        width: clientWidth / scrollWidth,
      })
    }

    update()
    el.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [options])

  // Dragging the indicator scrolls the row — a click elsewhere on the track
  // jumps straight there, like a normal scrollbar.
  function handleTrackPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const scrollEl = scrollRef.current
    const trackEl = trackRef.current
    if (!scrollEl || !trackEl || !thumb) return

    const trackWidth = trackEl.clientWidth
    const thumbWidthPx = thumb.width * trackWidth
    const scrollableRange = scrollEl.scrollWidth - scrollEl.clientWidth
    const trackRange = Math.max(trackWidth - thumbWidthPx, 1)
    const pxPerPx = scrollableRange / trackRange

    const rect = trackEl.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const onThumb = clickX >= thumb.left * trackWidth && clickX <= (thumb.left + thumb.width) * trackWidth
    if (!onThumb) {
      const targetLeftPx = clickX - thumbWidthPx / 2
      scrollEl.scrollLeft = Math.max(0, Math.min(scrollableRange, targetLeftPx * pxPerPx))
    }

    dragState.current = { startX: e.clientX, startScrollLeft: scrollEl.scrollLeft, pxPerPx }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleTrackPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const state = dragState.current
    const scrollEl = scrollRef.current
    if (!state || !scrollEl) return
    const scrollableRange = scrollEl.scrollWidth - scrollEl.clientWidth
    const dx = e.clientX - state.startX
    scrollEl.scrollLeft = Math.max(0, Math.min(scrollableRange, state.startScrollLeft + dx * state.pxPerPx))
  }

  function handleTrackPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragState.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return (
    <div>
      {/* Single horizontal-scroll row (mirrors the directory filter row) so the
          chips — which double as the map's color legend — stay glanceable
          without eating three wrapped rows of vertical space. */}
      <div ref={scrollRef} className="chip-scroll flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={allOn ? onNone : onAll}
          className="shrink-0 rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
        >
          {allOn ? 'Hide all' : 'Show all'}
        </button>
        {options.map((o) => {
          const on = selected.has(o.id)
          return (
            <button
              key={o.id}
              onClick={() => onToggle(o.id)}
              aria-pressed={on}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                on
                  ? 'border-transparent text-white'
                  : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50'
              }`}
              style={on ? { backgroundColor: o.color } : undefined}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-white/60"
                style={{ backgroundColor: on ? 'rgba(255,255,255,0.9)' : o.color }}
                aria-hidden="true"
              />
              {o.icon && <span aria-hidden="true">{o.icon}</span>}
              <span>{o.label}</span>
              <span className={on ? 'text-white/80' : 'text-slate-400'}>{o.count}</span>
            </button>
          )
        })}
      </div>
      {/* Custom scroll indicator — desktop only (see .chip-scroll-track).
          Wrapped in a taller, invisible hit area (padding offset by a
          matching negative margin) so it's easy to grab without changing the
          bar's visual thickness. */}
      {thumb && (
        <div
          className="chip-scroll-track -my-1.5 cursor-pointer touch-none py-1.5 select-none"
          onPointerDown={handleTrackPointerDown}
          onPointerMove={handleTrackPointerMove}
          onPointerUp={handleTrackPointerUp}
          onPointerCancel={handleTrackPointerUp}
        >
          <div ref={trackRef} className="mt-1 h-1 rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-slate-300 hover:bg-slate-400"
              style={{ marginLeft: `${thumb.left * 100}%`, width: `${thumb.width * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
