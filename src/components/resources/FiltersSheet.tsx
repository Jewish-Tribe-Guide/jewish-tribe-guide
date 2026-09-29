'use client'

import { useEffect } from 'react'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { useIsMobile } from '@/lib/useIsMobile'
import MobileSheet from './MobileSheet'

// ── Every filter a category page has, in one place ───────────────────────────
// Opened from Filters in the list heading (ListHeading), the same place on
// every category page. Open now and each yes/no the category keeps are
// switches; each pick-list is a row of chips that look like switches too:
// white with a border when off, filled blue with a tick when on, and they
// stay on. Example searches under the search box look like searches instead
// (grey, a magnifier), so the two never get mistaken for each other.
//
// A sheet from the bottom on a phone, a dialog on a wider screen. The list
// updates as each one is switched; "Show N listings" just closes.

export type FilterSelect = {
  key: string
  label: string
  values: string[]
  chosen: string[]
}

type Props = {
  isOpen: boolean
  onClose: () => void
  /** Whether the category keeps hours to filter on. */
  hasOpenNow: boolean
  openNow: boolean
  onOpenNow: () => void
  booleans: { key: string; label: string; on: boolean }[]
  onBoolean: (key: string) => void
  selects: FilterSelect[]
  onSelect: (key: string, value: string) => void
  onClearAll: () => void
  /** What the list holds with these filters: "Show 11 listings". */
  count: number
}

export default function FiltersSheet(props: Props) {
  const isMobile = useIsMobile()
  const body = <FiltersBody {...props} />
  return isMobile ? (
    <MobileSheet isOpen={props.isOpen} onClose={props.onClose} title="Filters">
      {body}
    </MobileSheet>
  ) : (
    <FiltersDialog isOpen={props.isOpen} onClose={props.onClose}>
      {body}
    </FiltersDialog>
  )
}

function FiltersBody({ hasOpenNow, openNow, onOpenNow, booleans, onBoolean, selects, onSelect, onClearAll, onClose, count }: Props) {
  const anyOn = openNow || booleans.some((b) => b.on) || selects.some((s) => s.chosen.length > 0)
  return (
    <div className="space-y-4">
      {/* Always takes its line, and only shows once something is on: a
          line appearing on the first tap pushed every switch below it down,
          so a second tap landed on the wrong one. */}
      <div className={`-mt-1 flex justify-end ${anyOn ? '' : 'invisible'}`}>
        <button type="button" onClick={onClearAll} className="cursor-pointer text-sm font-bold text-primary hover:underline">
          Clear all
        </button>
      </div>
      {hasOpenNow && <SwitchRow label="Open now" on={openNow} onToggle={onOpenNow} />}
      {booleans.map((b) => (
        <SwitchRow key={b.key} label={b.label} on={b.on} onToggle={() => onBoolean(b.key)} />
      ))}
      {selects.map((s) => (
        <fieldset key={s.key} className="space-y-2">
          <legend className="mb-2 text-[13px] font-bold text-slate-500">{s.label}</legend>
          <div className="flex flex-wrap gap-2">
            {orderForPicking(s.values).map((v) => (
              <FilterChip key={v} label={v} on={s.chosen.includes(v)} onToggle={() => onSelect(s.key, v)} />
            ))}
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        onClick={onClose}
        className="h-12 w-full cursor-pointer rounded-xl bg-primary text-[15.5px] font-bold text-white transition-transform active:scale-[0.99]"
      >
        Show {count} listing{count === 1 ? '' : 's'}
      </button>
    </div>
  )
}

/** A pick-list's values in the order the sheet offers them: alphabetical,
 *  with "Other…" last, whatever order the admin entered them in. Stable, so
 *  people find a value in the same place every time, and plainly not a
 *  ranking of one over another. */
function orderForPicking(values: readonly string[]): string[] {
  const isOther = (v: string) => /^other\b/i.test(v.trim())
  return [...values].sort((a, b) => Number(isOther(a)) - Number(isOther(b)) || a.localeCompare(b))
}

function SwitchRow({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-[15px] font-semibold text-ink">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onToggle}
        className={`relative h-[26px] w-11 shrink-0 cursor-pointer rounded-full transition-colors ${on ? 'bg-primary' : 'bg-slate-300'}`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-[left] ${on ? 'left-[21px]' : 'left-[3px]'}`}
        />
      </button>
    </div>
  )
}

/** One filter as a switch-looking chip: white with a border when off, filled
 *  blue with a tick when on. Used in the sheet and, for whatever is switched
 *  on, under the list heading, where a tap switches it off again. */
export function FilterChip({
  label,
  on,
  onToggle,
  dot,
}: {
  label: string
  on: boolean
  onToggle: () => void
  /** Open now's green dot, while it's off. */
  dot?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={[
        'flex h-[34px] shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border text-[13.5px] transition-colors',
        on
          ? 'border-primary bg-primary pl-2.5 pr-3 font-bold text-white'
          : 'border-slate-300 bg-white px-3 font-semibold text-ink hover:bg-slate-50',
      ].join(' ')}
    >
      {on ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : dot ? (
        <span aria-hidden="true" className="mr-0.5 h-[7px] w-[7px] rounded-full bg-green-600" />
      ) : null}
      {label}
    </button>
  )
}

/** The sheet on a wider screen: a dialog over the dimmed list, closed by its
 *  ✕, the backdrop or Escape, like the page's other dialogs. */
function FiltersDialog({ isOpen, onClose, children }: { isOpen: boolean; onClose: () => void; children: React.ReactNode }) {
  useBodyScrollLock(isOpen)
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])
  if (!isOpen) return null
  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 px-4 pt-[12vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div role="dialog" aria-modal="true" aria-label="Filters" className="dialog-in flex max-h-[76vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-extrabold text-ink">Filters</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-2 flex cursor-pointer items-center justify-center rounded-full p-2 text-muted hover:text-slate-700"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pt-4 pb-5">{children}</div>
      </div>
    </div>
  )
}
