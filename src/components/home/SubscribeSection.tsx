'use client'

import { useEffect, useRef, useState } from 'react'
import type { CategoryConfig } from '@/lib/categories'
import { useCategories } from '@/lib/useCategories'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import Honeypot from '@/components/Honeypot'

// ── "Stay in the loop" signup — desktop only, right after the map ──────────
// The home screen ends at the map with nothing after it but the footer; this
// puts that space to use. A visitor gives an email, picks which categories
// they care about (or leaves "All categories" checked), and opts into new
// listings and/or closures for those — deliberately not edits, which felt
// excessive for what this is meant to be.
//
// Desktop only for now — mobile stays as it is; this can come to mobile
// later if a good spot for it turns up there, but the goal for mobile is to
// stay simple rather than add another section.
//
// Instant, per-event email (see src/app/api/admin/submissions/[id]/route.ts's
// post-approval hook and subscriberEmail.ts) — no digest/cron, so this is
// the entire signup surface; nothing else to configure after submitting
// besides the unsubscribe link every notification carries.
export default function SubscribeSection() {
  const categories = useCategories()
  const community = useCommunitySlug()
  const [email, setEmail] = useState('')
  const [allCategories, setAllCategories] = useState(true)
  const [selected, setSelected] = useState<string[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [notifyAdd, setNotifyAdd] = useState(true)
  const [notifyClosure, setNotifyClosure] = useState(true)
  const [honeypot, setHoneypot] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const eligible = (categories ?? []).filter((c: CategoryConfig) => c.kind === 'listing')

  // Closes on Escape or a click/tap outside the picker — same pattern as
  // HomeBreak's Add/Edit/Report dropdown (see that component's own doc).
  // Needed here specifically because the picker used to have no independent
  // "closed" state at all: the only way to collapse the category list was
  // re-checking "All categories", which meant tidying the list away also
  // silently threw out whatever specific categories you'd just picked.
  useEffect(() => {
    if (!pickerOpen) return
    function onDown(e: PointerEvent) {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setPickerOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [pickerOpen])

  if (eligible.length === 0) return null

  // Unchecking the last remaining specific category falls back to "All
  // categories" instead of leaving the picker at zero — nobody actually
  // wants to be subscribed to nothing, and re-checking "All categories" by
  // hand for the same result was just an extra step for the one outcome
  // this could otherwise land on.
  function toggleCategory(id: string) {
    setSelected((prev) => {
      const next = prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
      setAllCategories(next.length === 0)
      return next
    })
  }

  function chooseAllCategories() {
    setAllCategories(true)
    setSelected([])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!notifyAdd && !notifyClosure) {
      setError('Pick at least one thing to be notified about.')
      return
    }
    // Shouldn't be reachable through the UI any more — toggleCategory falls
    // back to "All categories" itself the moment the last specific pick is
    // unchecked — but kept as a safety net rather than trusting that no
    // future change to that logic can reintroduce a zero-category submit.
    if (!allCategories && selected.length === 0) {
      setError('Pick at least one category, or choose "All categories".')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(withCommunity('/api/subscribers', community), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          categories: allCategories ? null : selected,
          notifyAdd,
          notifyClosure,
          company: honeypot,
        }),
      })
      const body = await res.json()
      if (!res.ok || !body.ok) {
        setError((body.errors ?? ['Something went wrong.']).join(' '))
        return
      }
      setDone(true)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="mt-14">
      <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-900/5">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Stay in the loop</h2>

        {done ? (
          <p className="text-sm text-muted">
            You&apos;re subscribed. We&apos;ll email you when something you picked changes — every email
            has an unsubscribe link.
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted">
              Get an email when a new listing is added, or one closes, in the categories you pick.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Honeypot value={honeypot} onChange={setHoneypot} />

              {/* Email + Subscribe on one row — the box is wide enough that
                  stacking them (and the checkboxes below) left most of it
                  empty; a row uses the width the card actually has instead
                  of reading as an under-filled narrow column inside it. */}
              <div className="flex max-w-xl gap-3">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  aria-label="Email address"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="shrink-0 cursor-pointer rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60"
                >
                  {submitting ? 'Subscribing…' : 'Subscribe'}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                {/* The category picker — a dropdown, not an inline checkbox
                    list, specifically so it has its own open/closed state
                    independent of what's actually selected (see the
                    pickerOpen effect's own doc). The button's own label
                    doubles as the current-selection summary, the same way a
                    filter chip in a real filter UI would ("All categories"
                    vs "3 checked") — closing it never has to mean "and
                    reset to all" the way it used to. */}
                <div ref={pickerRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setPickerOpen((o) => !o)}
                    aria-expanded={pickerOpen}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-primary text-[10px] text-white"
                    >
                      ✓
                    </span>
                    {allCategories ? 'All categories' : `${selected.length} checked`}
                    <span aria-hidden="true" className="text-slate-400">
                      {pickerOpen ? '▲' : '▼'}
                    </span>
                  </button>

                  {pickerOpen && (
                    <div
                      role="dialog"
                      aria-label="Choose categories"
                      className="absolute left-0 top-full z-30 mt-2 w-72 rounded-2xl border border-slate-100 bg-white p-3 shadow-xl"
                    >
                      <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                        <input type="checkbox" checked={allCategories} onChange={chooseAllCategories} />
                        All categories
                      </label>
                      <div className="mt-1 grid max-h-48 grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto border-t border-slate-100 pt-2">
                        {eligible.map((c) => (
                          <label key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-slate-700 hover:bg-slate-50">
                            <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleCategory(c.id)} />
                            <span className="truncate">{c.pluralLabel}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={notifyAdd} onChange={(e) => setNotifyAdd(e.target.checked)} />
                  New listings
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={notifyClosure} onChange={(e) => setNotifyClosure(e.target.checked)} />
                  Closures
                </label>
              </div>

              {error && (
                <p className="max-w-xl rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
              )}
            </form>
          </>
        )}
      </div>
    </section>
  )
}
