'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { CategoryConfig } from '@/lib/categories'
import { resolveCapabilities } from '@/lib/categories'
import { getCategoryColor } from '@/lib/categoryColor'
import { useCategories } from '@/lib/useCategories'
import { useCommunitySlug } from '@/lib/communityContext'
import { routes } from '@/lib/routes'
import { ui } from '@/lib/uiConfig'
import CategoryIcon from '@/components/CategoryIcon'

/** Add step of HomeBreak's Add/Edit/Report picker — Edit/Report skip this
 *  entirely now (see EditReportPicker: those search for the listing itself,
 *  category shown only as a disambiguator) since a category-first step made
 *  someone translate "which business" into "which bucket" for no reason.
 *  Add still needs one, though — there's no existing listing to search for,
 *  so "which category" is the real first question. A search field instead
 *  of a plain grid: filtering scales better than a grid that just gets
 *  taller as more categories are added, while keeping each result's icon
 *  for fast recognition rather than falling back to a plain text list.
 *  Picking a category deep-links straight into that category's Add form
 *  (`?form=create` — see FindResources' own doc on why that resolves with
 *  no listing needed). */
export default function ContributePicker({ onClose }: { onClose: () => void }) {
  const categories = useCategories()
  const community = useCommunitySlug()
  const [query, setQuery] = useState('')

  const eligible = (categories ?? []).filter((c: CategoryConfig) => {
    if (c.kind !== 'listing') return false
    const caps = resolveCapabilities(c.capabilities)
    return ui.contributions.add && caps.add
  })
  const q = query.trim().toLowerCase()
  const filtered = q ? eligible.filter((c) => c.pluralLabel.toLowerCase().includes(q)) : eligible

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="presentation"
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-label="Add a listing">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Add a listing</h3>
            <p className="mt-1 text-sm text-muted">Which category does it belong in?</p>
          </div>
          <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600" aria-label="Close">
            &times;
          </button>
        </div>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search categories…"
          aria-label="Search categories"
          autoFocus
          className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary"
        />

        {eligible.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Nothing accepts this right now.</p>
        ) : filtered.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No categories match &ldquo;{query}&rdquo;.</p>
        ) : (
          <div className="mt-3 grid max-h-72 grid-cols-2 gap-1 overflow-y-auto">
            {filtered.map((c) => (
              <Link
                key={c.id}
                href={`${routes.slug(community, c.id)}?form=create`}
                onClick={onClose}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-slate-50"
              >
                <CategoryIcon
                  icon={c.icon}
                  categoryId={c.id}
                  color={getCategoryColor(categories, c.id)}
                  className="h-8 w-8 text-base shrink-0"
                  sizePx={32}
                />
                <span className="min-w-0 truncate text-sm font-medium text-slate-800">{c.pluralLabel}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
