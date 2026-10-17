'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Honeypot from './Honeypot'
import TurnstileWidget, { type TurnstileHandle } from './TurnstileWidget'
import { submitRequest } from '@/lib/submitRequest'
import PrivacyNote from '@/components/PrivacyNote'
import type { ContactHospitalData } from '@/types'
import { useCommunitySlug } from '@/lib/communityContext'
import { PAGE_TITLE_DESKTOP } from '@/lib/pageColumn'

type Props = {
  heading: string
  successMessage: string
  /** 'modal' (default) renders the fixed-backdrop dialog used by FeedbackButton
   *  and HeaderNav; 'inline' renders the same content in a white card, for
   *  embedding as a full page (the /feedback screen). */
  variant?: 'modal' | 'inline'
  /** Required for 'modal' (backdrop tap / ✕ / success "Close"); unused inline. */
  onClose?: () => void
  /** Inline only: keep the heading for screen readers but don't show it — for
   *  when the screen's header already names the page ("‹ Feedback"), so the
   *  same title doesn't sit twice in a row. */
  headingHidden?: boolean
}

export default function FeedbackForm({ heading, successMessage, variant = 'modal', onClose, headingHidden = false }: Props) {
  const community = useCommunitySlug()
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')
  const turnstileRef = useRef<TurnstileHandle>(null)

  // `createPortal(..., document.body)` below can't run during SSR, where
  // `document` doesn't exist. Today the modal only ever opens behind a click
  // (FeedbackButton, HeaderNav's "More"), but the /feedback page used to
  // render it on page load, and a server render that reaches it would crash.
  // `mounted` delays the portal to after this component is actually running
  // in the browser; before that the modal variant renders nothing.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
    // Arrived from a search that found nothing (AskTheGroup's "Add it to
    // the guide"): the question is already written in, so someone who knows
    // the answer only has to add where. Read here rather than with
    // useSearchParams, which would take this prerendered page dynamic.
    const about = new URLSearchParams(window.location.search).get('about')?.trim()
    if (about) setMessage((m) => m || `“${about}” isn’t in the guide. You can find it at: `)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return
    setStatus('submitting')
    setError('')
    try {
      const contact: ContactHospitalData = {
        fullName: '',
        phone: '',
        email: email.trim(),
        preferredContact: 'email',
        hospitalId: '',
        unitFloorRoom: '',
      }
      await submitRequest(community, 'Feedback', contact, { message: message.trim() }, honeypot, turnstileToken)
      setStatus('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setStatus('error')
    }
  }

  // Clears the form back to a blank slate — used by the inline variant's
  // "Send another message" (the modal variant just closes instead, since
  // reopening it already starts fresh). Turnstile tokens are single-use, so
  // the widget needs an explicit reset too, not just a cleared token.
  const resetForm = () => {
    setMessage('')
    setEmail('')
    setTurnstileToken('')
    setError('')
    setStatus('idle')
    turnstileRef.current?.reset()
  }

  // Escape closes the modal variant, as it does every other dialog in the app.
  useEffect(() => {
    if (variant !== 'modal' || !onClose) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [variant, onClose])

  // The dialog's title is a section under the page; the inline variant IS the
  // page (FeedbackScreen), so its heading is the page's h1.
  const Heading = variant === 'modal' ? 'h2' : 'h1'

  const wrap = (children: React.ReactNode) => {
    if (variant !== 'modal') {
      // The page's own <main> sets the gutter and the width (PAGE_COLUMN,
      // shared with About/Privacy), so the card just fills it — it used to
      // add a second px-4 of its own and stop at 448px. On a desktop it's the
      // pages' card too: the same corners and padding as PageDocument's.
      return (
        <div className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm desktop:rounded-lg desktop:p-10">{children}</div>
      )
    }
    // No `document` to portal into during SSR (see `mounted`'s own
    // comment) — render nothing until this is actually running in the
    // browser.
    if (!mounted) return null

    // Portaled to <body> — opened from HeaderNav's "More" menu, which
    // lives inside SiteHeader, and that header carries `backdrop-blur`.
    // A backdrop-filter (like a transform) establishes a containing
    // block for `position: fixed` descendants, so `fixed inset-0` here
    // was sizing itself to the ~65px header instead of the viewport: the
    // backdrop dimmed only a strip at the top of the screen, and the
    // card rendered inside that strip, cut off, with the rest of the
    // page untouched below it. CommunitySwitcher hit the identical bug
    // for the identical reason (see its own doc) — same fix here.
    //
    // overflow-y-auto on this element, not a max-h + its own scroll on
    // the card below (tried first) — the form (message, email,
    // Turnstile widget, submit, privacy note) can be taller than a
    // short browser window, and a `vh`-based cap on a nested scrollable
    // card doesn't reliably track the real visible viewport the way
    // this element's own box (now correctly sized once portaled) does.
    return createPortal(
      <div
        className="overlay-in fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
        role="presentation"
      >
        {/* role="dialog" + aria-modal: without them a screen reader has no idea
            this is a modal, and reads the page behind it as still live. Same
            shape as ActionDialog's. */}
        <div className="dialog-in w-full max-w-md rounded-xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-label={heading}>
          {children}
        </div>
      </div>,
      document.body,
    )
  }

  if (status === 'success') {
    return wrap(
      <>
        <Heading className="text-lg font-semibold text-slate-900">Thanks for your note!</Heading>
        <p className="mt-2 text-sm text-slate-600">{successMessage}</p>
        {variant === 'modal' ? (
          <button
            onClick={onClose}
            className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Close
          </button>
        ) : (
          <button
            onClick={resetForm}
            className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Send another message
          </button>
        )}
      </>
    )
  }

  const showHeading = variant === 'modal' || !headingHidden

  return wrap(
    <>
      <div className={showHeading ? 'flex items-start justify-between' : 'contents'}>
        <Heading className={showHeading ? `text-lg font-semibold text-slate-900 ${variant === 'modal' ? '' : PAGE_TITLE_DESKTOP}` : 'sr-only'}>
          {heading}
        </Heading>
        {variant === 'modal' && (
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            &times;
          </button>
        )}
      </div>

        <form onSubmit={handleSubmit} className={`${showHeading ? (variant === 'modal' ? 'mt-4' : 'mt-4 desktop:mt-7') : ''} space-y-3`}>
          <Honeypot value={honeypot} onChange={setHoneypot} />

          <div>
            <label htmlFor="feedback-message" className="block text-sm font-medium text-slate-700">
              Your feedback
            </label>
            <textarea
              id="feedback-message"
              required
              rows={4}
              maxLength={2000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What's on your mind?"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="feedback-email" className="block text-sm font-medium text-slate-700">
              Email <span className="font-normal text-slate-400">(optional, if you&rsquo;d like a reply)</span>
            </label>
            <input
              id="feedback-email"
              type="email"
              maxLength={200}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <TurnstileWidget ref={turnstileRef} onVerify={setTurnstileToken} />

          {status === 'error' && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={status === 'submitting' || !message.trim()}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {status === 'submitting' ? 'Sending...' : 'Send feedback'}
          </button>

          <PrivacyNote short />
      </form>
    </>
  )
}
