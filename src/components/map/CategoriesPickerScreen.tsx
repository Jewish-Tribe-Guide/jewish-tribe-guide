'use client'
// The phone's full-screen category picker (split out of ResourceMapView
// Nov 21, no behaviour change). The view keeps its working copy of the
// selection (useMapCategories) and mounts this while it's open.
import { ChevronLeftIcon } from '@/components/icons'
import type { FilterOption } from './CategoryFilter'
import CategoryPickerList from './CategoryPickerList'

/* ── Full-screen category picker (mobile) — the quick chip row's
        trailing "More" chip opens this, same as Google Maps expanding
        its own filter row into a dedicated screen. A checkbox per
        category builds a multi-category browse (top-down full-width
        rows — easier one-handed reach than the chip row's pill
        cluster), and each category with its own filterable fields gets
        a chevron that expands the row in place to reveal them (see
        CategoryPickerList). ────────────────────────────────────────── */
export default function CategoriesPickerScreen({
  closeCategoriesPicker,
  toggleDraftShowAll,
  draftAllOn,
  draftNoneSelected,
  applyCategoriesPicker,
  optionsWithFilters,
  draftSelected,
  toggleCategoryCheckbox,
}: {
  closeCategoriesPicker: () => void
  toggleDraftShowAll: () => void
  draftAllOn: boolean
  draftNoneSelected: boolean
  applyCategoriesPicker: () => void
  optionsWithFilters: FilterOption[]
  draftSelected: Set<string>
  toggleCategoryCheckbox: (id: string) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white desktop:hidden">
      <div
        className="flex shrink-0 items-center gap-3 px-4 pb-3"
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
      >
        {/* Discards the draft untouched — always enabled, since Back
            can never leave the map in an invalid state the way Apply
            could (it just restores whatever was live before the picker
            opened). */}
        <button
          onClick={closeCategoriesPicker}
          aria-label="Back to map"
          // active:bg-slate-200 — mobile-only (this full-screen picker
          // has no desktop equivalent at all — see its own doc above),
          // and a frequent tap with nothing marking the instant it
          // registers before.
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 active:bg-slate-200 cursor-pointer"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <h2 className="flex-1 text-base font-semibold text-slate-900">Categories</h2>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 pb-3">
        <button
          onClick={toggleDraftShowAll}
          className="text-sm font-medium text-primary cursor-pointer"
        >
          {draftAllOn ? 'Deselect all' : 'Show all'}
        </button>
        <button
          onClick={() => !draftNoneSelected && applyCategoriesPicker()}
          disabled={draftNoneSelected}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold text-white ${draftNoneSelected ? 'bg-slate-300 cursor-not-allowed' : 'bg-primary cursor-pointer'}`}
        >
          Apply
        </button>
      </div>
      {draftNoneSelected && (
        <p className="shrink-0 px-4 pb-2 text-xs text-caution">
          Select at least one category to see results.
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <CategoryPickerList options={optionsWithFilters} selected={draftSelected} onToggle={toggleCategoryCheckbox} />
      </div>
    </div>
  )
}
