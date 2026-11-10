'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { Eruv } from '@/lib/eruv'
import { ERUV_SUGGESTION_FIELDS, eruvChanges, type EruvSuggestionField } from '@/lib/eruvSuggestion'
import type { CategoryConfig, CategoryField } from '@/lib/categories'
import { ownEruvFields, readEruvDetails, withEruvFields } from '@/lib/eruvFields'
import { DetailFieldInput } from './DetailFieldInput'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import Honeypot from '@/components/Honeypot'
import TurnstileWidget, { type TurnstileHandle } from '@/components/TurnstileWidget'
import { useTurnstileActive } from './useListingSubmit'
import { useFetchOrPreview } from '@/lib/previewSend'
import { SUBMIT_PILL } from './submitPill'
import { Card } from './listingParts'
import { EditorSent, editorFieldLabel, editorInputClass, sendChangesLabel } from './editorParts'

// ── Suggest an edit, an eruv (Oct 13) ───────────────────────────────────────
// An eruv has four short things anyone can fix (eruvSuggestion.ts), so they
// sit open together in one box to type into: no cards to open first, as a
// listing's dozen boxes need (ListingEditor). What it shares with that
// editor is the rest: the ‹ Suggest an edit header (EruvListing), Send
// counting the changes, and the same Sent. Its name, status page and map
// are the admin's. It goes to the moderation queue and shows once an admin
// approves it.
//
// Since Nov 9 it follows the Eruv page's Fields (eruvFields.ts): a row
// taken off the page isn't here, and a field an admin made on it is, in
// the page's order. Without the page (Eruv status's Edit), the four rows.
//
// With no eruv (Nov 9), it adds one: the Eruv page's "+". A name first,
// the same rows, and where its status is posted and its map, if they know;
// sent as a new eruv (newEruv.ts), added once an admin approves it.

export type EruvValues = Record<EruvSuggestionField, string>
type Values = EruvValues
type Row = { column: (typeof ERUV_SUGGESTION_FIELDS)[number] } | { own: CategoryField }

export default function EruvEditor({ eruv, page, onClose, onHasChanges, adminSave }: {
  /** Null to add a new one. */
  eruv: Eruv | null
  /** The Eruv page, whose Fields say which rows there are. */
  page?: CategoryConfig | null
  onClose: () => void
  /** Whether anything's been changed and not yet sent, for a host that
   *  asks before something else takes the editor's place (the desktop map). */
  onHasChanges?: (has: boolean) => void
  /** An admin's save straight to the eruv, from Eruv status's Edit (Oct
   *  22): filled with what its website says (`values`), and saved by its
   *  own button ("Save to the listing"). No check, no Sent. `onSave` gives
   *  back what was wrong, or null once it's saved. */
  adminSave?: { label: string; values?: Partial<Values>; onSave: (values: Values) => Promise<string[] | null> }
}) {
  const uid = useId()
  const community = useCommunitySlug()
  const adding = !eruv
  const [values, setValues] = useState<Values>(() => ({ covers: eruv?.covers ?? '', website: eruv?.website ?? '', hotline: eruv?.hotline ?? '', alertsUrl: eruv?.alertsUrl ?? '', ...adminSave?.values }))
  // A new one's own: its name, where its status is posted, its map.
  const [added, setAdded] = useState({ name: '', statusAt: '', map: '' })
  const [honeypot, setHoneypot] = useState('')
  const [token, setToken] = useState('')
  const turnstileRef = useRef<TurnstileHandle>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const [details, setDetails] = useState<Record<string, unknown>>(() => ({ ...eruv?.details }))
  const fields = page ? withEruvFields(page).detailFields : null
  const own = fields ? ownEruvFields(fields) : []
  const rows: Row[] = fields
    ? fields.flatMap((f): Row[] => {
        const column = ERUV_SUGGESTION_FIELDS.find((c) => c.key === f.key)
        return column ? [{ column }] : own.includes(f) ? [{ own: f }] : []
      })
    : ERUV_SUGGESTION_FIELDS.map((column) => ({ column }))
  /** The own fields as they'd be sent: each one's value, or null for none. */
  const sentDetails = Object.fromEntries(own.map((f) => [f.key, readEruvDetails({ [f.key]: details[f.key] })?.[f.key] ?? null]))
  const filled =
    eruvChanges(eruv, {
      ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim() || null])),
      ...(own.length > 0 && { details: sentDetails, detailFields: own }),
    }).length + (adding ? Object.values(added).filter((v) => v.trim()).length : 0)
  // A new one is sent once it has a name; a fix, once it changes something.
  const changes = adding && !added.name.trim() ? 0 : filled
  const hasChanges = !sent && filled > 0
  useEffect(() => {
    onHasChanges?.(hasChanges)
  }, [hasChanges, onHasChanges])
  // In the admin's category Preview, Send files nothing and there's no
  // check to pass (see previewSend.tsx).
  const fetchOrPreview = useFetchOrPreview()
  const turnstileActive = useTurnstileActive() && !adminSave
  const verifying = turnstileActive && !token

  async function send() {
    if (changes === 0 || sending || verifying) return
    setErrors([])
    setSending(true)
    if (adminSave) {
      const wrong = await adminSave.onSave(values).catch(() => ['Could not save that.'])
      setSending(false)
      if (wrong) setErrors(wrong)
      else onClose()
      return
    }
    try {
      const res = await fetchOrPreview(withCommunity('/api/submissions', community), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(eruv ? { operation: 'update', targetId: eruv.id } : { operation: 'create' }),
          targetType: 'eruv',
          payload: { ...values, ...(own.length > 0 && { details: sentDetails }), ...(adding && added) },
          company: honeypot,
          turnstileToken: token,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) {
        if (body.code === 'turnstile') {
          turnstileRef.current?.reset()
          setToken('')
          setErrors(['Verification expired. We’ve refreshed it, so tap Send again.'])
          return
        }
        setErrors(body.errors ?? ['Something went wrong. Please try again.'])
        return
      }
      setSent(true)
    } catch {
      setErrors(['Network error. Please check your connection and try again.'])
    } finally {
      setSending(false)
    }
  }

  const addedInput = (key: keyof typeof added, label: string, inputMode?: 'url') => (
    <div>
      <label htmlFor={`${uid}-${key}`} className={editorFieldLabel}>
        {label}
      </label>
      <input
        id={`${uid}-${key}`}
        type="text"
        inputMode={inputMode}
        autoCapitalize={inputMode ? 'none' : undefined}
        value={added[key]}
        onChange={(e) => setAdded({ ...added, [key]: e.target.value })}
        className={editorInputClass}
      />
    </div>
  )

  if (sent) return <EditorSent message="An admin checks it, usually within a day." onDone={onClose} />

  return (
    <form
      className="space-y-4"
      data-testid="eruv-suggest"
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
    >
      {!adminSave && <Honeypot value={honeypot} onChange={setHoneypot} />}
      {eruv && <p className="px-1 text-[16px] font-extrabold text-slate-900">{eruv.name}</p>}
      <Card>
        <div className="space-y-3 py-2">
          {adding && addedInput('name', 'Name')}
          {rows.map((row) => {
            if ('own' in row) {
              const f = row.own
              return <DetailFieldInput key={f.key} field={f} value={details[f.key]} onChange={(v) => setDetails({ ...details, [f.key]: v })} />
            }
            const f = row.column
            return (
              <div key={f.key}>
                <label htmlFor={`${uid}-${f.key}`} className={editorFieldLabel}>
                  {f.label}
                </label>
                {f.long ? (
                  <textarea id={`${uid}-${f.key}`} value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} rows={3} className={`${editorInputClass} h-auto py-2.5`} />
                ) : (
                  <input
                    id={`${uid}-${f.key}`}
                    // Text, not type="url": the browser would refuse
                    // "centercityeruv.org", which the server takes and adds
                    // https:// to (eruvSuggestion.ts).
                    type="text"
                    inputMode={f.url ? 'url' : f.key === 'hotline' ? 'tel' : undefined}
                    autoCapitalize={f.url ? 'none' : undefined}
                    value={values[f.key]}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    className={editorInputClass}
                  />
                )}
              </div>
            )
          })}
          {adding && addedInput('statusAt', 'Status page or email', 'url')}
          {adding && addedInput('map', 'Map link', 'url')}
        </div>
      </Card>
      {errors.length > 0 && (
        <ul role="alert" className="list-inside list-disc space-y-0.5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errors.map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      )}
      <button type="submit" disabled={changes === 0 || sending || verifying} className={SUBMIT_PILL}>
        {adminSave ? (sending ? 'Saving…' : adminSave.label) : adding ? (sending ? 'Sending…' : !added.name.trim() ? 'Still needed: Name' : verifying ? 'Verifying…' : 'Send') : sendChangesLabel(changes, sending, verifying)}
      </button>
      {changes > 0 && turnstileActive && <TurnstileWidget ref={turnstileRef} onVerify={setToken} />}
    </form>
  )
}
