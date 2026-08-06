'use client'

import { useEffect, useState } from 'react'
import FeedbackForm from './FeedbackForm'
import { useIsMobile } from '@/lib/useIsMobile'
import { DEFAULT_FEEDBACK_BUTTON_LABEL, DEFAULT_FEEDBACK_HEADING, DEFAULT_FEEDBACK_SUCCESS_MESSAGE } from '@/lib/siteSettings'

type Props = {
  buttonLabel?: string
  heading?: string
  successMessage?: string
  /** Called when this modal is open and the viewport narrows to phone width.
   *  The footer that holds this button is desktop-only (page.tsx renders
   *  SiteFooter inside a `hidden sm:block`), so without this the open modal
   *  would be unmounted mid-sentence and the visitor's typing lost. Hands off
   *  to the full Feedback screen, which is where feedback lives on mobile. */
  onPromoteToPage?: () => void
}

export default function FeedbackButton({
  buttonLabel = DEFAULT_FEEDBACK_BUTTON_LABEL,
  heading = DEFAULT_FEEDBACK_HEADING,
  successMessage = DEFAULT_FEEDBACK_SUCCESS_MESSAGE,
  onPromoteToPage,
}: Props) {
  const [open, setOpen] = useState(false)
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!open || !isMobile || !onPromoteToPage) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false)
    onPromoteToPage()
  }, [open, isMobile, onPromoteToPage])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-slate-500 underline underline-offset-2 hover:text-slate-700"
      >
        {buttonLabel} &rarr;
      </button>
      {open && (
        <FeedbackForm heading={heading} successMessage={successMessage} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
