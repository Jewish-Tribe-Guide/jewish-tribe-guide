'use client'

import { useState } from 'react'
import { type DayKey, type DayHours, type StructuredHours, DAY_KEYS, dayLabel, isStructuredHours } from '@/lib/hours'

export type { DayKey, DayHours, StructuredHours }

const DAYS = DAY_KEYS.map((key) => ({ key, label: dayLabel(key) }))

function initHours(value: unknown): StructuredHours {
  if (isStructuredHours(value)) return value
  // Legacy text value or empty — start blank so the admin enters fresh data.
  return {}
}

type Props = {
  label?: string
  value: unknown
  onChange: (value: StructuredHours) => void
}

// Compact 7-row hours editor. Each day has a "Closed" toggle and open/close
// time inputs. Value is stored as StructuredHours — a partial Record keyed by
// day abbreviation. Days absent from the object are treated as closed.
export default function HoursInput({ label, value, onChange }: Props) {
  const [hours, setHours] = useState<StructuredHours>(() => initHours(value))

  function setDay(key: DayKey, dayHours: DayHours) {
    const next = { ...hours, [key]: dayHours }
    setHours(next)
    onChange(next)
  }

  return (
    <div>
      {label && <label className="block text-sm font-medium text-slate-700 mb-2">{label}</label>}
      <div className="border border-slate-200 rounded-md overflow-hidden divide-y divide-slate-100">
        {DAYS.map(({ key, label: dayName }) => {
          const day = hours[key] ?? null
          const isClosed = day === null

          return (
            <div key={key} className="flex items-center gap-3 px-3 py-2 bg-white">
              {/* Day name */}
              <span className="text-sm text-slate-700 w-[6.5rem] shrink-0">{dayName}</span>

              {/* Closed toggle */}
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

              {/* Time inputs (hidden when closed) */}
              {!isClosed && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="time"
                    value={day?.open ?? '09:00'}
                    onChange={(e) =>
                      setDay(key, { open: e.target.value, close: day?.close ?? '17:00' })
                    }
                    className="rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <span className="text-slate-400 text-xs">–</span>
                  <input
                    type="time"
                    value={day?.close ?? '17:00'}
                    onChange={(e) =>
                      setDay(key, { open: day?.open ?? '09:00', close: e.target.value })
                    }
                    className="rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
