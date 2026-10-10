'use client'

import { useState } from 'react'
import {
  type Tefillah,
  type Minyan,
  type MinyanDayKey,
  TEFILLAH_ORDER,
  TEFILLAH_LABELS,
  ALL_MINYAN_DAYS,
  SEASON_LABELS,
  isMinyanim,
  type Season,
} from '@/lib/davening'
import { RELATIVE_ELIGIBLE, ZMAN_ANCHOR_ORDER, RelativeTimeFields, TimeModeToggle, useTimeModes } from './ZmanTimeFields'

const DAY_SHORT: Record<MinyanDayKey, string> = {
  sun: 'Sun',
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  rosh_chodesh: 'Rosh Chodesh',
  yom_tov: 'Yom Tov',
  holiday: 'Holiday',
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
  /** The days a row can be on, where the editor is for some of them: a
   *  shul's "Usual Shabbos times" offers Friday and Shabbos (Oct 10). */
  days?: readonly MinyanDayKey[]
  /** The day a new row starts on, there. */
  newRowDays?: MinyanDayKey[]
}

/**
 * Repeater form field for structured minyanim.
 * Each row: tefillah select + time text + optional notes + day-chip toggles.
 * Value is a Minyan[].
 */
export default function MinyanimInput({ label, value, onChange, days: dayChoices = ALL_MINYAN_DAYS, newRowDays = [] }: Props) {
  const [rows, setRows] = useState<Minyan[]>(() => initMinyanim(value))
  // The clock / zman rules, shared with SchedulesInput (ZmanTimeFields).
  const modes = useTimeModes()
  // Which rows have the earliest/latest limits revealed. Collapsed by
  // default and deliberately so: almost every minyan wants the plain zman,
  // and a form that shows all five controls at once reads as five decisions
  // to make rather than one. A row that already HAS a bound opens expanded
  // (see `boundsOpen` below), so nothing saved is ever hidden from an editor.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  function update(next: Minyan[]) {
    setRows(next)
    onChange(next)
  }

  function addRow() {
    update([
      ...rows,
      { id: genId(), tefillah: 'shacharis', days: newRowDays, time: '' },
    ])
  }

  function removeRow(id: string) {
    update(rows.filter((r) => r.id !== id))
  }

  function updateRow(id: string, patch: Partial<Omit<Minyan, 'id'>>) {
    update(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function toggleDay(id: string, day: MinyanDayKey, checked: boolean) {
    const row = rows.find((r) => r.id === id)
    if (!row) return
    const days = checked ? [...row.days, day] : row.days.filter((d) => d !== day)
    updateRow(id, { days })
  }

  // Each returns the row's change, applied here (see useTimeModes).
  const apply = (id: string, patch: Partial<Omit<Minyan, 'id'>> | null) => {
    if (patch) updateRow(id, patch)
  }

  const inputClass =
    'rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary bg-white'

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-slate-700 mb-2">{label}</label>
      )}

      <div className="space-y-2">
        {rows.map((row) => {
          const isRelative = !!row.anchor
          const canBeRelative = RELATIVE_ELIGIBLE.includes(row.tefillah)
          const { direction, magnitudeText, anchor } = modes.view(row)
          // Open when a bound is already stored, so an editor can never be
          // shown a row whose saved limits are hidden behind a collapsed link.
          const boundsOpen = expanded[row.id] || !!row.notBefore || !!row.notAfter

          return (
          <div
            key={row.id}
            className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2.5"
          >
            {/* Line 1: tefillah + clock/relative mode toggle + remove */}
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={row.tefillah}
                onChange={(e) => {
                  const tefillah = e.target.value as Tefillah
                  // Relative mode only makes sense for a handful of tefillos
                  // (see RELATIVE_ELIGIBLE) — picking one that isn't among
                  // them drops a currently-relative row back to clock mode,
                  // atomically with the tefillah change, in one updateRow:
                  // two calls in the same handler would each read the
                  // pre-update `rows` closure and the second would silently
                  // clobber the first's change.
                  if (isRelative && !RELATIVE_ELIGIBLE.includes(tefillah)) {
                    updateRow(row.id, { ...modes.switchToClock(row), tefillah })
                  } else {
                    updateRow(row.id, { tefillah })
                  }
                }}
                className={inputClass}
              >
                {TEFILLAH_ORDER.filter((t) => t !== 'shabbos_mussaf' || t === row.tefillah).map((t) => (
                  <option key={t} value={t}>
                    {TEFILLAH_LABELS[t]}
                  </option>
                ))}
              </select>

              {(canBeRelative || isRelative) && (
                <TimeModeToggle
                  relative={isRelative}
                  label="Sunset/Havdalah…"
                  onClock={() => apply(row.id, modes.switchToClock(row))}
                  onRelative={() => apply(row.id, modes.switchToRelative(row))}
                />
              )}

              <button
                type="button"
                onClick={() => removeRow(row.id)}
                // active:text-red-800 — a further step past hover's
                // red-600, same text-color-escalation treatment as this
                // app's other unpadded icon-only controls.
                className="text-red-400 hover:text-red-600 active:text-red-800 transition-colors cursor-pointer shrink-0 text-sm leading-none ml-auto"
                aria-label="Remove minyan"
              >
                ✕
              </button>
            </div>

            {/* Line 2: the actual time — clock text input, or a compact
                anchor + offset control cluster instead of prose crammed into
                a time box (see davening.ts's ZmanAnchor for why). */}
            <div className="flex items-center gap-2 flex-wrap">
              {!isRelative ? (
                <input
                  type="text"
                  value={row.time}
                  onChange={(e) => apply(row.id, modes.setClockTime(row, e.target.value))}
                  placeholder="e.g. 7:00am"
                  className={`${inputClass} w-28`}
                />
              ) : (
                <RelativeTimeFields
                  anchors={ZMAN_ANCHOR_ORDER}
                  anchor={anchor}
                  direction={direction}
                  magnitudeText={magnitudeText}
                  time={row.time}
                  inputClass={inputClass}
                  onChange={(a, d, m) => apply(row.id, modes.setRelative(row, a, d, m))}
                />
              )}

              {/* Season as a field rather than something typed into Notes.
                  Shuls have always written "Winter only" there as prose, which
                  nothing could act on; structured, the app can dim the row
                  when it doesn't currently apply. Which half of the year it is
                  gets derived from the community's timezone — nobody sets a
                  changeover date, here or in the admin (see lib/season.ts). */}
              <select
                value={row.season ?? ''}
                onChange={(e) =>
                  updateRow(row.id, { season: (e.target.value || undefined) as Season | undefined })
                }
                aria-label="Season"
                className={`${inputClass} shrink-0`}
              >
                <option value="">All year</option>
                {(Object.keys(SEASON_LABELS) as Season[]).map((season) => (
                  <option key={season} value={season}>
                    {SEASON_LABELS[season]}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={row.notes ?? ''}
                onChange={(e) =>
                  updateRow(row.id, { notes: e.target.value || undefined })
                }
                placeholder="Notes (optional)"
                className={`${inputClass} flex-1 min-w-[8rem]`}
              />
            </div>

            {/* Line 2b: the optional window a zman-based time is clamped into.
                Only offered on relative rows — a fixed clock time is already
                fixed — and collapsed behind a link so the ordinary case stays
                a one-decision row. This is what expresses "candle lighting,
                but never before 5:00pm and never after 7:00pm": one rule that
                holds all year, which no combination of Winter/Summer could
                say (see MinyanBounds in davening.ts). */}
            {isRelative && (
              boundsOpen ? (
                <div className="flex items-center gap-2 flex-wrap pl-1">
                  <span className="text-xs text-muted shrink-0">But never before</span>
                  <input
                    type="time"
                    value={row.notBefore ?? ''}
                    onChange={(e) => apply(row.id, modes.setBound(row, { notBefore: e.target.value }))}
                    aria-label="Earliest time"
                    className={`${inputClass} w-32`}
                  />
                  <span className="text-xs text-muted shrink-0">or after</span>
                  <input
                    type="time"
                    value={row.notAfter ?? ''}
                    onChange={(e) => apply(row.id, modes.setBound(row, { notAfter: e.target.value }))}
                    aria-label="Latest time"
                    className={`${inputClass} w-32`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      apply(row.id, modes.setBound(row, { notBefore: undefined, notAfter: undefined }))
                      setExpanded((x) => ({ ...x, [row.id]: false }))
                    }}
                    className="text-xs text-muted hover:text-slate-700 underline cursor-pointer"
                  >
                    Remove limits
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setExpanded((x) => ({ ...x, [row.id]: true }))}
                  className="text-xs text-primary hover:underline cursor-pointer pl-1"
                >
                  + Add earliest/latest limits
                </button>
              )
            )}

            {/* Line 3: day chips */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-xs text-muted shrink-0 mr-1">Days:</span>
              {dayChoices.map((day) => {
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
          )
        })}
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
