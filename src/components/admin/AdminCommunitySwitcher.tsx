'use client'

import { useRouter } from 'next/navigation'
import { useActiveCommunity } from '@/lib/communityContext'
import { adminBase } from '@/lib/adminNav'

// ─────────────────────────────────────────────────────────────────────────────
// Which community's admin console this is — a real navigation now (to
// /{slug}/admin), not a cookie: admin/[community]/layout.tsx resolves the
// community from the URL itself, exactly like the public [community] layout
// does. Always lands on that community's moderation queue rather than trying
// to carry the current sub-tab over — an editor open on a category/form id
// that only exists in the OTHER community has nothing sensible to show.
//
// Hides itself below two communities, same rule the public switcher follows,
// so a single-community deployment's admin looks exactly as it did before.
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminCommunitySwitcher() {
  const { community, communities } = useActiveCommunity()
  const router = useRouter()

  if (communities.length <= 1) return null

  return (
    <label className="flex shrink-0 items-center gap-1.5 text-sm text-muted">
      <span className="sr-only">Editing community</span>
      <select
        value={community.slug}
        onChange={(e) => router.push(adminBase(e.target.value))}
        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm font-medium text-slate-700"
      >
        {communities.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  )
}
