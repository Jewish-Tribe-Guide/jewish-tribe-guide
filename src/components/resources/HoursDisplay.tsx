'use client'

import { useState } from 'react'
import { formatTodayHours, formatWeekHours } from '@/lib/hours'

type Props = {
  value: unknown
  /** Google business status, when this listing auto-syncs from Google Places. */
  businessStatus?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY'
  /** ISO timestamp of the last successful Google sync, for the freshness note. */
  syncedAt?: string
}

// "2026-06-07T…" → "updated 3d ago" / "updated today". Returns null if unparseable.
function syncedLabel(iso?: string): string | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const days = Math.floor((Date.now() - then) / 86_400_000)
  if (days <= 0) return 'Synced from Google · updated today'
  if (days === 1) return 'Synced from Google · updated 1d ago'
  return `Synced from Google · updated ${days}d ago`
}

/**
 * Hours shown on a directory card. Collapsed by default to today's line
 * ("Today: 9:00 AM – 5:00 PM" / "Closed today"); a toggle expands the full
 * 7-day grid with today highlighted. Legacy text-string hours render as-is
 * with no toggle.
 *
 * For listings that auto-sync from Google Places, a "permanently/temporarily
 * closed" badge and a "synced … ago" freshness note are shown.
 */
export default function HoursDisplay({ value, businessStatus, syncedAt }: Props) {
  const [open, setOpen] = useState(false)

  // A closed-by-Google badge stands on its own even when hours are missing.
  const closedBadge =
    businessStatus === 'CLOSED_PERMANENTLY'
      ? { text: 'Permanently closed', cls: 'bg-red-50 text-red-700 border-red-200' }
      : businessStatus === 'CLOSED_TEMPORARILY'
        ? { text: 'Temporarily closed', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
        : null

  const today = formatTodayHours(value)
  const synced = syncedLabel(syncedAt)

  // Nothing to show at all.
  if (!today && !closedBadge) return null

  const week = today ? formatWeekHours(value) : null

  return (
    <div className="mt-1">
      {closedBadge && (
        <span
          className={`inline-block text-xs font-medium border rounded-full px-2 py-0.5 mb-1 ${closedBadge.cls}`}
        >
          {closedBadge.text}
        </span>
      )}

      {today && !week && (
        // Legacy text string (no structured breakdown) — show the raw line, no toggle.
        <p className="text-xs text-slate-600">{today}</p>
      )}

      {today && week && (
        <>
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
        </>
      )}

      {synced && <p className="text-[11px] text-muted mt-0.5">{synced}</p>}
    </div>
  )
}
