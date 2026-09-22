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
 *  borrows the form's own Turnstile token, honeypot and email — a visitor
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
  submitterEmail,
  onSubmitterEmailChange,
  onCancel,
  onDone,
}: {
  listing: { id: string; name: string }
  turnstileToken: string
  /** False while the Turnstile challenge is still pending (when it's active). */
  canSubmit: boolean
  resetTurnstile: () => void
  honeypot: string
  // Same state ListingForm's own "Your email" field uses — lifted rather
  // than a local copy, so switching back and forth between this panel and
  // the edit fields never loses what was typed on either screen, and a
  // removal request carries whichever email the visitor actually left,
  // wherever they left it.
  submitterEmail: string
  onSubmitterEmailChange: (v: string) => void
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
      const submittedBy = submitterEmail.trim() ? { email: submitterEmail.trim() } : undefined
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
    // No title here and no card of its own. The panel used to carry both —
    // its own "Request removal of {name}" heading plus an explanatory
    // paragraph — because it was a callout appended BELOW the edit fields
    // and needed to explain and set itself apart from the form above it.
    // Now the dialog's OWN title becomes "Request removal of {name}" (see
    // onRemovalOpenChange, reported to whichever caller embeds this — e.g.
    // ListingDetailModal), so repeating that fact and a bordered box around
    // it here was just saying the same thing twice. No "moderator reviews
    // this" copy either — ListingForm's own blue banner already says that
    // for every screen, and the rest ("this isn't for a wrong address")
    // wasn't worth a permanent line either: Cancel and Confirm are the only
    // two things this screen does, and that's clear on its own.
    <div className="space-y-3">
      {/* One static box for everything this screen actually asks — why,
          optional details, and an optional way to reach the visitor back —
          the same visual language as ListingForm's own field groups
          (Basics, an audience/formSection section), just without a collapse
          control since there's only ever this one. Email used to sit in its
          own bare block below this box (matching ListingForm's OWN "a box
          means a field group" rule, where its submitter field stays bare
          outside every field-group box) — but on this one screen, stacked
          three bordered blocks deep (this box, the bare email field, then
          the full-width buttons) read as visual noise rather than three
          meaningfully different things, since email is still part of "what
          you're telling us about this removal," not a separate topic the
          way it's genuinely optional context on the longer edit form.
          Folding it in here is a deliberate one-screen exception, not a
          reversal of that rule. The actions below still stay bare, matching
          ListingForm's own Submit/Request removal. */}
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
        {/* Same field as ListingForm's own "Your email", not a separate ask
            — a removal request is a bigger claim than a routine edit (a
            moderator may genuinely want to follow up: "are you sure, or did
            it just move?"), and unlike the edit fields, this panel used to
            be the one place in the form with no way to leave one at all —
            that input lives in the block this panel replaces, not inside
            it. No name field, here or on the edit screen — see
            ListingForm's own comment on why. */}
        <div>
          <label htmlFor={`${uid}-email`} className="mb-1 block text-sm font-medium text-slate-700">Your email (optional)</label>
          <input id={`${uid}-email`} type="email" value={submitterEmail} onChange={(e) => onSubmitterEmailChange(e.target.value)} className={inputClass} />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="space-y-2">
        {/* Full width, matching the reason/details fields above it and
            ListingForm's own Submit/Request removal buttons — outline, not
            solid: the strong red cue belongs on the PREVIOUS screen, where
            Request removal sits beside Submit and has to read as "the other
            option" at a glance; by the time someone is on this screen, the
            heading above already says "Request removal of {name}", so the
            button no longer needs to carry that signal itself. No text-sm —
            same ambient (larger) size as Submit/Request removal on the
            previous screen; this used to render visibly smaller than both. */}
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !canSubmit}
          className="w-full cursor-pointer rounded-md border border-red-300 bg-white px-4 py-2.5 font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Sending…' : canSubmit ? 'Confirm removal request' : 'Verifying…'}
        </button>
        {/* A real bordered secondary button, visible at rest — same
            border/rounded/padded treatment this app already uses for a
            secondary Cancel elsewhere (see CategorySaveConfirmations). A
            hover-only ghost style (no visible edge until the pointer's over
            it) doesn't read as clickable at a glance, and doesn't exist at
            all on touch, where there's no hover to reveal it. Still lighter
            than Confirm (gray, not red) — unlike Submit/Request removal on
            the previous screen (two real, comparably weighted
            destinations), Cancel isn't a comparable alternative here, just
            "never mind", so it stays visually quieter, just not invisible. */}
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
      </div>
    </div>
  )
}
