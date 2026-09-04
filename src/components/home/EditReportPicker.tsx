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
 *  The empty state (before typing) shows a "browse by category" list
 *  instead of nothing — an empty box read as a dead end for anyone who
 *  didn't have the exact name in mind, even though most people never need
 *  it: having something there to fall back on is worth it on its own, the
 *  same way a combobox's own dropdown reassures even when it's rarely
 *  opened. Picking a category goes to that category's own directory (not a
 *  listing) — this modal is a shortcut into a specific business's own
 *  Edit/Report button, not a second copy of the whole category screen, so
 *  browsing by category hands off to the real one instead of rebuilding it
 *  here. */
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

  // The empty-state fallback — same eligibility gate as the search results
  // above (a category with the action disabled shouldn't appear either way).
  const browsableCategories = (categories ?? []).filter((c) => {
    if (c.kind !== 'listing') return false
    const caps = resolveCapabilities(c.capabilities)
    return action === 'edit' ? ui.contributions.edit && caps.edit : ui.contributions.report && caps.report
  })

  function pick(hit: (typeof hits)[number]) {
    navigate('patient', 'find', { findView: hit.item.category, findItemId: hit.item.id, findAction: action })
    onClose()
  }

  function browseCategory(categoryId: string) {
    navigate('patient', 'find', { findView: categoryId })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="presentation"
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-label={copy.title}>
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
            browsableCategories.length === 0 ? (
              <p className="px-1 py-2 text-sm text-muted">Start typing a business name.</p>
            ) : (
              <>
                <p className="px-1 pb-1 text-xs font-medium uppercase tracking-wide text-muted">
                  Or browse by category
                </p>
                {browsableCategories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => browseCategory(c.id)}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-slate-50"
                  >
                    <CategoryIcon
                      icon={c.icon}
                      categoryId={c.id}
                      color={getCategoryColor(categories, c.id)}
                      className="h-8 w-8 text-base shrink-0"
                      sizePx={32}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{c.pluralLabel}</span>
                  </button>
                ))}
              </>
            )
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
    </div>
  )
}
