'use client'

import { type DayKey, type DayHours, type StructuredHours, DAY_KEYS, dayLabel, isStructuredHours } from '@/lib/hours'

export type { DayKey, DayHours, StructuredHours }

function initHours(value: unknown): StructuredHours {
  if (isStructuredHours(value)) return value
  return {}
}

type Props = {
  label?: string
  value: unknown
  onChange: (value: StructuredHours) => void
}

// Compact 7-row hours editor. Always expanded — it used to collapse behind
// its own chevron (defaulting shut, auto-opening once hours were pre-filled
// from Google), back when it sat in one long flat field list and needed its
// own space-saving toggle. Now that it renders inside ListingForm's Basics
// group (itself already collapsed/expanded as a whole), that second layer
// of hiding was pure friction — open Basics, then still have to click again
// just to see or set Hours — and looked jarringly different next to a plain
// boolean field's checkbox right next to it, which reveals what it gates
// with no toggle of its own either. Each day has a "Closed" toggle and
// open/close time inputs. Value is stored as StructuredHours.
export default function HoursInput({ label, value, onChange }: Props) {
  const hours = initHours(value)

  function setDay(key: DayKey, dayHours: DayHours) {
    onChange({ ...hours, [key]: dayHours })
  }

  return (
    <div>
      <span className="block text-sm font-medium text-slate-700 mb-1">{label ?? 'Hours'}</span>

      <div className="border border-slate-200 rounded-md overflow-hidden divide-y divide-slate-100">
        {DAY_KEYS.map((key) => {
          const day = hours[key] ?? null
          const isClosed = day === null
          const full = dayLabel(key)
          // 3-letter abbreviation, not the full name — the full names
          // varied enough in width (Sun vs Wednesday) that a column wide
          // enough for the longest one left a wide, odd-looking gap before
          // the checkbox on every shorter day. All the abbreviations are
          // the same length, so a narrow fixed column stays aligned
          // without stranding whitespace. The unabbreviated name still
          // reaches screen readers via the checkbox's aria-label below,
          // in case "Sun" reads ambiguously.
          const short = key.charAt(0).toUpperCase() + key.slice(1)

          return (
            <div key={key} className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-2 bg-white">
              <span className="text-sm text-slate-700 w-9 shrink-0">{short}</span>

              <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={isClosed}
                  onChange={(e) =>
                    setDay(key, e.target.checked ? null : { open: '09:00', close: '17:00' })
                  }
                  aria-label={`${full} closed`}
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
    </div>
  )
}
