'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { needsDarkText } from '@/components/Collapsible'

/** One toggleable filter (a category, or the "Hospitals" pseudo-category). */
export type FilterOption = {
  id: string
  label: string
  /** Usually an emoji string; childcare/hotel pass a line-art SVG icon
   *  component instead (see ResourceMapView's `options`), matching the same
   *  icon their map pins use. */
  icon?: ReactNode
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
  // Percent width/offset of the little track thumb below the row. Mirrors the
  // real scrollbar chip-scroll (globals.css) already styles for desktop, but
  // touch browsers hide even a styled scrollbar until you're mid-scroll — so
  // there's nothing hinting more categories exist off to the right until you
  // stumble onto it. This bar is always on screen instead.
  const [thumb, setThumb] = useState<{ widthPct: number; leftPct: number } | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    function update() {
      const { scrollWidth, clientWidth, scrollLeft } = el!
      if (scrollWidth <= clientWidth + 1) {
        setThumb(null) // Everything fits — nothing to scroll, nothing to show.
        return
      }
      const widthPct = (clientWidth / scrollWidth) * 100
      const leftPct = (scrollLeft / (scrollWidth - clientWidth)) * (100 - widthPct)
      setThumb({ widthPct, leftPct })
    }

    update()
    el.addEventListener('scroll', update, { passive: true })
    const resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      resizeObserver.disconnect()
    }
    // Re-measure whenever the chip set itself changes length (filters loading in).
  }, [options.length])

  // Click-or-drag-to-seek — a real scrollbar isn't just a progress readout,
  // it's also a shortcut past however many chips are in the way.
  function seekTo(clientX: number) {
    const track = trackRef.current
    const el = scrollRef.current
    if (!track || !el) return
    const rect = track.getBoundingClientRect()
    const ratio = rect.width > 0 ? Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) : 0
    el.scrollLeft = ratio * (el.scrollWidth - el.clientWidth)
  }

  function onTrackPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    seekTo(e.clientX)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onTrackPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.buttons !== 1) return // only while actively pressed
    seekTo(e.clientX)
  }

  return (
    <div>
      {/* Single horizontal-scroll row (mirrors the directory filter row) so the
          chips — which double as the map's color legend — stay glanceable
          without eating three wrapped rows of vertical space. */}
      <div ref={scrollRef} className="chip-scroll flex flex-nowrap items-center gap-2 overflow-x-auto pb-2.5">
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
              {o.icon && (
                // Same flat monochrome-silhouette treatment as the map's own
                // pin glyphs (see `monoGlyphElement` in ResourceMap.tsx) —
                // `brightness(0)` crushes the emoji to solid black; `invert(1)`
                // flips that to white when the fill needs it. Unselected chips
                // sit on plain white, so the icon is always dark; selected/
                // filled chips carry the category's own color, so it uses the
                // same `needsDarkText` check the pin itself makes for that color.
                <span
                  aria-hidden="true"
                  style={{ filter: on && !needsDarkText(o.color) ? 'brightness(0) invert(1)' : 'brightness(0)' }}
                >
                  {o.icon}
                </span>
              )}
              <span>{o.label}</span>
              <span className={on ? 'text-white/80' : 'text-slate-400'}>{o.count}</span>
            </button>
          )
        })}
      </div>
      {thumb && (
        // A taller invisible hit area around the thin visible bar — easier to
        // grab with a finger than the 4px track alone would be.
        <div
          ref={trackRef}
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          className="-mt-1 mb-1 flex h-3 w-full cursor-pointer touch-none items-center"
        >
          <div className="h-1 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-slate-400"
              style={{ width: `${thumb.widthPct}%`, marginLeft: `${thumb.leftPct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
