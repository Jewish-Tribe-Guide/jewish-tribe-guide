'use client'

import { useId, useRef, useState } from 'react'
import type { Eruv } from '@/lib/eruv'
import { ERUV_SUGGESTION_FIELDS, eruvChanges, type EruvSuggestionField } from '@/lib/eruvSuggestion'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import PrivacyNote from '@/components/PrivacyNote'
import Honeypot from '@/components/Honeypot'
import TurnstileWidget, { type TurnstileHandle } from '@/components/TurnstileWidget'
import { TURNSTILE_ACTIVE } from './useListingSubmit'
import { Card } from './listingParts'

// ── Suggest an edit to an eruv's listing (Oct 13) ───────────────────────────
// The listing's own rows, filled in as they are, to fix and send: where it
// goes, its site, its hotline, its email alerts (eruvSuggestion.ts). It goes
// to the moderation queue, as a listing's edit does, and shows once an admin
// approves it. Its name, status page and map are the admin's.

const inputClass = 'w-full rounded-md border border-slate-300 px-3 py-2 text-[15px] text-slate-900 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary'

export default function EruvSuggestEdit({ eruv, onClose }: { eruv: Eruv; onClose: () => void }) {
  const uid = useId()
  const community = useCommunitySlug()
  const [values, setValues] = useState<Record<EruvSuggestionField, string>>(() => ({
    covers: eruv.covers ?? '',
    website: eruv.website ?? '',
    hotline: eruv.hotline ?? '',
    alertsUrl: eruv.alertsUrl ?? '',
  }))
  const [email, setEmail] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [token, setToken] = useState('')
  const turnstileRef = useRef<TurnstileHandle>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changed = eruvChanges(eruv, Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim() || null]))).length > 0

  async function send() {
    setError(null)
    setSending(true)
    try {
      const res = await fetch(withCommunity('/api/submissions', community), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'update',
          targetType: 'eruv',
          targetId: eruv.id,
          payload: values,
          submittedBy: email.trim() ? { email: email.trim() } : undefined,
          company: honeypot,
          turnstileToken: token,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) {
        if (body.code === 'turnstile') {
          turnstileRef.current?.reset()
          setToken('')
          setError('Verification expired. We’ve refreshed it, so tap Send again.')
          return
        }
        setError((body.errors ?? ['Something went wrong. Please try again.']).join(' '))
        return
      }
      setSent(true)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="space-y-3.5" data-testid="eruv-suggest-sent">
        <Card>
          <div className="py-2">
            <p className="text-[16px] font-bold text-slate-900">Thank you</p>
            <p className="mt-1 text-[15px] leading-snug text-slate-700">An admin will check it, and it shows once they approve it.</p>
          </div>
        </Card>
        <button type="button" onClick={onClose} className="h-12 w-full cursor-pointer rounded-full border border-slate-300 bg-white text-[15px] font-semibold text-slate-900">
          Done
        </button>
      </div>
    )
  }

  return (
    <form
      className="space-y-3.5"
      data-testid="eruv-suggest"
      onSubmit={(e) => {
        e.preventDefault()
        if (changed && !sending) void send()
      }}
    >
      <div>
        <h2 className="text-[22px] font-extrabold leading-tight tracking-tight text-slate-900">{eruv.name}</h2>
        <p className="mt-1 text-[14.5px] leading-snug text-muted">Suggest an edit</p>
      </div>
      <Card>
        <div className="space-y-3 py-2">
          {ERUV_SUGGESTION_FIELDS.map((f) => (
            <div key={f.key}>
              <label htmlFor={`${uid}-${f.key}`} className="mb-1 block text-sm font-semibold text-slate-700">
                {f.label}
              </label>
              {f.long ? (
                <textarea id={`${uid}-${f.key}`} value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} rows={3} className={inputClass} />
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
                  className={inputClass}
                />
              )}
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <div className="py-2">
          <label htmlFor={`${uid}-email`} className="mb-1 block text-sm font-semibold text-slate-700">
            Your email (optional)
          </label>
          <input id={`${uid}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          <PrivacyNote className="mt-2" />
        </div>
      </Card>
      <Honeypot value={honeypot} onChange={setHoneypot} />
      {changed && <TurnstileWidget ref={turnstileRef} onVerify={setToken} />}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="h-12 flex-1 cursor-pointer rounded-full border border-slate-300 bg-white text-[15px] font-semibold text-slate-900">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!changed || sending || (TURNSTILE_ACTIVE && !token)}
          className="h-12 flex-1 cursor-pointer rounded-full bg-primary text-[15px] font-semibold text-white shadow-lg disabled:cursor-default disabled:opacity-40"
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  )
}
