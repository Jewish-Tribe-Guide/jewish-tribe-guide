'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import type { EnrichedSubmission } from '@/types'
import { useCategories } from '@/lib/useCategories'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import { SubmissionCard } from './SubmissionCard'
import { AdminBack, AdminEmpty } from './AdminUI'
import { useAdminApi } from './useAdminApi'

// Approved and Rejected, the words on To do's buttons and in Reports.
const COPY: Record<'approved' | 'rejected', { title: string; empty: string }> = {
  approved: { title: 'Approved', empty: 'Nothing approved yet.' },
  rejected: { title: 'Rejected', empty: 'Nothing rejected yet.' },
}

// Read-only, most-recently-decided-first view of what happened to
// already-moderated submissions, with who decided and, for one left out,
// why — Reports' History row opens it, so an admin can answer "what did we
// take" or "did I actually leave that out" without going into Supabase.
export default function SubmissionHistory({ token, status }: { token: string; status: 'approved' | 'rejected' }) {
  const community = useCommunitySlug()
  const api = useAdminApi(token)
  const [items, setItems] = useState<EnrichedSubmission[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Fifty at a time (Nov 20): older ones on asking.
  const [more, setMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const categoriesById = new Map(useCategories().map((c) => [c.id, c]))

  const load = useCallback(async () => {
    setError(null)
    setItems(null)
    try {
      const body = await api.get<{ submissions: EnrichedSubmission[]; more?: boolean }>(`/api/admin/submissions?status=${status}`, 'Failed to load.')
      setItems(body.submissions)
      setMore(!!body.more)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [api, status])

  async function older() {
    const last = items?.[items.length - 1]
    if (!last?.reviewed_at) return
    setError(null)
    setLoadingOlder(true)
    try {
      const q = new URLSearchParams({ status, before: last.reviewed_at, beforeId: last.id })
      const body = await api.get<{ submissions: EnrichedSubmission[]; more?: boolean }>(`/api/admin/submissions?${q}`, 'Failed to load.')
      setItems((had) => [...(had ?? []), ...body.submissions])
      setMore(!!body.more)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoadingOlder(false)
    }
  }

  useLoadOnMount(load)

  const copy = COPY[status]

  return (
    <div>
      <AdminBack back={{ label: 'Reports', href: `${adminBase(community)}/metrics` }} title="History" />
      <div role="group" aria-label="Show" className="flex gap-2 my-4">
        {(['approved', 'rejected'] as const).map((s) => (
          <Link
            key={s}
            href={`${adminBase(community)}/history/${s}`}
            aria-current={s === status ? 'page' : undefined}
            className={`inline-flex items-center min-h-9 px-3.5 rounded-full border text-sm font-semibold ${
              s === status ? 'border-primary bg-primary/10 text-primary' : 'border-slate-300 bg-white text-slate-700'
            }`}
          >
            {COPY[s].title}
          </Link>
        ))}
      </div>

      {error && (
        <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">{error}</p>
      )}

      {items === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <AdminEmpty>{copy.empty}</AdminEmpty>
      ) : (
        <div className="space-y-3">
          {items.map((s) => (
            <SubmissionCard key={s.id} submission={s} categoriesById={categoriesById} />
          ))}
          {more && (
            <button
              type="button"
              onClick={older}
              disabled={loadingOlder}
              className="w-full min-h-11 rounded-full border border-slate-300 bg-white text-sm font-semibold text-slate-700 disabled:opacity-60"
            >
              {loadingOlder ? 'Loading…' : 'Show older'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
