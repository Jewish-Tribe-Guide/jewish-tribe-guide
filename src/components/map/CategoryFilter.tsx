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

  return (
    // Single horizontal-scroll row (mirrors the directory filter row) so the
    // chips — which double as the map's color legend — stay glanceable without
    // eating three wrapped rows of vertical space.
    <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
      <button
        onClick={allOn ? onNone : onAll}
        className="shrink-0 rounded-full border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
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
          </button>
        )
      })}
    </div>
  )
}
