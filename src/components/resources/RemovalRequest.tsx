'use client'

import { useId, useState } from 'react'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'

const REASONS = ['Permanently closed', 'Duplicate listing', 'Shouldn’t be listed', 'Other'] as const

/** Requesting a listing's removal — the edit form's other real option,
 *  reached via ListingForm's own "Request removal" button (see that
 *  component's own doc for the button itself and why it's a full swap, not
 *  an accordion appended below the fields).
 *
 *  Removal used to be a separate "Report a problem" action in the kebab, which
 *  meant a visitor had to decide up front whether they were fixing a listing
 *  or reporting one. It's the same act — the listing is wrong — so it lives
 *  inside the edit form now, the way Google Maps and Yelp fold "this place
 *  closed" into their own edit flow rather than a separate destructive action.
 *
 *  It files the same reviewed removal request Report always did (operation
 *  'delete'); nothing is removed until a moderator approves it. Deliberately
 *  worded "Request removal", not "Delete", since it isn't instant.
 *
 *  Rendered inside ListingForm's <form> but built only from type="button"
 *  controls, so it never nests a form or submits the edit by accident. It
 *  borrows the form's own Turnstile token, honeypot and name/email — a visitor
 *  either edits or requests removal, never both, so one single-use token
 *  covers whichever they do. ListingForm keeps this mounted (toggling
 *  visibility, not presence) whether or not it's showing, so a reason already
 *  typed survives switching back to the fields and returning. */
export default function RemovalRequest({
  listing,
  turnstileToken,
  canSubmit,
  resetTurnstile,
  honeypot,
  submittedBy,
  onCancel,
  onDone,
}: {
  listing: { id: string; name: string }
  turnstileToken: string
  /** False while the Turnstile challenge is still pending (when it's active). */
  canSubmit: boolean
  resetTurnstile: () => void
  honeypot: string
  submittedBy?: { name?: string; email?: string }
  /** Back to the edit fields — the form itself, not this panel, decides
   *  whether that means unmounting or just hiding it again. */
  onCancel: () => void
  onDone: () => void
}) {
  const uid = useId()
  const community = useCommunitySlug()
  const [reason, setReason] = useState<(typeof REASONS)[number]>(REASONS[0])
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retried, setRetried] = useState(false)

  async function submit() {
    setError(null)
    setSubmitting(true)
    try {
      const note = details.trim() ? `${reason}: ${details.trim()}` : reason
      const res = await fetch(withCommunity('/api/submissions', community), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'delete',
          targetType: 'listing',
          targetId: listing.id,
          note,
          submittedBy,
          company: honeypot,
          turnstileToken,
        }),
      })
      const body = await res.json()
      if (!res.ok || !body.ok) {
        // Same single-use-token handling as the edit submit: an expired
        // challenge is refreshed once; a second failure isn't staleness.
        if (body.code === 'turnstile') {
          if (retried) {
            setError('Verification keeps failing. Please reload the page and try again.')
            return
          }
          resetTurnstile()
          setRetried(true)
          setError('Verification expired. We’ve refreshed it — please tap Request removal again.')
          return
        }
        setRetried(false)
        setError((body.errors ?? ['Something went wrong. Please try again.']).join(' '))
        return
      }
      onDone()
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary'

  return (
    // No card of its own — a bordered/shaded box here made sense when this
    // was a small callout appended BELOW the edit fields and needed to set
    // itself apart from the form above it. Now it's the entire content of
    // the swapped-in view, already sitting inside the dialog's own bordered
    // card, so a second box nested inside that one was just framing around
    // framing. No top divider either (tried one, dropped it): this panel is
    // the first VISIBLE thing in the swap — Turnstile is the only sibling
    // rendered above it, and when it's unconfigured (e.g. local dev) that
    // divider became a stray line with nothing above it to separate from.
    <div role="group" aria-labelledby={`${uid}-title`} className="space-y-3">
      <p id={`${uid}-title`} className="text-sm font-medium text-slate-800">
        Request removal of {listing.name}
      </p>
      <p className="text-sm text-muted">
        A moderator reviews every request before anything changes. If it just moved or has wrong
        info, fix it in the fields above instead.
      </p>
      <div>
        <label htmlFor={`${uid}-reason`} className="mb-1 block text-sm font-medium text-slate-700">
          Why should it be removed?
        </label>
        <select id={`${uid}-reason`} value={reason} onChange={(e) => setReason(e.target.value as (typeof REASONS)[number])} className={inputClass}>
          {REASONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${uid}-details`} className="mb-1 block text-sm font-medium text-slate-700">
          Details (optional)
        </label>
        <textarea
          id={`${uid}-details`}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={2}
          placeholder="e.g. Closed in August, the space is now a bank."
          className={inputClass}
        />
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        {/* Outline, not solid, here — the reverse of ListingForm's trigger
            button. The strong red cue belongs on the PREVIOUS screen, where
            Request removal sits beside Submit and has to read as "the other
            option" at a glance; by the time someone is on this screen, the
            heading above already says "Request removal of {name}", so the
            button no longer needs to carry that signal itself. */}
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !canSubmit}
          className="cursor-pointer rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Sending…' : canSubmit ? 'Confirm removal request' : 'Verifying…'}
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null)
            onCancel()
          }}
          className="cursor-pointer text-sm text-slate-500 hover:text-slate-800"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
