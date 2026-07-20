'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getBrowserClient } from '@/lib/supabase/client'
import MagicLinkLogin from '@/components/auth/MagicLinkLogin'
import {
  INBOX_TABS,
  INBOX_TAB_LABELS,
  inboxTabForRequestType,
  type InboxTab,
  type InboxResponse,
} from '@/lib/inbox'
import type { ContactHospitalData } from '@/types'

const inputClass =
  'w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary'

// The inbox: a separate, separately-gated viewer for form response data
// (support requests, volunteer signups/edits/removals, feedback), read from
// the `form_response` table. Deliberately its own route with its own
// magic-link login (INBOX_EMAILS, checked in inboxAuth.ts) — NOT a tab bolted
// onto /admin — so someone with only inbox access never even sees the
// Categories/Site tabs, and someone with only admin access sees none of this.

export default function InboxPage() {
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
    return (
      <Shell>
        <MagicLinkLogin
          requestLinkUrl="/api/inbox/request-link"
          emailLabel="Inbox email"
          sentMessage="allowed to view the inbox"
        />
      </Shell>
    )
  }

  return (
    <Shell>
      <InboxTabs session={session} />
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Inbox</h1>
      <p className="text-sm text-muted mb-6">
        Support requests, volunteer signups, and feedback submitted through the site.
      </p>
      {children}
    </main>
  )
}

// Mirrors AdminNavState in admin/page.tsx — one history entry per tab switch,
// so browser Back walks tabs instead of leaving /inbox.
type InboxNavState = { inboxTab?: InboxTab }

function InboxTabs({ session }: { session: Session }) {
  const [tab, setTab] = useState<InboxTab>('support')
  const [items, setItems] = useState<InboxResponse[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const token = session.access_token

  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      const s = e.state as InboxNavState | null
      setTab(s?.inboxTab ?? 'support')
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // On a full reload the browser keeps the current entry's history.state —
  // restore whichever tab the viewer was on instead of resetting to Support.
  useEffect(() => {
    const s = window.history.state as InboxNavState | null
    if (s?.inboxTab) setTab(s.inboxTab)
  }, [])

  function goToTab(t: InboxTab) {
    setTab(t)
    history.pushState({ inboxTab: t } as InboxNavState, '')
  }

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/inbox', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) {
        setError(`Signed in as ${session.user.email}, but this account isn't allowed to view the inbox.`)
        setItems([])
        return
      }
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.errors?.join(' ') || 'Failed to load.')
      setItems(body.responses as InboxResponse[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, session.user.email])

  useEffect(() => {
    load()
  }, [load])

  async function signOut() {
    await getBrowserClient().auth.signOut()
  }

  function handleUpdated(updated: InboxResponse) {
    setItems((prev) => prev?.map((it) => (it.id === updated.id ? updated : it)) ?? prev)
  }

  function handleDeleted(id: string) {
    setItems((prev) => prev?.filter((it) => it.id !== id) ?? prev)
    setExpandedId((cur) => (cur === id ? null : cur))
  }

  // Group once per render — cheap at this volume, and keeps inboxTabForRequestType
  // (the RequestType → InboxTab mapping) as the single source of truth rather
  // than duplicating it into a query param.
  const grouped: Record<InboxTab, InboxResponse[]> = {
    support: [],
    volunteers: [],
    volunteerChanges: [],
    feedback: [],
  }
  if (items) {
    for (const item of items) grouped[inboxTabForRequestType(item.requestType)].push(item)
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

      <div className="flex gap-1 mb-5 border-b border-slate-200">
        {INBOX_TABS.map((t) => (
          <button
            key={t}
            onClick={() => goToTab(t)}
            className={`text-sm font-medium px-3 py-2 -mb-px border-b-2 transition-colors cursor-pointer ${
              tab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-slate-700'
            }`}
          >
            {INBOX_TAB_LABELS[t]}
            {items && <span className="ml-1.5 text-xs text-muted tabular-nums">{grouped[t].length}</span>}
          </button>
        ))}
      </div>

      {error && (
        <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">{error}</p>
      )}

      {items === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : grouped[tab].length === 0 ? (
        <p className="text-sm text-muted">Nothing here yet.</p>
      ) : (
        <div className="space-y-3">
          {grouped[tab].map((item) => (
            <ResponseCard
              key={item.id}
              item={item}
              token={token}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId((id) => (id === item.id ? null : item.id))}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── One response card ────────────────────────────────────────────────────────

function fmt(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.length ? value.map(String).join(', ') : '—'
  return String(value)
}

// "hospitalRoom" → "Hospital room". Good enough for the ad-hoc keys every
// form's `formData` carries — no per-form label config needed.
function labelize(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim()
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// Drops empty values so a card doesn't show a wall of "—" for whichever
// optional sections (meals/transportation/visiting/…) the visitor didn't fill in.
function nonEmptyEntries(data: Record<string, unknown>): [string, unknown][] {
  return Object.entries(data).filter(([, v]) => {
    if (v === undefined || v === null || v === '') return false
    if (Array.isArray(v)) return v.length > 0
    if (isPlainObject(v)) return nonEmptyEntries(v).length > 0
    return true
  })
}

function ResponseCard({
  item,
  token,
  expanded,
  onToggle,
  onUpdated,
  onDeleted,
}: {
  item: InboxResponse
  token: string
  expanded: boolean
  onToggle: () => void
  onUpdated: (item: InboxResponse) => void
  onDeleted: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draftContact, setDraftContact] = useState<ContactHospitalData>(item.contact)
  const [draftData, setDraftData] = useState<Record<string, unknown>>(item.data)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const created = new Date(item.createdAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  const entries = nonEmptyEntries(item.data)

  function startEdit() {
    setDraftContact(item.contact)
    setDraftData(item.data)
    setError(null)
    setEditing(true)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/inbox/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ contact: draftContact, data: draftData }),
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.errors?.join(' ') || 'Save failed.')
      onUpdated(body.response as InboxResponse)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/inbox/${item.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.errors?.join(' ') || 'Delete failed.')
      onDeleted(item.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
      setDeleting(false)
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
      <button
        onClick={onToggle}
        className="w-full flex items-start justify-between gap-3 p-4 text-left cursor-pointer"
      >
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 text-sm">
            {item.contact.fullName || '(no name given)'}
          </p>
          <p className="text-xs text-muted mt-0.5">
            {created}
            {item.contact.phone && ` · ${item.contact.phone}`}
            {item.contact.email && ` · ${item.contact.email}`}
          </p>
        </div>
        <span className="shrink-0 text-xs font-medium bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
          {item.requestId}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-3">
          {editing ? (
            <>
              <EditableContact contact={draftContact} onChange={setDraftContact} />
              <div className="pt-2 border-t border-slate-100">
                <EditableFields obj={draftData} onChange={setDraftData} />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={save}
                  disabled={saving}
                  className="text-xs font-medium bg-primary text-white rounded px-3 py-1.5 hover:bg-primary/90 transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => { setEditing(false); setError(null) }}
                  disabled={saving}
                  className="text-xs font-medium border border-slate-300 text-slate-600 rounded px-3 py-1.5 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                {item.contact.hospitalId && (
                  <Field label="Hospital / room">
                    {item.contact.hospitalId}
                    {item.contact.unitFloorRoom ? ` — ${item.contact.unitFloorRoom}` : ''}
                  </Field>
                )}
                {item.contact.preferredContact && (
                  <Field label="Preferred contact">{item.contact.preferredContact}</Field>
                )}
                {entries.map(([key, value]) => (
                  <DataField key={key} label={labelize(key)} value={value} />
                ))}
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <button
                  onClick={startEdit}
                  className="text-xs font-medium text-primary hover:underline cursor-pointer"
                >
                  Edit
                </button>
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="text-xs font-medium text-red-600 hover:underline cursor-pointer"
                >
                  Delete
                </button>
              </div>

              {confirmingDelete && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 space-y-2">
                  <p className="text-sm text-red-800">Permanently delete this request? This can’t be undone.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={confirmDelete}
                      disabled={deleting}
                      className="text-sm font-medium bg-red-600 text-white rounded-md px-3 py-1.5 hover:bg-red-700 transition-colors disabled:opacity-60 cursor-pointer"
                    >
                      {deleting ? 'Deleting…' : 'Delete'}
                    </button>
                    <button
                      onClick={() => setConfirmingDelete(false)}
                      disabled={deleting}
                      className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-3 py-1.5 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Editing ───────────────────────────────────────────────────────────────────

function EditableContact({
  contact,
  onChange,
}: {
  contact: ContactHospitalData
  onChange: (c: ContactHospitalData) => void
}) {
  function set<K extends keyof ContactHospitalData>(key: K, value: ContactHospitalData[K]) {
    onChange({ ...contact, [key]: value })
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <TextField label="Full name" value={contact.fullName} onChange={(v) => set('fullName', v)} />
      <TextField label="Phone" value={contact.phone} onChange={(v) => set('phone', v)} />
      <TextField label="Email" value={contact.email} onChange={(v) => set('email', v)} />
      <TextField label="Preferred contact" value={contact.preferredContact} onChange={(v) => set('preferredContact', v)} />
      <TextField label="Hospital" value={contact.hospitalId} onChange={(v) => set('hospitalId', v)} />
      <TextField label="Unit / floor / room" value={contact.unitFloorRoom} onChange={(v) => set('unitFloorRoom', v)} />
    </div>
  )
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="block text-xs text-muted mb-0.5">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    </label>
  )
}

// Editable counterpart to DataField/nonEmptyEntries — one level of nesting,
// same as the read view. Every leaf in a form response's `data` is a string,
// a string[] (rendered as a comma-separated field), or a boolean (checkbox);
// see the Answers type in Wizard.tsx.
function EditableFields({
  obj,
  onChange,
}: {
  obj: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
}) {
  function setField(key: string, value: unknown) {
    onChange({ ...obj, [key]: value })
  }

  return (
    <div className="space-y-2">
      {Object.entries(obj).map(([key, value]) =>
        isPlainObject(value) ? (
          <div key={key} className="text-sm">
            <span className="block text-xs text-muted mb-1">{labelize(key)}</span>
            <div className="ml-3 border-l-2 border-slate-100 pl-3">
              <EditableFields obj={value} onChange={(next) => setField(key, next)} />
            </div>
          </div>
        ) : (
          <EditableLeafField key={key} label={labelize(key)} value={value} onChange={(v) => setField(key, v)} />
        ),
      )}
    </div>
  )
}

function EditableLeafField({
  label,
  value,
  onChange,
}: {
  label: string
  value: unknown
  onChange: (v: unknown) => void
}) {
  if (typeof value === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded border-slate-300"
        />
        {label}
      </label>
    )
  }
  if (Array.isArray(value)) {
    return (
      <label className="block text-sm">
        <span className="block text-xs text-muted mb-0.5">{label} (comma-separated)</span>
        <input
          value={value.map(String).join(', ')}
          onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
          className={inputClass}
        />
      </label>
    )
  }
  return (
    <label className="block text-sm">
      <span className="block text-xs text-muted mb-0.5">{label}</span>
      <input
        value={typeof value === 'string' ? value : String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </label>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="text-sm text-slate-700">
      <span className="text-muted">{label}: </span>
      {children}
    </p>
  )
}

// A form-data value is either scalar/array (render inline) or a nested object
// (a wizard section like "meals"/"transportation" — render its own indented
// sub-list). One level of nesting covers every form shape in the app today;
// a deeper one would just repeat the same rendering recursively.
function DataField({ label, value }: { label: string; value: unknown }) {
  if (isPlainObject(value)) {
    const nested = nonEmptyEntries(value)
    if (nested.length === 0) return null
    return (
      <div className="text-sm text-slate-700">
        <span className="text-muted">{label}:</span>
        <div className="ml-3 mt-0.5 space-y-0.5">
          {nested.map(([k, v]) => (
            <p key={k}>
              <span className="text-muted">{labelize(k)}: </span>
              {isPlainObject(v) ? JSON.stringify(v) : fmt(v)}
            </p>
          ))}
        </div>
      </div>
    )
  }
  return <Field label={label}>{fmt(value)}</Field>
}
