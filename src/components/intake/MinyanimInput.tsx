'use client'

import { useState } from 'react'
import {
  type Tefillah,
  type Minyan,
  type ZmanAnchor,
  type MinyanDayKey,
  TEFILLAH_ORDER,
  TEFILLAH_LABELS,
  ZMAN_ANCHOR_LABELS,
  ALL_MINYAN_DAYS,
  formatAnchorRule,
  isMinyanim,
} from '@/lib/davening'

const ZMAN_ANCHOR_ORDER: ZmanAnchor[] = ['sunset', 'candle_lighting', 'havdalah']

// The relative (sunset/candle-lighting/havdalah) mode only makes sense for
// tefillos whose time actually moves with the zman day to day — Shacharis,
// Kabbalas Shabbos, etc. are always clock times in practice.
const RELATIVE_ELIGIBLE: Tefillah[] = ['mincha', 'maariv', 'mincha_maariv']

type Direction = 'before' | 'after'

/** What a row's OTHER mode last held, so switching Clock ↔ Relative and back
 *  restores it instead of losing it (a misclick shouldn't cost your data).
 *  `magnitudeText` is a raw string, not a number, so the offset input can be
 *  emptied out to type a fresh value instead of being stuck showing "0". */
type Draft = {
  clockTime?: string
  anchor?: ZmanAnchor
  direction?: Direction
  magnitudeText?: string
}

const DAY_SHORT: Record<MinyanDayKey, string> = {
  sun: 'Sun',
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  rosh_chodesh: 'Rosh Chodesh',
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
}

/**
 * Repeater form field for structured minyanim.
 * Each row: tefillah select + time text + optional notes + day-chip toggles.
 * Value is a Minyan[].
 */
export default function MinyanimInput({ label, value, onChange }: Props) {
  const [rows, setRows] = useState<Minyan[]>(() => initMinyanim(value))
  // Keyed by row id — not part of Minyan, never saved. See Draft above.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})

  function update(next: Minyan[]) {
    setRows(next)
    onChange(next)
  }

  function mergeDraft(id: string, patch: Draft) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }))
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

  function toggleDay(id: string, day: MinyanDayKey, checked: boolean) {
    const row = rows.find((r) => r.id === id)
    if (!row) return
    const days = checked ? [...row.days, day] : row.days.filter((d) => d !== day)
    updateRow(id, { days })
  }

  // Relative rows keep `time` auto-generated from anchor + offsetMinutes (via
  // formatAnchorRule) rather than hand-typed — see davening.ts for why: every
  // existing display/sort call site reads `time` as plain text, so this is
  // what lets a calculated clock time be layered on top without touching them.
  function setRelative(id: string, anchor: ZmanAnchor, direction: Direction, magnitudeText: string) {
    mergeDraft(id, { anchor, direction, magnitudeText })
    const offsetMinutes = (direction === 'before' ? -1 : 1) * (Number(magnitudeText) || 0)
    updateRow(id, { anchor, offsetMinutes, time: formatAnchorRule(anchor, offsetMinutes) })
  }

  function setClockTime(id: string, time: string) {
    mergeDraft(id, { clockTime: time })
    updateRow(id, { time })
  }

  // Switching modes stashes the row's current values as that mode's draft
  // first, then restores whatever the OTHER mode last held (or a sensible
  // default for a row that's never been in it) — so toggling back and forth
  // never loses what was typed.
  function switchToRelative(row: Minyan) {
    mergeDraft(row.id, { clockTime: row.time })
    const draft = drafts[row.id]
    setRelative(row.id, draft?.anchor ?? 'sunset', draft?.direction ?? 'before', draft?.magnitudeText ?? '0')
  }

  // `extraPatch` lets a caller fold in another field change (e.g. a new
  // tefillah) atomically with the mode switch — combining them into the one
  // updateRow call below, rather than two separate calls in the same handler,
  // which would each read the pre-update `rows` closure and the second would
  // silently clobber the first's change.
  function switchToClock(row: Minyan, extraPatch: Partial<Omit<Minyan, 'id'>> = {}) {
    mergeDraft(row.id, {
      anchor: row.anchor,
      direction: (row.offsetMinutes ?? 0) < 0 ? 'before' : (row.offsetMinutes ?? 0) > 0 ? 'after' : drafts[row.id]?.direction,
      magnitudeText: row.anchor ? String(Math.abs(row.offsetMinutes ?? 0)) : drafts[row.id]?.magnitudeText,
    })
    const clockTime = drafts[row.id]?.clockTime ?? ''
    updateRow(row.id, { anchor: undefined, offsetMinutes: undefined, time: clockTime, ...extraPatch })
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
          const draft = drafts[row.id]
          // The draft (once anything's been typed this session) is the raw
          // source of truth for these three — NOT re-derived from the row's
          // committed offsetMinutes, or clearing the offset input to type a
          // fresh value would immediately snap back to "0" every render (see
          // setRelative — it keeps the draft in sync with every keystroke,
          // including a transient empty string, right alongside the row).
          const direction: Direction = draft?.direction ?? ((row.offsetMinutes ?? 0) <= 0 ? 'before' : 'after')
          const magnitudeText = draft?.magnitudeText ?? String(Math.abs(row.offsetMinutes ?? 0))
          const anchor = draft?.anchor ?? row.anchor ?? 'sunset'

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
                  // atomically with the tefillah change (see switchToClock).
                  if (isRelative && !RELATIVE_ELIGIBLE.includes(tefillah)) {
                    switchToClock(row, { tefillah })
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
                <div className="flex rounded-md border border-slate-300 overflow-hidden shrink-0">
                  {([[false, 'Clock time'], [true, 'Sunset/Havdalah…']] as const).map(([relative, lbl]) => (
                    <button
                      key={lbl}
                      type="button"
                      onClick={() => (relative ? switchToRelative(row) : switchToClock(row))}
                      className={[
                        'px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap',
                        isRelative === relative ? 'bg-primary text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
                      ].join(' ')}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => removeRow(row.id)}
                className="text-red-400 hover:text-red-600 transition-colors cursor-pointer shrink-0 text-sm leading-none ml-auto"
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
                  onChange={(e) => setClockTime(row.id, e.target.value)}
                  placeholder="e.g. 7:00am"
                  className={`${inputClass} w-28`}
                />
              ) : (
                <>
                  <input
                    type="number"
                    min={0}
                    value={magnitudeText}
                    onChange={(e) => setRelative(row.id, anchor, direction, e.target.value)}
                    className={`${inputClass} w-16`}
                    aria-label="Offset in minutes"
                  />
                  <span className="text-xs text-muted">min</span>
                  <select
                    value={direction}
                    onChange={(e) => setRelative(row.id, anchor, e.target.value as Direction, magnitudeText)}
                    className={inputClass}
                  >
                    <option value="before">before</option>
                    <option value="after">after</option>
                  </select>
                  <select
                    value={anchor}
                    onChange={(e) => setRelative(row.id, e.target.value as ZmanAnchor, direction, magnitudeText)}
                    className={inputClass}
                  >
                    {ZMAN_ANCHOR_ORDER.map((a) => (
                      <option key={a} value={a}>
                        {ZMAN_ANCHOR_LABELS[a]}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-muted italic">→ {row.time}</span>
                </>
              )}

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

            {/* Line 3: day chips */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-xs text-muted shrink-0 mr-1">Days:</span>
              {ALL_MINYAN_DAYS.map((day) => {
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
