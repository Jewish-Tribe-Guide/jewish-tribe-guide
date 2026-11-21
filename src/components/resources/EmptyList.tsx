import { PlusIcon } from '@/components/icons'

// A category page with nothing to list: why, and the ways on (moved out of
// GenericDirectory whole).
export default function EmptyList({
  hiddenByFilters,
  typed,
  searchMatches,
  hasActiveFilters,
  pluralLabel,
  label,
  canAdd,
  clearFilters,
  clearAll,
  onAdd,
}: {
  hiddenByFilters: boolean
  typed: boolean
  searchMatches: number
  hasActiveFilters: boolean
  pluralLabel: string
  label: string
  canAdd: boolean
  clearFilters: () => void
  clearAll: () => void
  onAdd: () => void
}) {
  return (
    <div className="text-center py-12">
      <p className="text-sm text-muted">
        {hiddenByFilters
          ? typed
            ? `${searchMatches} match your search, but none with these filters.`
            : 'None with these filters.'
          : hasActiveFilters
            ? `No ${pluralLabel.toLowerCase()} match your search.`
            : `No ${pluralLabel.toLowerCase()} listed yet.`}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {hasActiveFilters && (
          <button
            onClick={hiddenByFilters ? clearFilters : clearAll}
            className="text-sm font-medium text-slate-600 border border-slate-300 rounded-md px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            {hiddenByFilters ? 'Clear filters' : 'Clear search & filters'}
          </button>
        )}
        {canAdd && (
          // The same box as the "+": adding looks the same however it
          // starts (Oct 5).
          <button
            onClick={onAdd}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary border border-primary rounded-md px-3 py-1.5 hover:bg-primary hover:text-white transition-colors cursor-pointer"
          >
            <PlusIcon className="h-4 w-4" /> Add {label.toLowerCase()}
          </button>
        )}
      </div>
    </div>
  )
}
