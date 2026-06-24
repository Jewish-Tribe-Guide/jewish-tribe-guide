'use client'

import { useState } from 'react'
import FeedbackForm from './FeedbackForm'

export default function FeedbackButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-slate-500 underline underline-offset-2 hover:text-slate-700"
      >
        Have general feedback about the site? Send a note &rarr;
      </button>
      {open && <FeedbackForm onClose={() => setOpen(false)} />}
    </>
  )
}
