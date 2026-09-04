'use client'

import { useMemo, useState } from 'react'
import { resolveCapabilities } from '@/lib/categories'
import { useCategories } from '@/lib/useCategories'
import { useAllListings } from '@/lib/useAllListings'
import { useSiteNavigation } from '@/lib/useSiteNavigation'
import { ui } from '@/lib/uiConfig'
import CategoryIcon from '@/components/CategoryIcon'
import { getCategoryColor } from '@/lib/categoryColor'
import type { CategoryConfig } from '@/lib/categories'
import type { DirectoryResource } from '@/types'

const COPY = {
  edit: { title: 'Edit a listing', placeholder: 'Search by name…' },
  report: { title: 'Report a listing', placeholder: 'Search by name…' },
}

type Entry = { item: DirectoryResource; category: CategoryConfig; categoryLabel: string }

/** HomeBreak's Edit/Report picker — a direct listing search, not a category
 *  picker (see ContributePicker, which is Add-only now). Editing or
 *  reporting starts from a specific business in mind, not "which bucket is
 *  it filed under" — category-first made visitors do that translation for
 *  no reason.
 *
 *  A plain name-only filter over every eligible listing, not the shared
 *  `searchListings` the homepage's own hero search uses — that one matches
 *  tags/address/detail-field text too (right call for "kosher wine" style
 *  browsing), which here meant typing "house of kosher" surfaced "Di Bruno
 *  Bros" and "Costco" ahead of the actual match: "house" is a substring of
 *  "Rittenhouse" (their address), and "kosher" hits nearly every grocery's
 *  own kosher-certification tag. This is a "find the one business I have in
 *  mind" tool, not a browse-by-anything one, so it only ever matches the
 *  name itself.
 *
 *  Before typing (or once a filter is too broad to be useful on its own),
 *  this shows every eligible listing rather than nothing — an empty box
 *  reads as a dead end even to someone who was always going to type, and
 *  scrolling a real list is what a name search box's own dropdown usually
 *  offers. Each row carries its category *and* address: two "Trader Joe's"
 *  under "Grocery" are otherwise indistinguishable, and address is the one
 *  thing that actually tells them apart. */
export default function EditReportPicker({
  action,
  onClose,
}: {
  action: 'edit' | 'report'
  onClose: () => void
}) {
  const categories = useCategories()
  const listings = useAllListings()
  const { navigate } = useSiteNavigation()
  const [query, setQuery] = useState('')
  const copy = COPY[action]

  const configById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])

  const eligible: Entry[] = useMemo(() => {
    if (!listings || !categories) return []
    const entries: Entry[] = []
    for (const item of listings) {
      const category = configById.get(item.category)
      if (!category) continue
      const caps = resolveCapabilities(category.capabilities)
      const allowed = action === 'edit' ? ui.contributions.edit && caps.edit : ui.contributions.report && caps.report
      if (!allowed) continue
      entries.push({ item, category, categoryLabel: category.pluralLabel })
    }
    return entries.sort((a, b) => a.item.name.localeCompare(b.item.name))
  }, [listings, categories, configById, action])

  const q = query.trim().toLowerCase()
  const hits = q ? eligible.filter((e) => e.item.name.toLowerCase().includes(q)) : eligible

  function pick(entry: Entry) {
    navigate('patient', 'find', { findView: entry.item.category, findItemId: entry.item.id, findAction: action })
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
          {hits.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted">No matches for &ldquo;{query}&rdquo;.</p>
          ) : (
            hits.map((entry) => (
              <button
                key={entry.item.id}
                onClick={() => pick(entry)}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-slate-50"
              >
                <CategoryIcon
                  icon={entry.category.icon}
                  categoryId={entry.category.id}
                  color={getCategoryColor(categories, entry.category.id)}
                  className="h-8 w-8 text-base shrink-0"
                  sizePx={32}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">{entry.item.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {entry.categoryLabel}
                    {entry.item.address ? ` · ${entry.item.address}` : ''}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
