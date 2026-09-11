'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Honeypot from './Honeypot'
import TurnstileWidget, { type TurnstileHandle } from './TurnstileWidget'
import { submitRequest } from '@/lib/submitRequest'
import PrivacyNote from '@/components/PrivacyNote'
import type { ContactHospitalData } from '@/types'
import { useCommunitySlug } from '@/lib/communityContext'

type Props = {
  heading: string
  successMessage: string
  /** 'modal' (default) renders the fixed-backdrop dialog used by FeedbackButton;
   *  'inline' renders just the card content, for embedding as a full page (the
   *  mobile Feedback tab). */
  variant?: 'modal' | 'inline'
  /** Required for 'modal' (backdrop tap / ✕ / success "Close"); unused inline. */
  onClose?: () => void
}

export default function FeedbackForm({ heading, successMessage, variant = 'modal', onClose }: Props) {
  const community = useCommunitySlug()
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')
  const turnstileRef = useRef<TurnstileHandle>(null)

  // FeedbackScreen's desktop branch renders the modal variant unconditionally
  // on page load — not behind a click the way FeedbackButton/HeaderNav's
  // "More" always are — so, unlike CommunitySwitcher's own portal (which
  // only ever runs after a click, never during a server render),
  // `createPortal(..., document.body)` below CAN be reached during SSR,
  // where `document` doesn't exist. `mounted` delays the portal to after
  // this component is actually running in the browser; the server (and the
  // client's first paint, before hydration) render nothing for the modal
  // variant instead of crashing on it.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
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

  const wrap = (children: React.ReactNode) => {
    if (variant !== 'modal') {
      return <div className="mx-auto w-full max-w-md px-4 py-8">{children}</div>
    }
    // FeedbackScreen's desktop branch renders this variant unconditionally
    // on page load, so the portal below can be reached during SSR, where
    // there's no `document` to portal into (see `mounted`'s own comment) —
    // render nothing until this is actually running in the browser.
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
        className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      >
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">{children}</div>
      </div>,
      document.body,
    )
  }

  if (status === 'success') {
    return wrap(
      <>
        <h3 className="text-lg font-semibold text-slate-900">Thanks for your note!</h3>
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

  return wrap(
    <>
      <div className="flex items-start justify-between">
        <h3 className="text-lg font-semibold text-slate-900">{heading}</h3>
        {variant === 'modal' && (
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            &times;
          </button>
        )}
      </div>

        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          For adding, fixing, or removing a specific listing, use the{' '}
          <span className="font-medium text-slate-600">Add</span>,{' '}
          <span className="font-medium text-slate-600">Edit</span>, or{' '}
          <span className="font-medium text-slate-600">Report</span> buttons
          on that listing — those get handled fastest.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
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

          <PrivacyNote />
      </form>
    </>
  )
}
