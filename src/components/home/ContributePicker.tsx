'use client'

import Link from 'next/link'
import type { CategoryConfig } from '@/lib/categories'
import { resolveCapabilities } from '@/lib/categories'
import { getCategoryColor } from '@/lib/categoryColor'
import { useCategories } from '@/lib/useCategories'
import { useCommunitySlug } from '@/lib/communityContext'
import { routes } from '@/lib/routes'
import { ui } from '@/lib/uiConfig'
import CategoryIcon from '@/components/CategoryIcon'

export type ContributeAction = 'create' | 'edit' | 'report'

const ACTION_COPY: Record<ContributeAction, { title: string; hint: string }> = {
  create: { title: 'Add a listing', hint: 'Which category does it belong in?' },
  edit: { title: 'Edit a listing', hint: "Which category is it in? You'll pick the listing itself on the next screen." },
  report: { title: 'Report a listing', hint: "Which category is it in? You'll pick the listing itself on the next screen." },
}

/** Step two of HomeBreak's Add/Edit/Report picker — step one (which action)
 *  is just three buttons on the card itself, so this only ever needs "which
 *  category". Picking one hands off to a flow that already exists: `create`
 *  deep-links straight into that category's Add form (`?form=create`, see
 *  FindResources' own doc on why that resolves with no listing needed);
 *  `edit`/`report` land on the category's own list, where the visitor finds
 *  the specific listing themselves via that page's existing search/expand —
 *  picking a listing before they've even landed on it would just be a worse
 *  version of the directory's own search, one this picker would have to
 *  rebuild for no real benefit. */
export default function ContributePicker({
  action,
  onClose,
}: {
  action: ContributeAction
  onClose: () => void
}) {
  const categories = useCategories()
  const community = useCommunitySlug()
  const copy = ACTION_COPY[action]

  const eligible = (categories ?? []).filter((c: CategoryConfig) => {
    if (c.kind !== 'listing') return false
    const caps = resolveCapabilities(c.capabilities)
    if (action === 'create') return ui.contributions.add && caps.add
    if (action === 'edit') return ui.contributions.edit && caps.edit
    return ui.contributions.report && caps.report
  })

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
            <p className="mt-1 text-sm text-muted">{copy.hint}</p>
          </div>
          <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600" aria-label="Close">
            &times;
          </button>
        </div>

        {eligible.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Nothing accepts this right now.</p>
        ) : (
          <div className="mt-4 grid max-h-80 grid-cols-2 gap-1 overflow-y-auto">
            {eligible.map((c) => (
              <Link
                key={c.id}
                href={action === 'create' ? `${routes.slug(community, c.id)}?form=create` : routes.slug(community, c.id)}
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
