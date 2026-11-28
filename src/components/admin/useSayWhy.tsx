'use client'

import { useState, type ReactNode } from 'react'
import type { EnrichedSubmission } from '@/types'
import { PlaceButtons } from './PlaceFrame'

/** "Leave it" on To do, for something a visitor sent with their email: a
 *  line to say why first, which goes in the email telling them (tracker
 *  103). Blank is fine. Sent without an email, or a part of a change (no
 *  one hears until its last part), it's left at once: there's no one to
 *  say it to yet. */
export function useSayWhy({
  submission: s,
  whole,
  label,
  busy,
  refuse,
}: {
  submission: EnrichedSubmission
  /** The whole thing, not one part of a change. */
  whole: boolean
  label: string
  busy?: string | false
  refuse: (reason?: string) => void
}): { onNo: () => void; foot: ReactNode | null } {
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const email = s.submitted_by?.email?.trim()
  const who = s.submitted_by?.name?.trim() || email
  const onNo = () => (email && whole ? setAsking(true) : refuse())
  const foot = asking ? (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
        Why? It goes in the email to {who}
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Optional"
          autoFocus
          className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-[0.9375rem] font-normal text-slate-900"
        />
      </label>
      <PlaceButtons
        buttons={[
          { label, busy, onClick: () => refuse(reason.trim() || undefined) },
          { label: 'Back', disabled: !!busy, onClick: () => setAsking(false) },
        ]}
      />
    </div>
  ) : null
  return { onNo, foot }
}
