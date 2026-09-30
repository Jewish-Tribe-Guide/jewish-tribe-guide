'use client'

import type { FilterOption } from './CategoryFilter'
import { CategoryGlyph } from '@/lib/categoryIcons'

type Props = {
  /** Already sorted (highest count first) by the caller, each count what
   *  the category's filters leave. */
  options: FilterOption[]
  selected: Set<string>
  onToggle: (id: string) => void
}

/**
 * The full-screen "More" picker's list — one full-width row per category
 * instead of the compact chip row's pill cluster, top-down for easier
 * one-handed mobile reach. The checkbox toggles a category in/out of the
 * current multi-category browse.
 *
 * Choosing categories only. Each category's own filters (Kosher Cert,
 * Denomination, Open now…) live in the map's Filters sheet, one section per
 * category showing, the category pages' own format (agreed Sep 30); these
 * rows used to expand to hold them too.
 */
export default function CategoryPickerList({ options, selected, onToggle }: Props) {
  return (
    <div className="divide-y divide-slate-100">
      {options.map((o) => (
        <label key={o.id} className="flex cursor-pointer items-center gap-3 py-2.5">
          <input
            type="checkbox"
            checked={selected.has(o.id)}
            onChange={() => onToggle(o.id)}
            aria-label={`Show ${o.label}`}
            className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300 accent-primary"
          />
          <span className="flex flex-1 items-center gap-2.5 py-1.5">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/5" style={{ backgroundColor: o.color }} aria-hidden="true" />
            {o.icon && <CategoryGlyph categoryId={o.id} icon={o.icon} className="h-5 w-5 shrink-0" />}
            <span className="flex-1 text-[15px] font-medium text-slate-900">{o.label}</span>
            <span className="text-sm text-slate-400">{o.count}</span>
          </span>
        </label>
      ))}
    </div>
  )
}
