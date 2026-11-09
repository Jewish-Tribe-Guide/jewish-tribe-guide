'use client'

import { useState } from 'react'
import { fetchJson } from '@/lib/fetchJson'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import type { CategoryConfig } from '@/lib/categories'

// "Delete this page" at the foot of a category page (board 4), and the step
// it opens: what goes with it, then Delete it / Keep it. The Eruv's says how
// many eruvim and website watches go too, so it counts them first.

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export default function DeletePage({ token, category, onDeleted }: { token: string; category: CategoryConfig; onDeleted: () => void }) {
  const community = useCommunitySlug()
  const [asking, setAsking] = useState(false)
  const [counts, setCounts] = useState<{ eruvim: number; watches: number } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const eruv = category.kind === 'eruv'
  const url = withCommunity(`/api/admin/categories/${category.id}`, community)

  async function ask() {
    setError(null)
    setAsking(true)
    if (!eruv) return
    try {
      const c = await fetchJson<{ eruvim: number; watches: number }>(
        withCommunity(`/api/admin/categories/${category.id}?dry=1`, community),
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
        'Couldn’t count its eruvim.',
      )
      setCounts({ eruvim: c.eruvim, watches: c.watches })
    } catch (err) {
      setAsking(false)
      setError(err instanceof Error ? err.message : 'Couldn’t count its eruvim.')
    }
  }

  async function remove() {
    setError(null)
    setDeleting(true)
    try {
      await fetchJson(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }, 'Delete failed.')
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
      setDeleting(false)
    }
  }

  const name = category.pluralLabel
  return (
    <div className="flex flex-col gap-3">
      {!asking && (
        <button type="button" onClick={() => void ask()} className="self-start min-h-11 px-1 text-[15px] font-semibold text-red-700 hover:underline cursor-pointer">
          Delete this page
        </button>
      )}
      {asking && (
        <section aria-label="Delete this page" className="flex flex-col gap-3 rounded-[10px] border border-red-200 bg-red-50 p-4">
          <p className="m-0 text-[15px] text-red-900">
            {!eruv
              ? `Delete ${name} and every place on it?`
              : counts
                ? `Delete ${name}, its ${plural(counts.eruvim, 'eruv', 'eruvim')} and ${plural(counts.watches, 'website watch', 'website watches')}?`
                : 'Counting its eruvim…'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void remove()}
              disabled={deleting || (eruv && !counts)}
              className="min-h-11 px-4 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60 cursor-pointer"
            >
              {deleting ? 'Deleting…' : 'Delete it'}
            </button>
            <button
              type="button"
              onClick={() => setAsking(false)}
              disabled={deleting}
              className="min-h-11 px-4 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
            >
              Keep it
            </button>
          </div>
        </section>
      )}
      {error && <p className="m-0 text-sm text-red-700">{error}</p>}
    </div>
  )
}
