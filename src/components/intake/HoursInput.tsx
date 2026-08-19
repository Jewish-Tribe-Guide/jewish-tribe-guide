'use client'

import { useState, useEffect, useRef } from 'react'
import { type DayKey, type DayHours, type StructuredHours, DAY_KEYS, dayLabel, isStructuredHours } from '@/lib/hours'

export type { DayKey, DayHours, StructuredHours }

const DAYS = DAY_KEYS.map((key) => ({ key, label: dayLabel(key) }))

function initHours(value: unknown): StructuredHours {
  if (isStructuredHours(value)) return value
  return {}
}

function openDaysCount(hours: StructuredHours): number {
  return Object.values(hours).filter((v) => v !== null && v !== undefined).length
}

type Props = {
  label?: string
  value: unknown
  onChange: (value: StructuredHours) => void
}

// Compact 7-row hours editor, collapsed by default. Auto-opens when hours are
// pre-filled from outside (e.g. Google Places autocomplete). Each day has a
// "Closed" toggle and open/close time inputs. Value is stored as StructuredHours.
export default function HoursInput({ label, value, onChange }: Props) {
  const hours = initHours(value)
  const count = openDaysCount(hours)
  const hasHours = count > 0

  const [open, setOpen] = useState(false)

  // Auto-open when parent pushes hours in from outside (Google pre-fill).
  const prevHasHours = useRef(hasHours)
  useEffect(() => {
    if (hasHours && !prevHasHours.current) setOpen(true)
    prevHasHours.current = hasHours
  }, [hasHours])

  function setDay(key: DayKey, dayHours: DayHours) {
    onChange({ ...hours, [key]: dayHours })
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-left"
        aria-expanded={open}
      >
        <svg
          className={`w-4 h-4 text-muted transition-transform duration-150 ${open ? 'rotate-180' : '-rotate-90'}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
        <span className="text-sm font-medium text-slate-700">
          {label ?? 'Hours'}
          {!open && hasHours && (
            <span className="ml-2 text-xs font-normal text-muted">
              {count} day{count !== 1 ? 's' : ''}/week set
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="mt-2 border border-slate-200 rounded-md overflow-hidden divide-y divide-slate-100">
          {DAYS.map(({ key, label: dayName }) => {
            const day = hours[key] ?? null
            const isClosed = day === null

            return (
              <div key={key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 bg-white">
                <span className="text-sm text-slate-700 w-[6.5rem] shrink-0">{dayName}</span>

                <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={isClosed}
                    onChange={(e) =>
                      setDay(key, e.target.checked ? null : { open: '09:00', close: '17:00' })
                    }
                    className="h-3.5 w-3.5 rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  <span className="text-xs text-slate-500">Closed</span>
                </label>

                {!isClosed && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="time"
                      value={day?.open ?? '09:00'}
                      onChange={(e) =>
                        setDay(key, { open: e.target.value, close: day?.close ?? '17:00' })
                      }
                      className="hours-time-input rounded border border-slate-300 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <span className="text-slate-400 text-xs">–</span>
                    <input
                      type="time"
                      value={day?.close ?? '17:00'}
                      onChange={(e) =>
                        setDay(key, { open: day?.open ?? '09:00', close: e.target.value })
                      }
                      className="hours-time-input rounded border border-slate-300 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
