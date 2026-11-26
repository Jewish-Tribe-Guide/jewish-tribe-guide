'use client'

import { useState, type ReactNode } from 'react'
import type { EditorRow } from '@/lib/editorRows'
import type { Attempt } from './sourceActions'

// ── A source, given in the row itself (board N4, Nov 25) ────────────────────
// Where a row needs a source, its opened box has a field under the thin
// line: "A page’s link", or "A page’s link or an email" for this week's
// schedule, opened by "Add a page" (Nov 25: not there till it's asked for).
// Change on a line opens the same field, filled in. No Save, no
// Cancel: the row's Done saves what it holds, and an empty or unchanged
// field changes nothing. It replaces the Change and Add a source screens.

export type FieldSpec = {
  /** What it saves as, within its row: one row can have two (a week's
   *  email and its page). */
  key: string
  /** Filled in with, for a Change: the address it's read from now. */
  value: string
  placeholder: string
  attempt: Attempt
  /** "Stop reading it", beside the field once it's opened from Change. */
  stop?: () => Promise<void>
}

/** What a row's field asks for: this week's schedule can come from an
 *  email; usual times and the rest only from a page (Nov 25). */
export function sourcePlaceholder(row: EditorRow): string {
  return row.week || row.id === 'minyans:this_week' || row.id === 'minyans:next_week' ? 'A page’s link or an email' : 'A page’s link'
}

/** The link that opens a row's field when it has no source yet (Nov 25:
 *  a field only once it's asked for, never sitting there unasked). */
export function addSourceWords(row: EditorRow): string {
  return sourcePlaceholder(row) === 'A page’s link or an email' ? 'Add a page or an email' : 'Add a page'
}

type Open = { value: string; first: string; attempt: Attempt; stop?: () => Promise<void> }

export function useSourceFields() {
  // Per row, by key: the fields showing and what they hold.
  const [open, setOpen] = useState<Record<string, Record<string, Open>>>({})
  const [error, setError] = useState<{ row: string; text: string } | null>(null)

  const set = (row: string, key: string, next: Open | null) =>
    setOpen((o) => {
      const mine = { ...(o[row] ?? {}) }
      if (next) mine[key] = next
      else delete mine[key]
      return { ...o, [row]: mine }
    })

  /** Change on a line: its field, filled in. */
  function reveal(row: EditorRow, spec: FieldSpec) {
    set(row.id, spec.key, { value: spec.value, first: spec.value, attempt: spec.attempt, ...(spec.stop ? { stop: spec.stop } : {}) })
  }

  const isOpen = (row: EditorRow, key: string) => !!open[row.id]?.[key]

  /** The field: shown when it's been revealed, or `shown` (a row with no
   *  source, which needs one). */
  function field(row: EditorRow, spec: FieldSpec, shown = false): ReactNode {
    const now = open[row.id]?.[spec.key]
    if (!now && !shown) return null
    const value = now?.value ?? ''
    const stop = now?.stop
    return (
      <div className="space-y-1.5">
        <input
          value={value}
          onChange={(e) => {
            setError(null)
            set(row.id, spec.key, { value: e.target.value, first: now?.first ?? '', attempt: now?.attempt ?? spec.attempt, ...(stop ? { stop } : {}) })
          }}
          placeholder={spec.placeholder}
          aria-label={spec.placeholder}
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-[0.9375rem] text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none"
          data-testid="source-field"
        />
        {stop && (
          <button
            type="button"
            onClick={() =>
              void stop().then(
                () => set(row.id, spec.key, null),
                (err: unknown) => setError({ row: row.id, text: err instanceof Error ? err.message : 'Could not stop it.' }),
              )
            }
            className="cursor-pointer text-[0.8125rem] font-semibold text-red-700 hover:underline"
          >
            Stop reading it
          </button>
        )}
        {error?.row === row.id && <p className="m-0 text-[0.8125rem] font-semibold text-red-700">{error.text}</p>}
      </div>
    )
  }

  /** Done: each field the row holds, saved; the row stays open, saying
   *  why, if one couldn't be. `shown`: the fields it offers untapped. */
  async function done(row: EditorRow, shown: FieldSpec[] = []): Promise<boolean> {
    const fields: Record<string, Open> = { ...Object.fromEntries(shown.map((f) => [f.key, { value: '', first: '', attempt: f.attempt }])), ...(open[row.id] ?? {}) }
    for (const [key, f] of Object.entries(fields)) {
      const value = f.value.trim()
      if (!value || value === f.first.trim()) {
        set(row.id, key, null)
        continue
      }
      try {
        const result = await f.attempt(value)
        if (result.failed) {
          set(row.id, key, { ...f, first: value, attempt: result.next ?? f.attempt })
          setError({ row: row.id, text: 'Couldn’t read that page' })
          return false
        }
      } catch (err) {
        setError({ row: row.id, text: err instanceof Error ? err.message : 'Could not save it.' })
        return false
      }
      set(row.id, key, null)
    }
    setError(null)
    return true
  }

  return { field, reveal, isOpen, done }
}
