'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { parseOkJson } from '@/lib/fetchJson'
import type { EnrichedSubmission } from '@/types'
import { useCategories } from '@/lib/useCategories'
import { SubmissionCard } from './SubmissionCard'

const COPY: Record<'approved' | 'rejected', { title: string; empty: string }> = {
  approved: { title: 'Approved submissions', empty: 'Nothing has been approved yet.' },
  rejected: { title: 'Rejected submissions', empty: 'Nothing has been rejected yet.' },
}

// Read-only, most-recently-decided-first view of what happened to
// already-moderated submissions — the Metrics tab's Approved/Rejected tiles
// link here so an admin can answer "what did we approve" or "did I actually
// reject that" without going into Supabase directly.
export default function SubmissionHistory({ token, status }: { token: string; status: 'approved' | 'rejected' }) {
  const [items, setItems] = useState<EnrichedSubmission[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const categoriesById = new Map(useCategories().map((c) => [c.id, c]))

  const load = useCallback(async () => {
    setError(null)
    setItems(null)
    try {
      const res = await fetch(`/api/admin/submissions?status=${status}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await parseOkJson<{ submissions: EnrichedSubmission[] }>(res, 'Failed to load.')
      setItems(body.submissions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, status])

  useLoadOnMount(load)

  const copy = COPY[status]

  return (
    <div>
      <p className="text-sm text-muted mb-4">{copy.title}, most recently decided first.</p>

      {error && (
        <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">{error}</p>
      )}

      {items === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">{copy.empty}</p>
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
