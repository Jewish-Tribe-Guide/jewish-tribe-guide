'use client'

import { useRef, useState } from 'react'
import type { DirectoryResource, ResourceSubmission } from '@/types'
import type { TurnstileHandle } from '@/components/TurnstileWidget'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'

// Whether the Turnstile challenge is actually active for this deploy — mirrors
// TurnstileWidget's own check. When it's not configured, the widget renders
// nothing and never calls back with a token, so submission can't be gated on
// having one.
export const TURNSTILE_ACTIVE = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

type Options = {
  mode: 'create' | 'edit'
  existing?: DirectoryResource
  /** See ListingForm's own prop of the same name. */
  sharedTurnstile?: { token: string; reset: () => void }
  /** See ListingForm's own prop of the same name. */
  adminSubmit?: { token: string }
  /** Admin mode only: the listing is already live, so there's no "Thank you,
   *  it's being reviewed" screen to show — this runs instead. */
  onAdminSubmitted?: () => void
}

/**
 * Sending a listing: the anti-abuse layer (Turnstile, honeypot), the
 * optional contact email, the POST itself, its error handling and retries,
 * and the done state afterwards. Shared by ListingForm (Add) and
 * ListingEditor (Edit) so both treat a refused or expired submission the
 * same way. What gets sent comes from useListingDraft.
 */
export function useListingSubmit({ mode, existing, sharedTurnstile, adminSubmit, onAdminSubmitted }: Options) {
  const community = useCommunitySlug()
  const [submitterEmail, setSubmitterEmail] = useState('')
  // Honeypot — stays empty for humans; bots that auto-fill it get dropped server-side.
  const [honeypot, setHoneypot] = useState('')
  const [ownTurnstileToken, setOwnTurnstileToken] = useState('')
  const ownTurnstileRef = useRef<TurnstileHandle>(null)
  const turnstileToken = sharedTurnstile ? sharedTurnstile.token : ownTurnstileToken
  const resetTurnstile = () => {
    if (sharedTurnstile) sharedTurnstile.reset()
    else {
      ownTurnstileRef.current?.reset()
      setOwnTurnstileToken('')
    }
  }
  /** Whether Submit can go: never before a Turnstile token is in hand (when
   *  Turnstile is configured), or a visitor who fills the form faster than
   *  the background challenge completes submits an empty token and gets
   *  rejected for no visible reason. An admin submission has no challenge. */
  const verifying = !adminSubmit && TURNSTILE_ACTIVE && !turnstileToken

  // Whether we've already refreshed the challenge once for this form. A second
  // failure means retrying is not the answer, so stop telling the visitor it is
  // — see submit.
  const [retriedVerification, setRetriedVerification] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [done, setDone] = useState(false)
  // What was submitted, for the confirmation copy: an edit and a removal
  // request get different thank-yous.
  const [doneKind, setDoneKind] = useState<'submission' | 'removal'>('submission')

  function markRemovalDone() {
    setDoneKind('removal')
    setDone(true)
  }

  async function submit(payload: ResourceSubmission) {
    const submittedBy = submitterEmail.trim() ? { email: submitterEmail.trim() } : undefined

    setSubmitting(true)
    try {
      const res = adminSubmit
        ? await fetch(withCommunity('/api/admin/listings', community), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminSubmit.token}` },
            body: JSON.stringify({ payload }),
          })
        : await fetch(withCommunity('/api/submissions', community), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              operation: mode === 'edit' ? 'update' : 'create',
              targetType: 'listing',
              targetId: mode === 'edit' ? existing?.id : undefined,
              payload,
              submittedBy,
              company: honeypot,
              turnstileToken,
            }),
          })
      const body = await res.json()
      if (!res.ok || !body.ok) {
        // Turnstile tokens are single-use and expire after ~5 min — on a form
        // with this many fields (especially editing, reviewing everything
        // already filled in) it's easy to take longer than that before
        // hitting Submit. The server's own message says to refresh the page,
        // which would lose everything just filled in — so re-run the challenge
        // for a fresh token instead and let a second tap on Submit work.
        //
        // Gated on `code`, not on the 403 alone. This route answers 403 for
        // several unrelated refusals — a contribution type disabled site-wide,
        // a category with edits turned off — and treating those as an expired
        // challenge produced an endless "we've refreshed it, tap Submit again"
        // that no amount of tapping could clear, while hiding the real reason
        // the server gave. Not reachable in admin mode — there's no Turnstile
        // challenge to expire — but the check is harmless either way since
        // /api/admin/listings never returns this code.
        if (body.code === 'turnstile') {
          // And only offer the retry once. If a fresh token fails too, the
          // problem isn't staleness, and repeating the same hopeful message is
          // exactly the loop this is meant to end.
          if (retriedVerification) {
            setErrors([
              'Verification keeps failing. Please reload the page and try again — your details will need re-entering, sorry.',
            ])
            return
          }
          resetTurnstile()
          setRetriedVerification(true)
          setErrors(['Verification expired. We’ve refreshed it — please tap Submit again.'])
          return
        }
        // Any other outcome clears the flag: it means "the attempt just before
        // this one ended in a challenge refresh", so a genuine expiry twenty
        // minutes and several edits later still gets its own free retry.
        setRetriedVerification(false)
        setErrors(body.errors ?? ['Something went wrong. Please try again.'])
        return
      }
      setRetriedVerification(false)
      // Admin mode: the listing is already live — nothing to review, so skip
      // the "Thank you!" pending screen and just close back out.
      if (adminSubmit) onAdminSubmitted?.()
      else setDone(true)
    } catch {
      setRetriedVerification(false)
      setErrors(['Network error. Please check your connection and try again.'])
    } finally {
      setSubmitting(false)
    }
  }

  return {
    submitterEmail,
    setSubmitterEmail,
    honeypot,
    setHoneypot,
    turnstileToken,
    ownTurnstileRef,
    setOwnTurnstileToken,
    resetTurnstile,
    verifying,
    submitting,
    errors,
    setErrors,
    done,
    doneKind,
    markRemovalDone,
    submit,
  }
}
