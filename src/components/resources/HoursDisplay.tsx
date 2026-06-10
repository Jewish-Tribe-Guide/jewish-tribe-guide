'use client'

import { useState } from 'react'
import { formatTodayHours, formatWeekHours } from '@/lib/hours'

type Props = {
  value: unknown
}

/**
 * Hours shown on a directory card. Collapsed by default to today's line
 * ("Today: 9:00 AM – 5:00 PM" / "Closed today"); a toggle expands the full
 * 7-day grid with today highlighted. Legacy text-string hours render as-is
 * with no toggle.
 */
export default function HoursDisplay({ value }: Props) {
  const [open, setOpen] = useState(false)

  const today = formatTodayHours(value)
  if (!today) return null

  const week = formatWeekHours(value)

  // Legacy text string (no structured breakdown) — show the raw line, no toggle.
  if (!week) {
    return <p className="text-xs text-slate-600 mt-1">{today}</p>
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
        aria-expanded={open}
      >
        <span>{today}</span>
        <svg
          className={`w-3 h-3 text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 mt-1.5 pl-0.5">
          {week.map((d) => (
            <div key={d.key} className="contents">
              <dt className={`text-xs ${d.isToday ? 'font-semibold text-slate-700' : 'text-muted'}`}>
                {d.label}
              </dt>
              <dd className={`text-xs ${d.isToday ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                {d.text}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
