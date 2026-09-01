'use client'

import { useCallback, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import type { EnrichedSubmission } from '@/types'
import { useCategories } from '@/lib/useCategories'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import { SubmissionCard } from './SubmissionCard'

// The admin's default screen (mounted at /admin itself) — review and
// approve/reject every pending submission: new listings, edits to existing
// ones, removal reports, and brand-new categories suggested from the public
// "Suggest a category" flow.

export default function ModerationQueue({ session }: { session: Session }) {
  const community = useCommunitySlug()
  const [items, setItems] = useState<EnrichedSubmission[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const token = session.access_token
  // Same categories the public site and the category admin editor read —
  // loaded fresh per admin page request (see /admin/layout.tsx's
  // ContentProvider), so a field added a minute ago already has a `label`
  // here without this component needing its own fetch or any per-field code.
  const categoriesById = new Map(useCategories().map((c) => [c.id, c]))

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(withCommunity('/api/admin/submissions', community), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) {
        setError(`Signed in as ${session.user.email}, but this account is not an authorized admin.`)
        setItems([])
        return
      }
      const body = await parseOkJson<{ submissions: EnrichedSubmission[] }>(res, 'Failed to load.')
      setItems(body.submissions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, session.user.email, community])

  useLoadOnMount(load)

  async function moderate(id: string, status: 'approved' | 'rejected', reason?: string) {
    setBusyId(id)
    try {
      await fetchJson(
        withCommunity(`/api/admin/submissions/${id}`, community),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status, ...(reason ? { reason } : {}) }),
        },
        'Failed to update.',
      )
      setItems((prev) => (prev ? prev.filter((s) => s.id !== id) : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      {error && (
        <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">{error}</p>
      )}

      {items === null ? (
        <p className="text-sm text-muted">Loading submissions…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">🎉 Nothing pending — the queue is clear.</p>
      ) : (
        <div className="space-y-3">
          {items.map((s) => (
            <SubmissionCard
              key={s.id}
              submission={s}
              busy={busyId === s.id}
              onModerate={moderate}
              categoriesById={categoriesById}
            />
          ))}
        </div>
      )}
    </div>
  )
}
