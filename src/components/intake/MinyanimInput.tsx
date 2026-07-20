'use client'

import { useState } from 'react'
import { DAY_KEYS } from '@/lib/hours'
import type { DayKey } from '@/lib/hours'
import {
  type Tefillah,
  type Minyan,
  TEFILLAH_ORDER,
  TEFILLAH_LABELS,
  isMinyanim,
} from '@/lib/davening'

const DAY_SHORT: Record<DayKey, string> = {
  sun: 'Sun',
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
}

// crypto.randomUUID(), not a sequential counter — a counter restarts at 1 on
// every fresh page load, so a newly-added row can collide with the id an
// existing (loaded-from-storage) row already has. Since updateRow/toggleDay/
// removeRow all match by id, a collision meant editing the new row silently
// also edited whichever saved row shared its id (e.g. adding a second Mincha
// for Sons of Israel overwrote its existing Shacharis entry to Mincha too).
function genId(): string {
  return crypto.randomUUID()
}

function initMinyanim(value: unknown): Minyan[] {
  if (!isMinyanim(value)) return []
  // isMinyanim doesn't require `id` (older stored rows may predate it, or two
  // could otherwise coincidentally share one) — backfill any missing/duplicate
  // id so every row is guaranteed unique before it ever reaches updateRow's
  // id-based matching.
  const seen = new Set<string>()
  return value.map((m) => {
    if (m.id && !seen.has(m.id)) {
      seen.add(m.id)
      return m
    }
    const id = genId()
    seen.add(id)
    return { ...m, id }
  })
}

type Props = {
  label?: string
  value: unknown
  onChange: (value: Minyan[]) => void
}

/**
 * Repeater form field for structured minyanim.
 * Each row: tefillah select + time text + optional notes + day-chip toggles.
 * Value is a Minyan[].
 */
export default function MinyanimInput({ label, value, onChange }: Props) {
  const [rows, setRows] = useState<Minyan[]>(() => initMinyanim(value))

  function update(next: Minyan[]) {
    setRows(next)
    onChange(next)
  }

  function addRow() {
    update([
      ...rows,
      { id: genId(), tefillah: 'shacharis', days: [], time: '' },
    ])
  }

  function removeRow(id: string) {
    update(rows.filter((r) => r.id !== id))
  }

  function updateRow(id: string, patch: Partial<Omit<Minyan, 'id'>>) {
    update(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function toggleDay(id: string, day: DayKey, checked: boolean) {
    const row = rows.find((r) => r.id === id)
    if (!row) return
    const days = checked ? [...row.days, day] : row.days.filter((d) => d !== day)
    updateRow(id, { days })
  }

  const inputClass =
    'rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary bg-white'

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-slate-700 mb-2">{label}</label>
      )}

      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2.5"
          >
            {/* Line 1: tefillah + time + notes + remove */}
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={row.tefillah}
                onChange={(e) =>
                  updateRow(row.id, { tefillah: e.target.value as Tefillah })
                }
                className={inputClass}
              >
                {TEFILLAH_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {TEFILLAH_LABELS[t]}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={row.time}
                onChange={(e) => updateRow(row.id, { time: e.target.value })}
                placeholder="e.g. 7:00am"
                className={`${inputClass} w-28`}
              />

              <input
                type="text"
                value={row.notes ?? ''}
                onChange={(e) =>
                  updateRow(row.id, { notes: e.target.value || undefined })
                }
                placeholder="Notes (optional)"
                className={`${inputClass} flex-1 min-w-[8rem]`}
              />

              <button
                type="button"
                onClick={() => removeRow(row.id)}
                className="text-red-400 hover:text-red-600 transition-colors cursor-pointer shrink-0 text-sm leading-none"
                aria-label="Remove minyan"
              >
                ✕
              </button>
            </div>

            {/* Line 2: day chips */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-xs text-muted shrink-0 mr-1">Days:</span>
              {DAY_KEYS.map((day) => {
                const active = row.days.includes(day)
                return (
                  <label
                    key={day}
                    className={[
                      'cursor-pointer select-none rounded px-2 py-0.5 text-xs font-medium border transition-colors',
                      active
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100',
                    ].join(' ')}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => toggleDay(row.id, day, e.target.checked)}
                      className="sr-only"
                    />
                    {DAY_SHORT[day]}
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="mt-2 text-sm text-primary hover:underline cursor-pointer"
      >
        + Add minyan
      </button>

      {rows.length === 0 && (
        <p className="text-xs text-muted mt-1">No minyanim added yet.</p>
      )}
    </div>
  )
}
