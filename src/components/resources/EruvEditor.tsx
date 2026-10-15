'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { Eruv } from '@/lib/eruv'
import { ERUV_SUGGESTION_FIELDS, eruvChanges, type EruvSuggestionField } from '@/lib/eruvSuggestion'
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

type Values = Record<EruvSuggestionField, string>

export default function EruvEditor({ eruv, onClose, onHasChanges }: {
  eruv: Eruv
  onClose: () => void
  /** Whether anything's been changed and not yet sent, for a host that
   *  asks before something else takes the editor's place (the desktop map). */
  onHasChanges?: (has: boolean) => void
}) {
  const uid = useId()
  const community = useCommunitySlug()
  const [values, setValues] = useState<Values>(() => ({ covers: eruv.covers ?? '', website: eruv.website ?? '', hotline: eruv.hotline ?? '', alertsUrl: eruv.alertsUrl ?? '' }))
  const [honeypot, setHoneypot] = useState('')
  const [token, setToken] = useState('')
  const turnstileRef = useRef<TurnstileHandle>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const changes = eruvChanges(eruv, Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim() || null]))).length
  const hasChanges = !sent && changes > 0
  useEffect(() => {
    onHasChanges?.(hasChanges)
  }, [hasChanges, onHasChanges])
  // In the admin's category Preview, Send files nothing and there's no
  // check to pass (see previewSend.tsx).
  const fetchOrPreview = useFetchOrPreview()
  const turnstileActive = useTurnstileActive()
  const verifying = turnstileActive && !token

  async function send() {
    if (changes === 0 || sending || verifying) return
    setErrors([])
    setSending(true)
    try {
      const res = await fetchOrPreview(withCommunity('/api/submissions', community), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'update', targetType: 'eruv', targetId: eruv.id, payload: values, company: honeypot, turnstileToken: token }),
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
      <Honeypot value={honeypot} onChange={setHoneypot} />
      <p className="px-1 text-[16px] font-extrabold text-slate-900">{eruv.name}</p>
      <Card>
        <div className="space-y-3 py-2">
          {ERUV_SUGGESTION_FIELDS.map((f) => (
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
          ))}
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
        {sendChangesLabel(changes, sending, verifying)}
      </button>
      {changes > 0 && turnstileActive && <TurnstileWidget ref={turnstileRef} onVerify={setToken} />}
    </form>
  )
}
