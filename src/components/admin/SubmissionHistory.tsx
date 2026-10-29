'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { parseOkJson } from '@/lib/fetchJson'
import type { EnrichedSubmission } from '@/types'
import { useCategories } from '@/lib/useCategories'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import { SubmissionCard } from './SubmissionCard'
import { AdminEmpty } from './AdminUI'

// Taken and Left, the words Reports counts them in.
const COPY: Record<'approved' | 'rejected', { title: string; empty: string }> = {
  approved: { title: 'Taken', empty: 'Nothing taken yet.' },
  rejected: { title: 'Left', empty: 'Nothing left out yet.' },
}

// Read-only, most-recently-decided-first view of what happened to
// already-moderated submissions, with who decided and, for one left out,
// why — Reports' History row opens it, so an admin can answer "what did we
// take" or "did I actually leave that out" without going into Supabase.
export default function SubmissionHistory({ token, status }: { token: string; status: 'approved' | 'rejected' }) {
  const community = useCommunitySlug()
  const [items, setItems] = useState<EnrichedSubmission[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const categoriesById = new Map(useCategories().map((c) => [c.id, c]))

  const load = useCallback(async () => {
    setError(null)
    setItems(null)
    try {
      const res = await fetch(withCommunity(`/api/admin/submissions?status=${status}`, community), {
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await parseOkJson<{ submissions: EnrichedSubmission[] }>(res, 'Failed to load.')
      setItems(body.submissions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, status, community])

  useLoadOnMount(load)

  const copy = COPY[status]

  return (
    <div>
      <Link href={`${adminBase(community)}/metrics`} className="inline-flex items-center min-h-11 -mt-3 text-sm font-semibold text-primary">
        ‹ Reports
      </Link>
      <h2 className="mt-0 mb-3 text-[26px] font-bold text-slate-900">History</h2>
      <div role="group" aria-label="Show" className="flex gap-2 mb-4">
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
        </div>
      )}
    </div>
  )
}
