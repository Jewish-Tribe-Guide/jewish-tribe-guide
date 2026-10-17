'use client'

import { useEffect, useRef, useState } from 'react'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { useIsMobile } from '@/lib/useIsMobile'
import MobileSheet from './MobileSheet'
import BackIconButton from '@/components/BackIconButton'
// The same order as the list's own groups, so a denomination sits in the
// same place in both.
import { orderForPicking } from '@/lib/listGroups'

// ── Every filter a category page has, in one place ───────────────────────────
// Opened from Filters in the list heading (ListHeading), the same place on
// every category page. Open now and each yes/no the category keeps are
// switches; each pick-list is a row of chips that look like switches too:
// white with a border when off, filled blue with a tick when on, and they
// stay on. Example searches under the search box look like searches instead
// (grey, a magnifier), so the two never get mistaken for each other.
//
// "Has" (Oct 13), for a category that keeps an item list (Grocery's items,
// Food's dishes): the 8 most common, each with how many places have it,
// then "All N items" opens every one, A to Z, with a box to find one. A
// search for an item ticks it here, the same as tapping it.
//
// A sheet from the bottom on a phone, a dialog on a wider screen. The list
// updates as each one is switched; "Show N listings" just closes.

export type FilterItems = {
  key: string
  label: string
  /** Every item, with how many listings have it, most first. */
  counts: { tag: string; count: number }[]
  chosen: string[]
}

/** How many of the most common items show before "All N items". */
export const TOP_ITEMS = 8

export type FilterSelect = {
  key: string
  label: string
  values: string[]
  chosen: string[]
  /** Chips in the order given (the Minyanim view's Tefillah, the order a
   *  day goes), not A to Z. */
  ordered?: boolean
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
  /** "Has": each item list's items. */
  items?: FilterItems[]
  onItem?: (key: string, tag: string) => void
  onClearAll: () => void
  /** What the list holds with these filters: "Show 11 listings". */
  count: number
  /** What the list holds, where it isn't listings: ['minyan', 'minyanim']. */
  units?: [string, string]
}

export default function FiltersSheet(props: Props) {
  const isMobile = useIsMobile()
  // "All N items", A to Z, in place of the rest of the sheet. Held here, not
  // in the body, because it's a step inside the sheet: its name ("Has")
  // takes the sheet's title, with Back before it, the way the "+ Add" box's
  // own steps do. It used to sit under "Filters" as a second heading with a
  // back chip of its own — two titles and two ways back, stacked (Oct 15).
  const [allOf, setAllOf] = useState<string | null>(null)
  const all = props.items?.find((i) => i.key === allOf)
  // Closed and opened again, it starts from the whole list. Reset on the
  // way in rather than the way out, so the phone's sheet doesn't turn back
  // into "Filters" while it slides away.
  const { isOpen, onClose } = props
  const [wasOpen, setWasOpen] = useState(isOpen)
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen) setAllOf(null)
  }
  const title = all ? all.label : 'Filters'
  const back = all ? () => setAllOf(null) : undefined
  const body = <FiltersBody {...props} all={all} onAll={setAllOf} />
  // Drags down to close, like the phone's other sheets (Oct 6).
  return isMobile ? (
    <MobileSheet isOpen={isOpen} onClose={onClose} title={title} onBack={back} draggable>
      {body}
    </MobileSheet>
  ) : (
    <FiltersDialog isOpen={isOpen} onClose={onClose} title={title} onBack={back}>
      {body}
    </FiltersDialog>
  )
}

function FiltersBody({
  hasOpenNow,
  openNow,
  onOpenNow,
  booleans,
  onBoolean,
  selects,
  onSelect,
  items = [],
  onItem,
  onClearAll,
  onClose,
  count,
  units,
  all,
  onAll,
}: Props & { all: FilterItems | undefined; onAll: (key: string) => void }) {
  const anyOn = openNow || booleans.some((b) => b.on) || selects.some((s) => s.chosen.length > 0) || items.some((i) => i.chosen.length > 0)
  if (all) return <AllItems key={all.key} items={all} onItem={(tag) => onItem?.(all.key, tag)} onClose={onClose} count={count} units={units} />
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
            {(s.ordered ? s.values : orderForPicking(s.values)).map((v) => (
              <FilterChip key={v} label={v} on={s.chosen.includes(v)} onToggle={() => onSelect(s.key, v)} />
            ))}
          </div>
        </fieldset>
      ))}
      {items.map((it) => {
        // The most common, and anything ticked further down the list, so
        // what's on is always in view.
        const top = it.counts.slice(0, TOP_ITEMS)
        const shown = [...top, ...it.counts.filter((c) => it.chosen.includes(c.tag) && !top.includes(c))]
        return (
          <fieldset key={it.key} className="space-y-2">
            <legend className="mb-2 text-[13px] font-bold text-slate-500">{it.label}</legend>
            <div className="flex flex-wrap gap-2">
              {shown.map((c) => (
                <FilterChip key={c.tag} label={c.tag} count={c.count} on={it.chosen.includes(c.tag)} onToggle={() => onItem?.(it.key, c.tag)} />
              ))}
            </div>
            {it.counts.length > TOP_ITEMS && (
              <button
                type="button"
                onClick={() => onAll(it.key)}
                className="mt-1 flex cursor-pointer items-center gap-1 text-sm font-bold text-primary hover:underline"
              >
                All {it.counts.length} items
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            )}
          </fieldset>
        )
      })}
      <ShowButton count={count} onClose={onClose} units={units} />
    </div>
  )
}

function ShowButton({ count, onClose, units = ['listing', 'listings'] }: { count: number; onClose: () => void; units?: [string, string] }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="h-12 w-full cursor-pointer rounded-xl bg-primary text-[15.5px] font-bold text-white transition-transform active:scale-[0.99]"
    >
      Show {count} {count === 1 ? units[0] : units[1]}
    </button>
  )
}

/** Every item in one list, A to Z, with how many places have each; the box
 *  finds one. Ticking one here is the same as ticking it in the sheet. Its
 *  name and Back are the sheet's own header, so it opens on the box. */
function AllItems({ items, onItem, onClose, count, units }: { items: FilterItems; onItem: (tag: string) => void; onClose: () => void; count: number; units?: [string, string] }) {
  const [find, setFind] = useState('')
  const wanted = find.trim().toLowerCase()
  // Opened from partway down the sheet: starts at its own top.
  const top = useRef<HTMLDivElement>(null)
  useEffect(() => {
    top.current?.scrollIntoView?.({ block: 'start' })
  }, [])
  const rows = [...items.counts].sort((a, b) => a.tag.localeCompare(b.tag)).filter((c) => !wanted || c.tag.toLowerCase().includes(wanted))
  return (
    <div ref={top} className="scroll-mt-4 space-y-3" data-testid="all-items">
      <label className="flex h-11 items-center gap-2 rounded-xl border border-slate-300 px-3 focus-within:ring-2 focus-within:ring-primary/30">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-4 w-4 shrink-0 text-slate-400">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="search"
          value={find}
          onChange={(e) => setFind(e.target.value)}
          placeholder="Find an item"
          aria-label="Find an item"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-slate-400 focus:outline-none"
        />
      </label>
      <ul className="divide-y divide-slate-100 border-y border-slate-100">
        {rows.map((c) => {
          const on = items.chosen.includes(c.tag)
          return (
            <li key={c.tag}>
              <label className="flex h-11 cursor-pointer items-center gap-3">
                <input type="checkbox" checked={on} onChange={() => onItem(c.tag)} className="h-5 w-5 shrink-0 cursor-pointer accent-primary" />
                <span className={`flex-1 text-[15px] text-ink ${on ? 'font-bold' : ''}`}>{c.tag}</span>
                <span className="text-[13.5px] text-slate-500 tabular-nums">{c.count}</span>
              </label>
            </li>
          )
        })}
        {rows.length === 0 && <li className="py-3 text-[14px] text-slate-500">No item called “{find.trim()}”.</li>}
      </ul>
      <ShowButton count={count} onClose={onClose} units={units} />
    </div>
  )
}

export function SwitchRow({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
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
  count,
}: {
  label: string
  on: boolean
  onToggle: () => void
  /** Open now's green dot, while it's off. */
  dot?: boolean
  /** How many listings have it ("Challah 10"). */
  count?: number
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
      {count !== undefined && <span className={`ml-0.5 font-medium ${on ? 'text-white/80' : 'text-slate-500'}`}>{count}</span>}
    </button>
  )
}

/** The sheet on a wider screen: a dialog over the dimmed list, closed by its
 *  ✕, the backdrop or Escape, like the page's other dialogs. `title` and
 *  `onBack` are for a step inside it ("‹ Has"), as on the phone's sheet. */
export function FiltersDialog({
  isOpen,
  onClose,
  children,
  wide = false,
  title = 'Filters',
  onBack,
}: {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
  title?: string
  onBack?: () => void
}) {
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
      <div role="dialog" aria-modal="true" aria-label={title} className={`dialog-in flex max-h-[76vh] w-full flex-col rounded-2xl bg-white shadow-xl ${wide ? 'max-w-xl' : 'max-w-md'}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex min-w-0 items-center gap-2">
            {onBack && <BackIconButton onClick={onBack} />}
            <h2 className="truncate text-lg font-extrabold text-ink">{title}</h2>
          </div>
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
