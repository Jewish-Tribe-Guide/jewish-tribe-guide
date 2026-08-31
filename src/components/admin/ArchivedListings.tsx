'use client'

import { useCallback, useState } from 'react'
import type { ResourceRow } from '@/types'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'

// The 'archived' tab in /admin: listings soft-deleted by an approved removal
// report (see submissionStore.ts) — hidden from the public site but kept in
// the database, recoverable, until an admin explicitly restores or
// permanently deletes them here. Nothing else in the app surfaces these, so
// without this view they'd just accumulate invisibly forever.

type ArchivedListing = ResourceRow & { categoryLabel: string }

export default function ArchivedListings({ token }: { token: string }) {
  const community = useCommunitySlug()
  const [listings, setListings] = useState<ArchivedListing[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const body = await fetchJson<{ listings: ArchivedListing[] }>(
        withCommunity('/api/admin/archived-listings', community),
        { headers: { Authorization: `Bearer ${token}` } },
        'Failed to load.',
      )
      setListings(body.listings)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])

  useLoadOnMount(load)

  async function restore(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await fetchJson(
        withCommunity(`/api/admin/archived-listings/${id}`, community),
        { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } },
        'Restore failed.',
      )
      setListings((prev) => (prev ? prev.filter((l) => l.id !== id) : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed.')
    } finally {
      setBusyId(null)
    }
  }

  async function permanentlyDelete(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await fetchJson(
        withCommunity(`/api/admin/archived-listings/${id}`, community),
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
        'Delete failed.',
      )
      setListings((prev) => (prev ? prev.filter((l) => l.id !== id) : prev))
      setConfirmDeleteId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <p className="text-sm text-muted mb-4">
        Listings removed via an approved report. They&rsquo;re hidden from the site but kept here,
        recoverable, until you restore or permanently delete them.
      </p>

      {error && (
        <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">{error}</p>
      )}

      {listings === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : listings.length === 0 ? (
        <p className="text-sm text-muted">Nothing archived — no removed listings.</p>
      ) : (
        <div className="space-y-3">
          {listings.map((l) => (
            <div key={l.id} className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-semibold text-slate-900 text-sm">{l.name}</p>
                    <span className="text-xs font-medium bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
                      {l.categoryLabel}
                    </span>
                  </div>
                  {l.address && <p className="text-xs text-slate-500">{l.address}</p>}
                  {l.reviewed_at && (
                    <p className="text-xs text-muted mt-1">
                      Removed {new Date(l.reviewed_at).toLocaleDateString()}
                    </p>
                  )}
                </div>

                {confirmDeleteId !== l.id && (
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => restore(l.id)}
                      disabled={busyId === l.id}
                      className="text-xs font-medium bg-green-600 text-white rounded px-3 py-1.5 hover:bg-green-700 transition-colors disabled:opacity-60 cursor-pointer"
                    >
                      {busyId === l.id ? '…' : 'Restore'}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(l.id)}
                      disabled={busyId === l.id}
                      className="text-xs font-medium border border-slate-300 text-red-600 rounded px-3 py-1.5 hover:bg-red-50 transition-colors disabled:opacity-60 cursor-pointer"
                    >
                      Delete forever
                    </button>
                  </div>
                )}
              </div>

              {confirmDeleteId === l.id && (
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <div className="bg-red-50 border border-red-200 rounded-md p-3 space-y-2">
                    <p className="text-sm text-red-800">
                      Permanently delete <span className="font-semibold">{l.name}</span>? This can&rsquo;t
                      be undone.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => permanentlyDelete(l.id)}
                        disabled={busyId === l.id}
                        className="text-sm font-medium bg-red-600 text-white rounded-md px-3 py-1.5 hover:bg-red-700 transition-colors disabled:opacity-60 cursor-pointer"
                      >
                        {busyId === l.id ? 'Deleting…' : 'Delete forever'}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={busyId === l.id}
                        className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-3 py-1.5 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
