'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getBrowserClient } from '@/lib/supabase/client'
import type {
  EnrichedSubmission,
  ResourceRow,
  ResourceSubmission,
  CategorySubmissionPayload,
} from '@/types'
import { isStructuredHours, formatHoursSummary } from '@/lib/hours'
import { isMinyanim, TEFILLAH_LABELS } from '@/lib/davening'

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const supabase = getBrowserClient()
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!ready) {
    return <Shell><p className="text-sm text-muted">Loading…</p></Shell>
  }

  if (!session) {
    return <Shell><LoginForm /></Shell>
  }

  return (
    <Shell>
      <ModerationQueue session={session} />
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Resource Moderation</h1>
      <p className="text-sm text-muted mb-6">Review and approve submitted resources.</p>
      {children}
    </main>
  )
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSending(true)
    try {
      const res = await fetch('/api/admin/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.error || 'Could not send the sign-in link.')
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the sign-in link.')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-5">
        <p className="text-sm text-green-800">
          If that email is an authorized admin, a sign-in link is on its way. Open it on this device
          to continue.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm space-y-3">
      <label className="block text-sm font-medium text-slate-700">Admin email</label>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={sending}
        className="bg-primary text-white font-medium px-4 py-2 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-60 cursor-pointer"
      >
        {sending ? 'Sending…' : 'Send magic link'}
      </button>
    </form>
  )
}

const OP_META: Record<EnrichedSubmission['operation'], { label: string; cls: string }> = {
  create: { label: '➕ New listing', cls: 'bg-green-50 text-green-700 border border-green-200' },
  update: { label: '✏️ Edit', cls: 'bg-blue-50 text-blue-700 border border-blue-200' },
  delete: { label: '🗑️ Removal', cls: 'bg-red-50 text-red-700 border border-red-200' },
}

function fmt(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  // Structured hours object → human-readable multi-day summary instead of [object Object].
  if (isStructuredHours(value)) return formatHoursSummary(value)
  // Structured minyanim array → "5 minyanim: Shacharis, Kabbalas Shabbos, Mincha, Maariv"
  if (isMinyanim(value)) {
    const count = value.length
    const tefillot = [...new Set(value.map((m) => TEFILLAH_LABELS[m.tefillah]))]
    return `${count} minyan${count !== 1 ? 'im' : ''}: ${tefillot.join(', ')}`
  }
  if (Array.isArray(value)) return value.join(', ') || '—'
  return String(value)
}

// Flattens a listing (current ResourceRow or proposed payload) into ordered
// label/value pairs for display and diffing.
function flatListing(src: ResourceRow | ResourceSubmission | undefined): Record<string, string> {
  if (!src) return {}
  const details = (src.details ?? {}) as Record<string, unknown>
  const out: Record<string, string> = {
    Name: fmt(src.name),
    Address: fmt(src.address),
    Phone: fmt(src.phone),
  }
  const SKIP = new Set(['legacyId', 'geo', 'placeId', 'googleSyncedAt', 'businessStatus', 'googleDescription'])
  for (const [k, v] of Object.entries(details)) {
    if (SKIP.has(k)) continue
    out[k] = fmt(v)
  }
  return out
}

function ModerationQueue({ session }: { session: Session }) {
  const [items, setItems] = useState<EnrichedSubmission[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const token = session.access_token

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/admin/submissions', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) {
        setError(`Signed in as ${session.user.email}, but this account is not an authorized admin.`)
        setItems([])
        return
      }
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.errors?.join(' ') || 'Failed to load.')
      setItems(body.submissions as EnrichedSubmission[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, session.user.email])

  useEffect(() => {
    load()
  }, [load])

  async function moderate(id: string, status: 'approved' | 'rejected', reason?: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/admin/submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status, ...(reason ? { reason } : {}) }),
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.errors?.join(' ') || 'Failed to update.')
      setItems((prev) => (prev ? prev.filter((s) => s.id !== id) : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusyId(null)
    }
  }

  async function signOut() {
    await getBrowserClient().auth.signOut()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted">
          Signed in as <span className="font-medium text-slate-700">{session.user.email}</span>
        </p>
        <button onClick={signOut} className="text-sm text-muted hover:text-slate-700 underline cursor-pointer">
          Sign out
        </button>
      </div>

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
            <SubmissionCard key={s.id} submission={s} busy={busyId === s.id} onModerate={moderate} />
          ))}
        </div>
      )}
    </div>
  )
}

function SubmissionCard({
  submission: s,
  busy,
  onModerate,
}: {
  submission: EnrichedSubmission
  busy: boolean
  onModerate: (id: string, status: 'approved' | 'rejected', reason?: string) => void
}) {
  const [pendingReject, setPendingReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const isCategory = s.target_type === 'category'
  const op = isCategory
    ? { label: '🆕 New category', cls: 'bg-purple-50 text-purple-700 border border-purple-200' }
    : OP_META[s.operation]
  const categoryLabel = s.categoryLabel ?? ''
  const title = isCategory
    ? (s.payload as CategorySubmissionPayload).label
    : (s.payload as Partial<ResourceSubmission>).name || s.current?.name || '(unknown listing)'

  function handleRejectConfirm() {
    onModerate(s.id, 'rejected', rejectReason.trim() || undefined)
    setPendingReject(false)
    setRejectReason('')
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${op.cls}`}>{op.label}</span>
            {categoryLabel && (
              <span className="text-xs font-medium bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
                {categoryLabel}
              </span>
            )}
            <p className="font-semibold text-slate-900 text-sm">{title}</p>
          </div>

          {isCategory && <CategoryDetails payload={s.payload as CategorySubmissionPayload} />}
          {!isCategory && s.operation === 'create' && (
            <ProposedDetails src={s.payload as ResourceSubmission} />
          )}
          {!isCategory && s.operation === 'update' && (
            <Diff current={s.current} proposed={s.payload as ResourceSubmission} />
          )}
          {!isCategory && s.operation === 'delete' && (
            <div className="text-xs text-slate-600">
              {s.current && <p>{s.current.address}</p>}
              <p className="mt-1 text-red-700">Reported for removal{s.note ? `: "${s.note}"` : '.'}</p>
            </div>
          )}

          {(s.submitted_by?.name || s.submitted_by?.email) && (
            <p className="text-xs text-muted mt-2 italic">
              by {s.submitted_by.name || s.submitted_by.email}
            </p>
          )}

          {/* Two-step reject: reason input appears inline below the details */}
          {pendingReject && (
            <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
              <p className="text-xs font-medium text-slate-700">Reason for rejection (optional — will be included in the email to the submitter)</p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
                placeholder="e.g. This location is already listed, or the address couldn't be verified…"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleRejectConfirm}
                  disabled={busy}
                  className="text-xs font-medium bg-red-600 text-white rounded px-3 py-1.5 hover:bg-red-700 transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {busy ? 'Rejecting…' : 'Confirm rejection'}
                </button>
                <button
                  onClick={() => { setPendingReject(false); setRejectReason('') }}
                  disabled={busy}
                  className="text-xs font-medium border border-slate-300 text-slate-600 rounded px-3 py-1.5 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {!pendingReject && (
          <div className="flex flex-col gap-2 shrink-0">
            <button
              onClick={() => onModerate(s.id, 'approved')}
              disabled={busy}
              className="text-xs font-medium bg-green-600 text-white rounded px-3 py-1.5 hover:bg-green-700 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {busy ? '…' : 'Approve'}
            </button>
            <button
              onClick={() => setPendingReject(true)}
              disabled={busy}
              className="text-xs font-medium border border-slate-300 text-slate-600 rounded px-3 py-1.5 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
            >
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function CategoryDetails({ payload }: { payload: CategorySubmissionPayload }) {
  const f = payload.firstListing
  // Icon / upvotes aren't collected on the suggestion form (a moderator sets
  // those on approval), so they'd always render empty here — omit them.
  const rows: [string, string][] = [
    ['Description', payload.description || '—'],
    ['First listing', f?.name || '—'],
    ['Address', f?.address || '—'],
    ['Phone', f?.phone || '—'],
  ]
  return (
    <dl className="text-xs text-slate-600 space-y-0.5">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <dt className="text-muted w-24 shrink-0">{k}</dt>
          <dd className="text-slate-800">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function ProposedDetails({ src }: { src: ResourceSubmission }) {
  const fields = flatListing(src)
  return (
    <dl className="text-xs text-slate-600 space-y-0.5">
      {Object.entries(fields).map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <dt className="text-muted w-20 shrink-0">{k}</dt>
          <dd className="text-slate-800">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function Diff({ current, proposed }: { current?: ResourceRow | null; proposed: ResourceSubmission }) {
  const before = flatListing(current ?? undefined)
  const after = flatListing(proposed)
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]

  return (
    <dl className="text-xs space-y-0.5">
      {keys.map((k) => {
        const changed = before[k] !== after[k]
        return (
          <div key={k} className="flex gap-2">
            <dt className="text-muted w-20 shrink-0">{k}</dt>
            <dd className={changed ? 'text-slate-800' : 'text-slate-400'}>
              {changed ? (
                <span>
                  <span className="line-through text-red-500">{before[k] ?? '—'}</span>{' '}
                  <span aria-hidden="true">→</span>{' '}
                  <span className="text-green-700 font-medium">{after[k] ?? '—'}</span>
                </span>
              ) : (
                after[k]
              )}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
