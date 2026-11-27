'use client'

import { useEffect, useState } from 'react'
import type { AdminApi } from '@/lib/adminApi'

// Posts sent with the "+ Add" box that the AI's read couldn't file whole
// (Nov 27, docs/add-rethink.md): which of two places it means, a menu to
// read, a question, or a read that failed. Each as it was sent, with what
// was left and why; the admin deals with it by hand (Edit listing, Add),
// then Done. What the read did file is in To do as ordinary suggestions.
// On To do's list, above the places, only when there are any. Not drawn:
// today's card look, the original first.

export type SentPost = { id: string; text: string; photoUrls: string[]; left: string[]; createdAt: string }

export default function SentPosts({ api }: { api: AdminApi }) {
  const [posts, setPosts] = useState<SentPost[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    api
      .get<{ posts: SentPost[] }>('/api/admin/sent-posts')
      .then((b) => !cancelled && setPosts(b.posts))
      // To do works without it: a failure here shows nothing.
      .catch(() => !cancelled && setPosts([]))
    return () => {
      cancelled = true
    }
  }, [api])

  if (!posts || posts.length === 0) return null
  const done = async (id: string) => {
    setBusy(id)
    setError(null)
    try {
      await api.post('/api/admin/sent-posts', { id }, 'That didn’t save. Please try again.')
      setPosts((ps) => (ps ?? []).filter((p) => p.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save. Please try again.')
    } finally {
      setBusy(null)
    }
  }
  return (
    <section data-testid="sent-posts" className="mb-5">
      <h2 className="m-0 mb-2 text-[0.78125rem] font-extrabold uppercase tracking-[0.06em] text-slate-500">Posts to sort by hand</h2>
      <div className="space-y-3">
        {posts.map((p) => (
          <div key={p.id} className="bg-white border border-slate-200 rounded-lg shadow-sm p-4" data-testid="sent-post">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200 rounded-full px-2 py-0.5">Read by AI</span>
              <span className="text-xs text-slate-500">{new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
            {p.text && <p className="mt-2 whitespace-pre-wrap text-[0.9375rem] text-slate-900">{p.text}</p>}
            {p.photoUrls.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {p.photoUrls.map((u, i) => (
                  <a key={u} href={u} target="_blank" rel="noreferrer" className="text-[0.875rem] font-semibold text-primary hover:underline">
                    {/\.pdf$/i.test(u) ? `PDF ${i + 1}` : `Photo ${i + 1}`}
                  </a>
                ))}
              </div>
            )}
            <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-[0.875rem] text-slate-700" data-testid="sent-post-left">
              {p.left.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
            <button
              type="button"
              disabled={busy === p.id}
              onClick={() => void done(p.id)}
              className="mt-3 h-10 cursor-pointer rounded-full bg-primary px-5 text-[0.9375rem] font-bold text-white hover:bg-primary-dark disabled:opacity-60"
            >
              Done
            </button>
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  )
}
