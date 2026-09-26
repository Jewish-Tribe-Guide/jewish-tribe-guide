'use client'

import { useState } from 'react'
import type { Answer } from '@/lib/askAnswer'

// The one-line answer above search results (see askAnswer.ts): the sentence,
// then for a minyan question the minyanim it's about, each opening its shul.
// Shared by the desktop search dropdown and the phone's results list, so the
// two always say the same thing. A long list shows its first few with the
// rest one tap away: "9 more today" used to be a count with nowhere to go.
export default function AskAnswer({
  answer,
  onOpenShul,
  className = '',
}: {
  answer: Answer
  onOpenShul?: (shulId: string) => void
  className?: string
}) {
  // Open for this answer only: a new question starts collapsed again,
  // without an effect to reset it.
  const [expandedFor, setExpandedFor] = useState<string | null>(null)
  const expanded = expandedFor === answer.text
  const limit = answer.shown ?? answer.rows.length
  const rows = expanded ? answer.rows : answer.rows.slice(0, limit)
  const hidden = answer.rows.length - limit
  const allTomorrow = answer.rows.every((r) => r.tomorrow)
  return (
    <div className={`rounded-xl bg-brand-teal/[0.07] px-3.5 py-3 ${className}`} role="status" aria-live="polite">
      <p className="text-[14px] font-semibold leading-snug text-ink">{answer.text}</p>
      {answer.rows.length > 0 && (
        <ul className="mt-2 divide-y divide-brand-teal/10">
          {rows.map((r) => {
            const row = (
              <>
                <span className="w-[4.6rem] shrink-0 font-semibold tabular-nums text-ink">{r.time}</span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-slate-700">{r.label}</span>
                  <span className="text-slate-500"> · {r.shulName}</span>
                </span>
                {r.tomorrow && <span className="shrink-0 text-[11.5px] font-medium text-amber-700">Tomorrow</span>}
                {r.miles != null && <span className="shrink-0 tabular-nums text-slate-500">{r.miles} mi</span>}
              </>
            )
            return (
              <li key={`${r.shulId ?? r.shulName}-${r.time}-${r.label}`}>
                {r.shulId && onOpenShul ? (
                  <button
                    type="button"
                    onClick={() => onOpenShul(r.shulId!)}
                    className="flex w-full cursor-pointer items-center gap-2 py-1.5 text-left text-[13px] transition-colors hover:text-brand-teal"
                  >
                    {row}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 py-1.5 text-[13px]">{row}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpandedFor(expanded ? null : answer.text)}
          aria-expanded={expanded}
          className="mt-1 cursor-pointer text-[13px] font-semibold text-brand-teal transition-colors hover:text-brand-teal-dark"
        >
          {expanded ? 'Show fewer' : `Show all ${answer.rows.length}${allTomorrow ? ' tomorrow' : ' today'}`}
        </button>
      )}
    </div>
  )
}
