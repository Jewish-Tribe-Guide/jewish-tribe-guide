'use client'

/** One toggleable filter (a category, or the "Hospitals" pseudo-category). */
export type FilterOption = {
  id: string
  label: string
  icon?: string
  /** The pin color, mirrored on the chip so the legend reads as a legend. */
  color: string
  /** How many points this filter currently contributes. */
  count: number
  /** Active bool/select filter(s) scoped to this category, already formatted
   *  for display (e.g. "Keilim", or "Catering, Keystone-K") — folded right
   *  into the chip instead of showing as a separate row of removable pills
   *  below it, so there's one thing to look at, not two. */
  filterSuffix?: string
}

type Props = {
  options: FilterOption[]
  /** Currently-shown ids. */
  selected: Set<string>
  onToggle: (id: string) => void
  onAll: () => void
  onNone: () => void
  /** When set, only this many category chips render before a trailing
   *  "More" chip that hands off to `onMore` — the compact Google-Maps-style
   *  quick row mobile uses over the map. Omit to show every chip inline
   *  (desktop, and the full picker `onMore` opens). */
  maxVisible?: number
  onMore?: () => void
  /** Wraps chips onto multiple lines instead of a single horizontal-scroll
   *  row — used by the full-screen category picker `onMore` opens, which has
   *  the vertical room a single row over the map doesn't. */
  wrap?: boolean
}

/** The filter bar above the map: a chip per category that doubles as the color
 *  legend, plus "Show all" / "Hide all" shortcuts. A single horizontal-scroll
 *  row (native scrollbar, styled thin via the `chip-scroll` class in
 *  globals.css) rather than wrapping, so it stays compact over the map. */
export default function CategoryFilter({ options, selected, onToggle, onAll, onNone, maxVisible, onMore, wrap }: Props) {
  const allOn = options.every((o) => selected.has(o.id))
  const visible = maxVisible != null ? options.slice(0, maxVisible) : options
  const hiddenCount = maxVisible != null ? Math.max(0, options.length - maxVisible) : 0

  return (
    <div className={wrap ? 'flex flex-wrap items-center gap-1.5' : 'chip-scroll flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1'}>
      <button
        onClick={allOn ? onNone : onAll}
        className="shrink-0 rounded-full border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
      >
        {allOn ? 'Hide all' : 'Show all'}
      </button>
      {visible.map((o) => {
        const on = selected.has(o.id)
        return (
          <button
            key={o.id}
            onClick={() => onToggle(o.id)}
            aria-pressed={on}
            className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
              on
                ? 'border-transparent text-white'
                : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50'
            }`}
            style={on ? { backgroundColor: o.color } : undefined}
          >
            <span
              className="inline-block h-2 w-2 rounded-full ring-1 ring-white/60"
              style={{ backgroundColor: on ? 'rgba(255,255,255,0.9)' : o.color }}
              aria-hidden="true"
            />
            {o.icon && <span aria-hidden="true">{o.icon}</span>}
            <span>{o.label}</span>
            <span className={on ? 'text-white/80' : 'text-slate-400'}>{o.count}</span>
            {o.filterSuffix && (
              <span className={`border-l pl-1 ${on ? 'border-white/30 text-white/90' : 'border-slate-300 text-slate-500'}`}>
                {o.filterSuffix}
              </span>
            )}
          </button>
        )
      })}
      {hiddenCount > 0 && (
        <button
          onClick={onMore}
          className="shrink-0 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
        >
          ⋯ More
        </button>
      )}
    </div>
  )
}
