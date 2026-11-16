'use client'

import { useRef, useState } from 'react'
import Honeypot from './Honeypot'
import TurnstileWidget, { type TurnstileHandle } from './TurnstileWidget'
import { submitRequest } from '@/lib/submitRequest'
import PrivacyNote from '@/components/PrivacyNote'
import type { ContactHospitalData } from '@/types'
import { useCommunitySlug } from '@/lib/communityContext'
import { PAGE_BOX as BOX } from '@/lib/pageColumn'
import { PageGlyph } from '@/components/pages/PageGlyph'

type Props = {
  successMessage: string
  /** The Tell us card sits above the form on a phone, so the form's own
   *  title there is "Anything else?". */
  afterTellUs?: boolean
  /** Told when the note is sent and when the form is cleared again, so the
   *  page can clear the rest away while the thank-you shows. */
  onSentChange?: (sent: boolean) => void
}

// The Feedback page's form (FeedbackScreen lays out the page, its title and
// the Tell us card). It was also a dialog over the page on a computer until
// Nov 16, when Feedback became one page on every screen.

// The board's fields (Feedback, Nov 15): 16px, so an iPhone doesn't zoom in
// on focus; a blue ring when focused. White, not the board's grey: grey
// read as switched off beside a pale Send (the user, Nov 16).
const FIELD =
  'mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-[16px] text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-[3px] focus:ring-blue-600/15'
const LABEL = 'block text-[15px] font-bold text-slate-900'
const BIG_BUTTON = 'flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] text-[16px] font-bold transition'

export default function FeedbackForm({ successMessage, afterTellUs = false, onSentChange }: Props) {
  const community = useCommunitySlug()
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')
  const turnstileRef = useRef<TurnstileHandle>(null)

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

  // "Send another" clears the form back to a blank slate. Turnstile tokens are single-use, so the widget
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

  const sent = status === 'success'

  const sentBox = (
    <section className={`${BOX} px-5 pb-6 pt-7 text-center`}>
      <span className="mx-auto mb-3.5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <PageGlyph name="tick" className="h-7 w-7" />
      </span>
      <h2 className="text-[21px] font-extrabold tracking-tight text-slate-900">Thanks, it’s sent</h2>
      <p className="mt-1.5 text-[16px] leading-normal text-slate-600">{successMessage}</p>
      <button
        type="button"
        onClick={resetForm}
        className={`${BIG_BUTTON} mt-5 border border-slate-300 bg-white text-blue-700 hover:bg-slate-50`}
      >
        Send another
      </button>
    </section>
  )

  const formTitle = afterTellUs ? (
    <>
      <span className="desktop:hidden">Anything else?</span>
      <span className="hidden desktop:inline">What’s on your mind?</span>
    </>
  ) : 'What’s on your mind?'

  const formBox = (
    <section aria-labelledby="feedback-form-title" className={`${BOX} px-4 pb-5 pt-[18px] desktop:px-9 desktop:pb-[30px] desktop:pt-[30px]`}>
      <h2 id="feedback-form-title" className={`mb-3.5 text-[19px] font-extrabold tracking-tight text-slate-900 desktop:mb-[18px] desktop:text-[22px]`}>
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
          className={`${FIELD} min-h-[140px] leading-normal desktop:min-h-[170px]`}
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

  return sent ? sentBox : formBox
}
