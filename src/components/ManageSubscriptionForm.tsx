'use client'

import { useState } from 'react'
import type { CategoryConfig } from '@/lib/categories'
import type { Subscriber } from '@/lib/subscriberStore'

// The save action behind /subscribers/manage — see that page's own doc for
// why it's a plain top-level route. Unlike SubscribeSection's public signup
// form (which only ever merges/widens an existing subscription), submitting
// here REPLACES exactly what's checked, including narrowing — this is the
// one place a visitor can actually remove a category or turn a notify kind
// off without unsubscribing from everything. "Unsubscribe from everything"
// sits at the bottom as the other real option, reusing the same plain GET
// link every notification's footer already carries — one page covers both
// "change what I get" and "make it stop" instead of splitting them across
// two separate links a visitor has to tell apart.
export default function ManageSubscriptionForm({
  token,
  subscriber,
  categories,
}: {
  token: string
  subscriber: Subscriber
  categories: CategoryConfig[]
}) {
  const [allCategories, setAllCategories] = useState(subscriber.categories === null)
  const [selected, setSelected] = useState<string[]>(subscriber.categories ?? [])
  const [notifyAdd, setNotifyAdd] = useState(subscriber.notifyAdd)
  const [notifyClosure, setNotifyClosure] = useState(subscriber.notifyClosure)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function toggleCategory(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    if (!notifyAdd && !notifyClosure) {
      setError('Pick at least one thing to be notified about.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/subscribers/manage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          categories: allCategories ? null : selected,
          notifyAdd,
          notifyClosure,
        }),
      })
      const body = await res.json()
      if (!res.ok || !body.ok) {
        setError((body.errors ?? ['Something went wrong.']).join(' '))
        return
      }
      setSaved(true)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={allCategories} onChange={(e) => setAllCategories(e.target.checked)} />
          All categories
        </label>
        {!allCategories && (
          <div className="mt-2 grid max-h-40 grid-cols-2 gap-x-4 gap-y-1.5 overflow-y-auto rounded-lg border border-slate-100 p-3">
            {categories.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleCategory(c.id)} />
                <span className="truncate">{c.pluralLabel}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={notifyAdd} onChange={(e) => setNotifyAdd(e.target.checked)} />
          New listings
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={notifyClosure} onChange={(e) => setNotifyClosure(e.target.checked)} />
          Closures
        </label>
      </div>

      {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {saved && <p className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">Saved.</p>}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60"
      >
        {submitting ? 'Saving…' : 'Save'}
      </button>

      <div className="border-t border-slate-100 pt-4">
        <a
          href={`/api/subscribers/unsubscribe?token=${encodeURIComponent(token)}`}
          className="text-sm text-muted underline hover:text-slate-700"
        >
          Unsubscribe from everything
        </a>
      </div>
    </form>
  )
}
