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
              {o.icon && <span aria-hidden="true">{o.icon}</span>}
              <span>{o.label}</span>
              <span className={on ? 'text-white/80' : 'text-slate-400'}>{o.count}</span>
            </button>
          )
        })}
      </div>
      {thumb && (
        <div className="-mt-1.5 mb-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
          <div
            className="h-full rounded-full bg-slate-400"
            style={{ width: `${thumb.widthPct}%`, marginLeft: `${thumb.leftPct}%` }}
          />
        </div>
      )}
    </div>
  )
}
