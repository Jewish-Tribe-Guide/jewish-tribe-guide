'use client'

import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import { useFetchOrPreview } from '@/lib/previewSend'
import PrivacyNote from '@/components/PrivacyNote'

const REASONS = ['Permanently closed', 'Duplicate listing', 'Shouldn’t be listed', 'Other'] as const

/** Requesting a listing's removal — opened from the button beside Edit
 *  listing (ListingEditBar) into the listing editor (ListingEditor), which shows it in place of the
 *  edit's own screens, not as an accordion appended below them.
 *
 *  Removal used to be a separate "Report a problem" action in the kebab, which
 *  meant a visitor had to decide up front whether they were fixing a listing
 *  or reporting one. It's the same act — the listing is wrong — so it lives
 *  with the edit now, the way Google Maps and Yelp fold "this place
 *  closed" into their own edit flow rather than a separate destructive action.
 *
 *  It files the same reviewed removal request Report always did (operation
 *  'delete'); nothing is removed until a moderator approves it. Deliberately
 *  worded "Request removal", not "Delete", since it isn't instant.
 *
 *  Built only from type="button" controls, so it can never submit an
 *  enclosing form by accident. It borrows the editor's own Turnstile token,
 *  honeypot and email state (useListingSubmit's) — a visitor either edits or
 *  requests removal, never both, so one single-use token covers whichever
 *  they do. */
export default function RemovalRequest({
  listing,
  turnstileToken,
  canSubmit,
  resetTurnstile,
  honeypot,
  submitterEmail,
  onSubmitterEmailChange,
  onCancel,
  onDone,
  submitSlot,
  submitClassName,
}: {
  listing: { id: string; name: string }
  turnstileToken: string
  /** False while the Turnstile challenge is still pending (when it's active). */
  canSubmit: boolean
  resetTurnstile: () => void
  honeypot: string
  // useListingSubmit's own submitter email — lifted rather than a local
  // copy, so it's the same state an edit sent from the same editor carries.
  submitterEmail: string
  onSubmitterEmailChange: (v: string) => void
  /** Back to the edit — the editor, not this panel, decides what that
   *  means. Omitted, there's
   *  no Cancel button: the listing editor's host has a Back that steps out
   *  of this screen (and Escape, and the phone's back swipe), so a Cancel
   *  beside Confirm would be a second way to do the same thing. */
  onCancel?: () => void
  onDone: () => void
  /** Where the confirm button goes when the host floats it outside the
   *  content — the listing editor's slot under the desktop dialog, the same
   *  place its Send sits. */
  submitSlot?: HTMLElement | null
  /** The confirm button's look, when the host wants it to match its own
   *  submit (the listing editor's Send). */
  submitClassName?: string
}) {
  const uid = useId()
  const community = useCommunitySlug()
  const fetchOrPreview = useFetchOrPreview()
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
      const submittedBy = submitterEmail.trim() ? { email: submitterEmail.trim() } : undefined
      const res = await fetchOrPreview(withCommunity('/api/submissions', community), {
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

  const confirm = (
    <button
      type="button"
      onClick={submit}
      disabled={submitting || !canSubmit}
      className={
        submitClassName ??
        'w-full cursor-pointer rounded-md border border-red-300 bg-white px-4 py-2.5 font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60'
      }
    >
      {submitting ? 'Sending…' : canSubmit ? 'Confirm removal request' : 'Verifying…'}
    </button>
  )

  return (
    // No title here and no card of its own. The panel used to carry both —
    // its own "Request removal of {name}" heading plus an explanatory
    // paragraph — because it was a callout appended BELOW the edit fields
    // and needed to explain and set itself apart from the form above it.
    // Now the dialog's OWN title becomes "Request removal of {name}" (see
    // onRemovalOpenChange, reported to whichever caller embeds this — e.g.
    // ListingDetailModal), so repeating that fact and a bordered box around
    // it here was just saying the same thing twice. No "moderator reviews
    // this" copy either — the editor's Sent screen says that ("An admin
    // checks a removal before anything changes"), and the rest ("this isn't for a wrong address")
    // wasn't worth a permanent line either: Cancel and Confirm are the only
    // two things this screen does, and that's clear on its own.
    <div className="space-y-3">
      {/* One static box for everything this screen actually asks — why,
          optional details, and an optional way to reach the visitor back.
          Email used to sit in its own bare block below this box, but
          stacked three bordered blocks deep (this box, the bare email
          field, then the buttons) it read as visual noise rather than three
          meaningfully different things: email is still part of "what
          you're telling us about this removal," not a separate topic. The
          actions below stay bare. */}
      <div className="space-y-4 rounded-md border border-slate-200 p-4">
        <div>
          <label htmlFor={`${uid}-reason`} className="mb-1 block text-sm font-medium text-slate-700">
            Why should {listing.name} be removed?
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
        {/* A removal request is a bigger claim than a routine edit (a
            moderator may genuinely want to follow up: "are you sure, or did
            it just move?"), so it asks for a way back even though the
            editor's own list doesn't. No name field: there's no account to
            attach one to, and an email alone is enough to follow up. */}
        <div>
          <label htmlFor={`${uid}-email`} className="mb-1 block text-sm font-medium text-slate-700">Your email (optional)</label>
          <input id={`${uid}-email`} type="email" value={submitterEmail} onChange={(e) => onSubmitterEmailChange(e.target.value)} className={inputClass} />
          {/* Directly under the one field it's about, inside the same box,
              not after the buttons — by then the email's already typed. */}
          <PrivacyNote className="mt-2" />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="space-y-2">
        {/* The default look — full width, matching the reason/details
            fields above it, outline rather than solid: the heading already
            says "Request removal of {name}", so the button needn't carry
            that signal itself. The listing editor passes its own Send's
            look instead. */}
        {submitSlot ? createPortal(confirm, submitSlot) : confirm}
        {/* A real bordered secondary button, visible at rest — same
            border/rounded/padded treatment this app already uses for a
            secondary Cancel elsewhere (see CategorySaveConfirmations). A
            hover-only ghost style (no visible edge until the pointer's
            over it) doesn't read as clickable at a glance, and doesn't
            exist at all on touch, where there's no hover to reveal it.
            Still lighter than Confirm (gray, not red) — Cancel isn't a
            comparable alternative here, just "never mind", so it stays
            visually quieter, just not invisible. */}
        {onCancel && (
          <button
            type="button"
            onClick={() => {
              setError(null)
              onCancel()
            }}
            className="w-full cursor-pointer rounded-md border border-slate-300 bg-white py-2.5 font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
