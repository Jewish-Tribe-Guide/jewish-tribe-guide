'use client'

import { useState } from 'react'
import FeedbackForm from './FeedbackForm'
import { DEFAULT_FEEDBACK_BUTTON_LABEL, DEFAULT_FEEDBACK_HEADING, DEFAULT_FEEDBACK_SUCCESS_MESSAGE } from '@/lib/siteSettings'

type Props = {
  buttonLabel?: string
  heading?: string
  successMessage?: string
}

export default function FeedbackButton({
  buttonLabel = DEFAULT_FEEDBACK_BUTTON_LABEL,
  heading = DEFAULT_FEEDBACK_HEADING,
  successMessage = DEFAULT_FEEDBACK_SUCCESS_MESSAGE,
}: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-[#fefefe]/70 underline underline-offset-2 hover:text-[#fefefe]"
      >
        {buttonLabel} &rarr;
      </button>
      {open && (
        <FeedbackForm heading={heading} successMessage={successMessage} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
