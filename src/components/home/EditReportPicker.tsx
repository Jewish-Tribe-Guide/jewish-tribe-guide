'use client'

import { useState } from 'react'
import { searchListings } from './sections'
import { resolveCapabilities } from '@/lib/categories'
import { useCategories } from '@/lib/useCategories'
import { useAllListings } from '@/lib/useAllListings'
import { useSiteNavigation } from '@/lib/useSiteNavigation'
import { ui } from '@/lib/uiConfig'
import CategoryIcon from '@/components/CategoryIcon'
import { getCategoryColor } from '@/lib/categoryColor'

const COPY = {
  edit: { title: 'Edit a listing', placeholder: 'Search by name…' },
  report: { title: 'Report a listing', placeholder: 'Search by name…' },
}

/** HomeBreak's Edit/Report picker — a direct listing search, not a category
 *  picker (see ContributePicker, which is Add-only now). Editing or
 *  reporting starts from a specific business in mind, not "which bucket is
 *  it filed under" — category-first made visitors do that translation for
 *  no reason. Reuses the exact search the homepage's own hero search
 *  already does across every category (searchListings, same as Landing's
 *  "Places" results) and the exact deep-link (`findView`/`findItemId`/
 *  `findAction`) a search result's own Edit/Report button already uses —
 *  this is that same one-click path, just reachable without having typed
 *  into the main search box first. Each result shows its category as a
 *  small secondary label — mostly invisible when a name is unambiguous,
 *  useful the moment two listings share a name in different categories.
 *
 *  Renders as a dropdown anchored under the Edit/Report button (HomeBreak
 *  owns the positioning ref, plus the outside-click/Escape close — see its
 *  own doc), not a backdrop modal — see HomeBreak's doc for why that
 *  changed. */
export default function EditReportPicker({
  action,
  coords,
  onClose,
}: {
  action: 'edit' | 'report'
  /** Same coords Landing passes everywhere else — lets results sort by
   *  distance when the visitor has a location, same as the hero search. */
  coords: { lat: number; lng: number } | null
  onClose: () => void
}) {
  const categories = useCategories()
  const listings = useAllListings()
  const { navigate } = useSiteNavigation()
  const [query, setQuery] = useState('')
  const copy = COPY[action]

  const q = query.trim()
  const hits = (q && listings && categories ? searchListings(listings, categories, q, coords) : []).filter((hit) => {
    const caps = resolveCapabilities(hit.category.capabilities)
    return action === 'edit' ? ui.contributions.edit && caps.edit : ui.contributions.report && caps.report
  })

  function pick(hit: (typeof hits)[number]) {
    navigate('patient', 'find', { findView: hit.item.category, findItemId: hit.item.id, findAction: action })
    onClose()
  }

  return (
    <div
      className="absolute left-0 top-full z-30 mt-2 w-full max-w-md rounded-2xl border border-slate-100 bg-white p-5 shadow-xl"
      role="dialog"
      aria-label={copy.title}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{copy.title}</h3>
          <p className="mt-1 text-sm text-muted">Search for it by name.</p>
        </div>
        <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600" aria-label="Close">
          &times;
        </button>
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={copy.placeholder}
        aria-label={copy.placeholder}
        autoFocus
        className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary"
      />

      <div className="mt-3 max-h-72 space-y-0.5 overflow-y-auto">
        {!q ? (
          <p className="px-1 py-2 text-sm text-muted">Start typing a business name.</p>
        ) : hits.length === 0 ? (
          <p className="px-1 py-2 text-sm text-muted">No matches for &ldquo;{query}&rdquo;.</p>
        ) : (
          hits.map((hit) => (
            <button
              key={hit.item.id}
              onClick={() => pick(hit)}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-slate-50"
            >
              <CategoryIcon
                icon={hit.category.icon}
                categoryId={hit.category.id}
                color={getCategoryColor(categories, hit.category.id)}
                className="h-8 w-8 text-base shrink-0"
                sizePx={32}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">{hit.item.name}</span>
                <span className="block truncate text-xs text-muted">{hit.categoryLabel}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
