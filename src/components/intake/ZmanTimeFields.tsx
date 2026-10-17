'use client'

import { useState } from 'react'
import { formatAnchorRule, RELATIVE_ELIGIBLE, ZMAN_ANCHOR_LABELS, type MinyanBounds, type Tefillah, type ZmanAnchor } from '@/lib/davening'

// ── A minyan's time: a clock time, or minutes from a zman ───────────────────
// Shared by the regular davening times (MinyanimInput) and a Yom Tov's
// special times (SchedulesInput), so the two editors set a time the same
// way. Lifted out of MinyanimInput, whose comments it keeps.

export { RELATIVE_ELIGIBLE }

export const ZMAN_ANCHOR_ORDER: ZmanAnchor[] = ['sunset', 'candle_lighting', 'havdalah']

export type Direction = 'before' | 'after'

/** The fields of a row this module reads and writes. */
export type TimeRow = {
  id: string
  tefillah: Tefillah
  time: string
  anchor?: ZmanAnchor
  offsetMinutes?: number
  notBefore?: string
  notAfter?: string
}

type TimePatch = Partial<Omit<TimeRow, 'id'>>

/** What a row's OTHER mode last held, so switching Clock ↔ Relative and back
 *  restores it instead of losing it (a misclick shouldn't cost your data).
 *  `magnitudeText` is a raw string, not a number, so the offset input can be
 *  emptied out to type a fresh value instead of being stuck showing "0". */
type Draft = {
  clockTime?: string
  anchor?: ZmanAnchor
  direction?: Direction
  magnitudeText?: string
  notBefore?: string
  notAfter?: string
}

/** A row's bounds as a standalone MinyanBounds, for handing to
 *  formatAnchorRule without dragging the whole row along. */
function boundsOf(row: TimeRow | undefined): MinyanBounds {
  return { notBefore: row?.notBefore, notAfter: row?.notAfter }
}

/**
 * The time-setting rules, as patches for the caller to apply to its row.
 * Relative rows keep `time` auto-generated from anchor + offsetMinutes (via
 * formatAnchorRule) rather than hand-typed — see davening.ts for why: every
 * existing display/sort call site reads `time` as plain text, so this is
 * what lets a calculated clock time be layered on top without touching them.
 */
export function useTimeModes() {
  // Keyed by row id — not part of the row, never saved. See Draft above.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const mergeDraft = (id: string, patch: Draft) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }))

  return {
    /** What the relative controls show. The draft (once anything's been
     *  typed this session) is the raw source of truth for these three — NOT
     *  re-derived from the row's committed offsetMinutes, or clearing the
     *  offset input to type a fresh value would immediately snap back to
     *  "0" every render (setRelative keeps the draft in sync with every
     *  keystroke, including a transient empty string, right alongside the
     *  row). */
    view(row: TimeRow, defaultAnchor: ZmanAnchor = 'sunset') {
      const draft = drafts[row.id]
      return {
        direction: draft?.direction ?? (((row.offsetMinutes ?? 0) <= 0 ? 'before' : 'after') as Direction),
        magnitudeText: draft?.magnitudeText ?? String(Math.abs(row.offsetMinutes ?? 0)),
        anchor: draft?.anchor ?? row.anchor ?? defaultAnchor,
      }
    },

    setRelative(row: TimeRow, anchor: ZmanAnchor, direction: Direction, magnitudeText: string): TimePatch {
      mergeDraft(row.id, { anchor, direction, magnitudeText })
      const offsetMinutes = (direction === 'before' ? -1 : 1) * (Number(magnitudeText) || 0)
      // Bounds carried through rather than re-derived: formatAnchorRule
      // builds the whole `time` string, so omitting them here would silently
      // strip the "(between 5:00 PM and 7:00 PM)" off the moment anyone
      // nudged the offset.
      return { anchor, offsetMinutes, time: formatAnchorRule(anchor, offsetMinutes, boundsOf(row)) }
    },

    /** Applies one end of the window and regenerates `time` from it. An
     *  empty input clears that bound rather than storing "", so "no limit"
     *  stays a missing field everywhere downstream instead of a falsy
     *  string. Null for a row with no zman to bound. */
    setBound(row: TimeRow, patch: MinyanBounds): TimePatch | null {
      if (!row.anchor) return null
      const bounds: MinyanBounds = { ...boundsOf(row), ...patch }
      if (!bounds.notBefore) bounds.notBefore = undefined
      if (!bounds.notAfter) bounds.notAfter = undefined
      mergeDraft(row.id, bounds)
      return { ...bounds, time: formatAnchorRule(row.anchor, row.offsetMinutes ?? 0, bounds) }
    },

    setClockTime(row: TimeRow, time: string): TimePatch {
      mergeDraft(row.id, { clockTime: time })
      return { time }
    },

    // Switching modes stashes the row's current values as that mode's
    // draft first, then restores whatever the OTHER mode last held (or a
    // sensible default for a row that's never been in it) — so toggling
    // back and forth never loses what was typed.
    switchToRelative(row: TimeRow, defaultAnchor: ZmanAnchor = 'sunset'): TimePatch {
      mergeDraft(row.id, { clockTime: row.time })
      const draft = drafts[row.id]
      const anchor = draft?.anchor ?? defaultAnchor
      const direction = draft?.direction ?? 'before'
      const magnitudeText = draft?.magnitudeText ?? '0'
      const offsetMinutes = (direction === 'before' ? -1 : 1) * (Number(magnitudeText) || 0)
      const bounds: MinyanBounds = { notBefore: draft?.notBefore, notAfter: draft?.notAfter }
      mergeDraft(row.id, { anchor, direction, magnitudeText })
      return { anchor, offsetMinutes, ...bounds, time: formatAnchorRule(anchor, offsetMinutes, bounds) }
    },

    switchToClock(row: TimeRow): TimePatch {
      mergeDraft(row.id, {
        anchor: row.anchor,
        direction: (row.offsetMinutes ?? 0) < 0 ? 'before' : (row.offsetMinutes ?? 0) > 0 ? 'after' : drafts[row.id]?.direction,
        magnitudeText: row.anchor ? String(Math.abs(row.offsetMinutes ?? 0)) : drafts[row.id]?.magnitudeText,
        notBefore: row.notBefore,
        notAfter: row.notAfter,
      })
      // Bounds cleared, not carried: they clamp a zman that moves, and a
      // fixed clock time has nothing to clamp. Stashed in the draft just
      // above, so toggling back restores them like everything else here.
      return { anchor: undefined, offsetMinutes: undefined, notBefore: undefined, notAfter: undefined, time: drafts[row.id]?.clockTime ?? '' }
    },
  }
}

/** Clock time, or a zman. */
export function TimeModeToggle({ relative, label, onClock, onRelative }: { relative: boolean; label: string; onClock: () => void; onRelative: () => void }) {
  return (
    <div className="flex rounded-md border border-slate-300 overflow-hidden shrink-0">
      {([[false, 'Clock time'], [true, label]] as const).map(([isRelative, lbl]) => (
        <button
          key={lbl}
          type="button"
          onClick={isRelative ? onRelative : onClock}
          className={[
            'px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap',
            relative === isRelative ? 'bg-primary text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
          ].join(' ')}
        >
          {lbl}
        </button>
      ))}
    </div>
  )
}

/** "10 min before Sunset → 10 min before Sunset": the offset, which way,
 *  and which zman, with the rule it makes. A compact control cluster instead
 *  of prose crammed into a time box (see davening.ts's ZmanAnchor for why). */
export function RelativeTimeFields({
  anchors,
  anchor,
  direction,
  magnitudeText,
  time,
  inputClass,
  onChange,
}: {
  anchors: readonly ZmanAnchor[]
  anchor: ZmanAnchor
  direction: Direction
  magnitudeText: string
  time: string
  inputClass: string
  onChange: (anchor: ZmanAnchor, direction: Direction, magnitudeText: string) => void
}) {
  return (
    <>
      <input
        type="number"
        min={0}
        value={magnitudeText}
        onChange={(e) => onChange(anchor, direction, e.target.value)}
        className={`${inputClass} w-16`}
        aria-label="Offset in minutes"
      />
      <span className="text-xs text-muted">min</span>
      <select value={direction} onChange={(e) => onChange(anchor, e.target.value as Direction, magnitudeText)} className={inputClass} aria-label="Before or after">
        <option value="before">before</option>
        <option value="after">after</option>
      </select>
      {anchors.length > 1 ? (
        <select value={anchor} onChange={(e) => onChange(e.target.value as ZmanAnchor, direction, magnitudeText)} className={inputClass} aria-label="Zman">
          {anchors.map((a) => (
            <option key={a} value={a}>
              {ZMAN_ANCHOR_LABELS[a]}
            </option>
          ))}
        </select>
      ) : (
        <span className="text-sm text-slate-700">{ZMAN_ANCHOR_LABELS[anchor].toLowerCase()}</span>
      )}
      <span className="text-xs text-muted italic">→ {time}</span>
    </>
  )
}
