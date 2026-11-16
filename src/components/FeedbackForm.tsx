'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Honeypot from './Honeypot'
import TurnstileWidget, { type TurnstileHandle } from './TurnstileWidget'
import { submitRequest } from '@/lib/submitRequest'
import PrivacyNote from '@/components/PrivacyNote'
import type { ContactHospitalData } from '@/types'
import { useCommunitySlug } from '@/lib/communityContext'
import { ui } from '@/lib/uiConfig'
import { PAGE_BOX as BOX } from '@/lib/pageColumn'
import { PageGlyph } from '@/components/pages/PageGlyph'
import TellUsCard from '@/components/pages/TellUsCard'

type Props = {
  heading: string
  successMessage: string
  /** 'modal' (default) is the dialog FeedbackButton and HeaderNav open over
   *  the page being read: the heading, the Tell us card, then the form.
   *  'inline' is the form's box alone, for FeedbackScreen, which lays out the
   *  page, its title and the Tell us card itself. */
  variant?: 'modal' | 'inline'
  /** Required for 'modal' (backdrop tap / ✕ / success "Close"); unused inline. */
  onClose?: () => void
  /** Inline only: the Tell us card sits above the form on a phone, so the
   *  form's own title there is "Anything else?". */
  afterTellUs?: boolean
  /** Inline only: told when the note is sent and when the form is cleared
   *  again, so the page can clear the rest away while the thank-you shows. */
  onSentChange?: (sent: boolean) => void
}

// The board's fields (Feedback, Nov 15): 16px, so an iPhone doesn't zoom in
// on focus; soft until focused, then white with a blue ring.
const FIELD =
  'mt-2 block w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-3 text-[16px] text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-[3px] focus:ring-blue-600/15'
const LABEL = 'block text-[15px] font-bold text-slate-900'
const BIG_BUTTON = 'flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] text-[16px] font-bold transition'

export default function FeedbackForm({ heading, successMessage, variant = 'modal', onClose, afterTellUs = false, onSentChange }: Props) {
  const community = useCommunitySlug()
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')
  // Modal only: the Tell us box is up, so the dialog steps aside for it.
  const [telling, setTelling] = useState(false)
  const turnstileRef = useRef<TurnstileHandle>(null)
  const modal = variant === 'modal'

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
      onSentChange?.(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setStatus('error')
    }
  }

  // Clears the form back to a blank slate — used by the inline variant's
  // "Send another" (the modal variant just closes instead, since reopening it
  // already starts fresh). Turnstile tokens are single-use, so the widget
  // needs an explicit reset too, not just a cleared token.
  const resetForm = () => {
    setMessage('')
    setEmail('')
    setTurnstileToken('')
    setError('')
    setStatus('idle')
    onSentChange?.(false)
    turnstileRef.current?.reset()
  }

  // Escape closes the modal variant, as it does every other dialog in the
  // app — but not while the Tell us box is up over it: that box has its own
  // Escape, and closing this would take the box with it.
  useEffect(() => {
    if (!modal || !onClose || telling) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modal, onClose, telling])

  const sent = status === 'success'
  const tellUs = modal && ui.contributions.add

  const sentBox = (
    <section className={`${BOX} px-5 pb-6 pt-7 text-center`}>
      <span className="mx-auto mb-3.5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <PageGlyph name="tick" className="h-7 w-7" />
      </span>
      <h2 className="text-[21px] font-extrabold tracking-tight text-slate-900">Thanks, it’s sent</h2>
      <p className="mt-1.5 text-[16px] leading-normal text-slate-600">{successMessage}</p>
      <button
        type="button"
        onClick={modal ? onClose : resetForm}
        className={`${BIG_BUTTON} mt-5 border border-slate-300 bg-white text-blue-700 hover:bg-slate-50`}
      >
        {modal ? 'Close' : 'Send another'}
      </button>
    </section>
  )

  const formTitle = afterTellUs || tellUs ? (
    modal ? 'Anything else?' : (
      <>
        <span className="desktop:hidden">Anything else?</span>
        <span className="hidden desktop:inline">What’s on your mind?</span>
      </>
    )
  ) : 'What’s on your mind?'

  const formBox = (
    <section aria-labelledby="feedback-form-title" className={`${BOX} px-4 pb-5 pt-[18px] ${modal ? '' : 'desktop:px-9 desktop:pb-[30px] desktop:pt-[30px]'}`}>
      <h2 id="feedback-form-title" className={`mb-3.5 text-[19px] font-extrabold tracking-tight text-slate-900 ${modal ? '' : 'desktop:mb-[18px] desktop:text-[22px]'}`}>
        {formTitle}
      </h2>
      <form onSubmit={handleSubmit}>
        <Honeypot value={honeypot} onChange={setHoneypot} />
        <label htmlFor="feedback-message" className={LABEL}>Your note</label>
        <textarea
          id="feedback-message"
          required
          rows={5}
          maxLength={2000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="An idea, something that didn’t work, or what you’d like to see."
          className={`${FIELD} min-h-[140px] leading-normal ${modal ? '' : 'desktop:min-h-[170px]'}`}
        />
        <label htmlFor="feedback-email" className={`${LABEL} mt-[18px]`}>Email, for a reply</label>
        <input
          id="feedback-email"
          type="email"
          maxLength={200}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className={FIELD}
        />
        <TurnstileWidget ref={turnstileRef} onVerify={setTurnstileToken} />
        {status === 'error' && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={status === 'submitting' || !message.trim()}
          className={`${BIG_BUTTON} mt-5 bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-200`}
        >
          <PageGlyph name="send" className="h-[18px] w-[18px]" />
          {status === 'submitting' ? 'Sending…' : 'Send'}
        </button>
        <PrivacyNote short className="mt-3" />
      </form>
    </section>
  )

  if (!modal) return sent ? sentBox : formBox

  // No `document` to portal into during SSR (see `mounted`'s own comment).
  if (!mounted) return null

  // Portaled to <body> — opened from HeaderNav's "More" menu, which lives
  // inside SiteHeader, and that header carries `backdrop-blur`. A
  // backdrop-filter (like a transform) establishes a containing block for
  // `position: fixed` descendants, so `fixed inset-0` here was sizing itself
  // to the ~65px header instead of the viewport: the backdrop dimmed only a
  // strip at the top of the screen. CommunitySwitcher hit the identical bug
  // for the identical reason (see its own doc) — same fix here.
  //
  // overflow-y-auto on this element, not a max-h + its own scroll on the
  // card below (tried first) — the form can be taller than a short browser
  // window, and a `vh`-based cap on a nested scrollable card doesn't reliably
  // track the real visible viewport the way this element's own box does.
  //
  // While the Tell us box is up the dialog is hidden rather than unmounted:
  // the card holds that box, and closing it closes Feedback too, since the
  // person chose the box over a note.
  return createPortal(
    <div
      className={`overlay-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center ${telling ? 'hidden' : ''}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      role="presentation"
    >
      {/* role="dialog" + aria-modal: without them a screen reader has no idea
          this is a modal, and reads the page behind it as still live. Same
          shape as ActionDialog's. */}
      <div
        className="dialog-in flex w-full max-w-[520px] flex-col gap-3 rounded-[20px] bg-slate-50 p-4 shadow-xl sm:p-[22px]"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
      >
        <div className="flex items-center justify-between px-1 pb-1 pt-0.5">
          <h2 className="text-[22px] font-extrabold tracking-tight text-slate-900">{heading}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-xl leading-none text-slate-500 hover:text-slate-700"
          >
            &times;
          </button>
        </div>
        {sent ? sentBox : (
          <>
            {tellUs && (
              <TellUsCard
                onOpenChange={(open) => {
                  setTelling(open)
                  if (!open) onClose?.()
                }}
              />
            )}
            {formBox}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
