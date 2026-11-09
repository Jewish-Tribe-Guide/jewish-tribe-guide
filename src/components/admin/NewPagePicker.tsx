'use client'

import { useMemo, useState } from 'react'
import type { CategoryConfig } from '@/lib/categories'
import { CategoryGlyph } from '@/lib/categoryIcons'
import { useCommunitySlug } from '@/lib/communityContext'
import { matchesSearch, readyMadePages, type ReadyPage } from '@/lib/readyMade'
import { AdminBack, AdminBox, AdminRow, MakeOwnLink, SearchBox } from './AdminUI'
import { useReadyMade } from './useReadyMade'

// "+ New category page" (board 2): every listing page any community has, by
// name with its fields, to start from; one this community already has says
// so and opens it. Make your own starts empty (board 3).

export default function NewPagePicker({
  token,
  own,
  onBack,
  onPick,
  onOpenOwn,
  onMakeOwn,
}: {
  token: string
  /** This community's pages, to say which it already has. */
  own: CategoryConfig[] | null
  onBack: () => void
  onPick: (page: ReadyPage) => void
  onOpenOwn: (id: string) => void
  onMakeOwn: () => void
}) {
  const community = useCommunitySlug()
  const { pages, error } = useReadyMade(token, community)
  const [query, setQuery] = useState('')
  const rows = useMemo(() => (pages && own ? readyMadePages(pages, own, community) : null), [pages, own, community])
  const shown = rows?.filter((r) => matchesSearch({ label: r.pluralLabel, line: r.line }, query))

  return (
    <div className="flex flex-col gap-4 [&>section]:max-w-[760px]">
      <AdminBack back={{ label: 'Category pages', onClick: onBack }} title="What kind of places?" />
      <SearchBox value={query} onChange={setQuery} label="Search pages or fields" />
      {error && <p className="m-0 bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>}
      {!shown ? (
        !error && <p className="text-sm text-muted">Loading…</p>
      ) : (
        shown.length > 0 && (
          <AdminBox>
            {shown.map((r) => (
              <AdminRow
                key={r.id}
                onClick={() => (r.ownId ? onOpenOwn(r.ownId) : onPick(r))}
                icon={<CategoryGlyph categoryId={r.id} icon={r.source.icon ?? ''} className="h-5 w-5" />}
                name={r.pluralLabel}
                line={r.line}
                aside={r.ownId && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">Already a page</span>}
              />
            ))}
          </AdminBox>
        )
      )}
      <MakeOwnLink onClick={onMakeOwn}>Make your own page</MakeOwnLink>
    </div>
  )
}
