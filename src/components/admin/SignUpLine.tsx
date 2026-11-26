'use client'

import { useState } from 'react'

// "Sign up for its emails with …", and Copy: under a place's email on Add,
// and on a shul's this-week row in its listing while no email reads it.

const LINE_LINK = 'cursor-pointer font-semibold text-primary hover:underline disabled:opacity-60'

export function SignUpLine({ account }: { account: string | null }) {
  const [copied, setCopied] = useState(false)
  if (!account) return <p className="m-0 text-[0.8125rem] text-slate-500">Sign up for its emails with the guide’s Gmail</p>
  return (
    <p className="m-0 text-[0.8125rem] text-slate-500 [overflow-wrap:anywhere]">
      Sign up for its emails with {account} ·{' '}
      <button
        type="button"
        className={LINE_LINK}
        onClick={() => {
          void navigator.clipboard?.writeText(account).then(() => setCopied(true), () => {})
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </p>
  )
}
