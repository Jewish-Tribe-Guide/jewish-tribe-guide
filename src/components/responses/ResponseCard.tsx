'use client'

import { useState } from 'react'
import type { ContactHospitalData } from '@/types'
import type { InboxResponse } from '@/lib/inbox'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'

// Shared response card — expandable, editable, deletable — used by both
// /inbox (hospital-facing: support/volunteer/volunteer changes) and /admin's
// Responses tab (Feedback + custom admin-created forms). `apiBase` points
// each consumer at its own auth boundary: /api/inbox (INBOX_EMAILS) or
// /api/admin/responses (SUPERADMIN_EMAILS) — same shape, different allowlist.

export const inputClass =
  'w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary'

export function fmt(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.length ? value.map(String).join(', ') : '—'
  return String(value)
}

// "hospitalRoom" → "Hospital room". Good enough for the ad-hoc keys every
// form's `formData` carries — no per-form label config needed.
export function labelize(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim()
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// Drops empty values so a card doesn't show a wall of "—" for whichever
// optional sections (meals/transportation/visiting/…) the visitor didn't fill in.
export function nonEmptyEntries(data: Record<string, unknown>): [string, unknown][] {
  return Object.entries(data).filter(([, v]) => {
    if (v === undefined || v === null || v === '') return false
    if (Array.isArray(v)) return v.length > 0
    if (isPlainObject(v)) return nonEmptyEntries(v).length > 0
    return true
  })
}

export default function ResponseCard({
  item,
  token,
  apiBase,
  community,
  expanded,
  onToggle,
  onUpdated,
  onDeleted,
}: {
  item: InboxResponse
  token: string
  /** e.g. '/api/inbox' or '/api/admin/responses' — PATCH/DELETE go to `${apiBase}/${item.id}`. */
  apiBase: string
  /** Sent as `?community=` on PATCH/DELETE — admin's own auth check is
   *  per-community (see adminAuth.ts's getAdminUserForCommunity), so it has
   *  to know which community it's authorizing against. Omitted by /inbox,
   *  which has no per-community split (see formResponseStore.ts's own note). */
  community?: string
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
      const body = await fetchJson<{ response: InboxResponse }>(
        community ? withCommunity(`${apiBase}/${item.id}`, community) : `${apiBase}/${item.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ contact: draftContact, data: draftData }),
        },
        'Save failed.',
      )
      onUpdated(body.response)
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
      await fetchJson(
        community ? withCommunity(`${apiBase}/${item.id}`, community) : `${apiBase}/${item.id}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
        'Delete failed.',
      )
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
