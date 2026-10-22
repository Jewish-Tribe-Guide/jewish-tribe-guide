'use client'

import { useState, type ReactNode } from 'react'
import { day, shortUrl } from './JobPage'

// ── A place opened on a Watches job page, as its listing's own boxes ────────
// (agreed Oct 21, one drawing per page; Main dishes is
// 7EYjgU1WcHrXG2W6Qpigb7). The same pieces on every page:
//   - A place's row: its name and one pill ("1 update", "Same"). Opened on
//     a computer, its boxes show under it; on a phone, on a screen of
//     their own with a way back.
//   - A box per part of the listing a source reads. One with an update
//     comes first and open; one with nothing new sits closed below it.
//   - In a box, the listing's rows, marked by what the source says: a new
//     one highlighted, a changed one highlighted with "was …", one going
//     crossed out with why ("Not on the menu"). One highlight colour, and
//     no New or Changed tags.
//   - Use this / Edit / Keep the listing, then where it's from: "From
//     charliewasasinner.com · read Oct 21".
//   - Reads, last: the Reading switch, a line per page naming what it
//     updated, each with a ×, then Add a page · Read them now · Open its
//     listing.

export const TONE = {
  amber: 'border-amber-300 bg-amber-50 text-amber-900',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  grey: 'border-slate-200 bg-slate-50 text-slate-600',
  red: 'border-red-200 bg-red-50 text-red-800',
} as const
export type Tone = keyof typeof TONE

export const LINK = 'font-semibold text-primary hover:underline disabled:opacity-50'
export const GO = 'rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50'
export const BUTTON = 'rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50'

export function Pill({ tone, children, testId }: { tone: Tone; children: ReactNode; testId?: string }) {
  return (
    <span className={`inline-block shrink-0 whitespace-nowrap rounded-full border px-2 py-px text-xs font-semibold ${TONE[tone]}`} data-testid={testId}>
      {children}
    </span>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className={`shrink-0 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`}>
      <path d="M4 6l4 4 4-4" />
    </svg>
  )
}

/** Reading its pages, on or off. */
export function ReadingSwitch({ on, busy, onChange, label = 'Reading' }: { on: boolean; busy: boolean; onChange: (on: boolean) => void; label?: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={busy} onClick={() => onChange(!on)} className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-semibold text-slate-900 disabled:opacity-50">
      <span aria-hidden="true" className={`relative h-5 w-9 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[1.125rem]' : 'left-0.5'}`} />
      </span>
      {label}
    </button>
  )
}

/** One place on a job page. Opened: its boxes, under it on a computer, on
 *  a screen of their own on a phone ("‹ Main dishes"). */
export function PlaceRow({ name, pill, back, children }: { name: string; pill: { text: string; tone: Tone }; back: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="px-4 py-3" data-testid="job-row">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full cursor-pointer items-center gap-2.5 text-left">
        <span className="max-sm:hidden">
          <Chevron open={open} />
        </span>
        <span className="min-w-0 flex-1 font-bold text-slate-900">{name}</span>
        <Pill tone={pill.tone} testId="job-status">
          {pill.text}
        </Pill>
        <span aria-hidden="true" className="text-slate-400 sm:hidden">
          ›
        </span>
      </button>
      {open && (
        <div
          role="region"
          aria-label={name}
          className="mt-3 space-y-3 max-sm:fixed max-sm:inset-0 max-sm:z-50 max-sm:mt-0 max-sm:overflow-y-auto max-sm:bg-slate-100 max-sm:px-4 max-sm:pb-8 max-sm:pt-[max(1rem,env(safe-area-inset-top))]"
          data-testid="place-open"
        >
          <button type="button" onClick={() => setOpen(false)} className="text-sm font-semibold text-primary hover:underline sm:hidden">
            ‹ {back}
          </button>
          <p className="text-[19px] font-bold text-slate-900 sm:hidden">{name}</p>
          {children}
        </div>
      )}
    </li>
  )
}

/** One part of the listing, as its listing has it. */
export function Box({ name, pill, defaultOpen = false, children, testId = 'job-box' }: { name: string; pill?: { text: string; tone: Tone }; defaultOpen?: boolean; children: ReactNode; testId?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="overflow-hidden rounded-[10px] border border-slate-200 bg-white" data-testid={testId} aria-label={name}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={`flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-left ${open ? 'border-b border-slate-100' : ''}`}>
        <span className="min-w-0 flex-1 text-[15px] font-bold text-slate-900">{name}</span>
        {pill && (
          <Pill tone={pill.tone} testId="box-pill">
            {pill.text}
          </Pill>
        )}
        <Chevron open={open} />
      </button>
      {open && <div className="grid gap-2.5 px-3.5 pb-3.5 pt-1">{children}</div>}
    </section>
  )
}

export type RowMark = 'same' | 'new' | 'changed' | 'gone'

/** A box's rows, with a line under the last. */
export function BoxRows({ children }: { children: ReactNode }) {
  return <ul className="[&>li:last-child]:border-b [&>li:last-child]:border-slate-100">{children}</ul>
}

/** One row: what the listing has, marked by what the source says. */
export function BoxRow({ name, sub, right, mark = 'same', why, was }: { name: ReactNode; sub?: ReactNode; right?: ReactNode; mark?: RowMark; why?: string; was?: ReactNode }) {
  const lit = mark !== 'same'
  return (
    <li
      className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-t border-slate-100 py-1.5 text-sm ${lit ? '-mx-2 bg-amber-50 px-2' : ''}`}
      data-testid="box-row"
      data-mark={mark}
    >
      <span className="min-w-0">
        {mark === 'gone' && why && <span className="mr-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">{why}</span>}
        <span className={mark === 'gone' ? 'text-slate-600 line-through' : 'text-slate-900'}>{name}</span>
        {sub && <span className="block text-[12.5px] text-slate-500">{sub}</span>}
      </span>
      <span className="text-right tabular-nums">
        {right}
        {was && <s className="block text-xs text-slate-500">{was}</s>}
      </span>
    </li>
  )
}

/** Use this, Edit, Keep the listing. */
export function BoxActions({ busy, onUse, onEdit, onKeep }: { busy: boolean; onUse: () => void; onEdit?: () => void; onKeep: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy} onClick={onUse} className={GO}>
        {busy ? 'Saving…' : 'Use this'}
      </button>
      {onEdit && (
        <button type="button" disabled={busy} onClick={onEdit} className={BUTTON}>
          Edit
        </button>
      )}
      <button type="button" disabled={busy} onClick={onKeep} className={BUTTON}>
        Keep the listing
      </button>
    </div>
  )
}

/** Where a box's rows are from: "From charliewasasinner.com · read Oct 21". */
export function SourceLine({ url, what, at, extra }: { url?: string | null; what?: string; at?: string | null; extra?: string }) {
  return (
    <p className="text-[12.5px] text-slate-500 [overflow-wrap:anywhere]" data-testid="box-source">
      From{' '}
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
          {what ?? shortUrl(url)}
        </a>
      ) : (
        what
      )}
      {at && ` · read ${day(at)}`}
      {extra && ` · ${extra}`}
    </p>
  )
}

export type ReadPage = {
  key: string
  url: string | null
  /** What it's called when it has no address: "Photos of the menu". */
  name?: string
  /** Under it: what it is and what it updated ("Menu link · Main dishes"),
   *  or why nothing came from it. */
  label: string
  /** Said in amber: something about the page to look at. */
  warn?: boolean
  /** On its right: "read Oct 21", "no menu". */
  right: string
  /** Greyed: nothing came from it. */
  none?: boolean
  onRemove?: () => void
}

/** Reads, a place's last box: the switch, its pages, and the ways on. */
export function Reads({ on, busy, onSwitch, pages, links, defaultOpen = false, below }: { on: boolean; busy: boolean; onSwitch: (on: boolean) => void; pages: readonly ReadPage[]; links: ReactNode; defaultOpen?: boolean; below?: ReactNode }) {
  return (
    <Box name="Reads" pill={{ text: `${pages.length} page${pages.length === 1 ? '' : 's'}`, tone: 'grey' }} defaultOpen={defaultOpen} testId="job-reads">
      <ReadingSwitch on={on} busy={busy} onChange={onSwitch} />
      {pages.length > 0 && (
        <ul className="text-sm">
          {pages.map((p) => (
            <li key={p.key} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-0.5 border-t border-slate-100 py-1.5 first:border-t-0" data-testid="job-source">
              <span className={`min-w-0 [overflow-wrap:anywhere] ${p.none ? 'text-slate-500' : 'font-semibold text-slate-900'}`}>
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {shortUrl(p.url)}
                  </a>
                ) : (
                  p.name
                )}
                <small className={`block text-[12.5px] font-normal ${p.warn ? 'font-semibold text-amber-800' : 'text-slate-500'}`}>{p.label}</small>
              </span>
              <span className="whitespace-nowrap text-right text-[12.5px] text-slate-500">{p.right}</span>
              {p.onRemove ? (
                <button type="button" aria-label={`Stop reading ${p.url ? shortUrl(p.url) : p.name}`} disabled={busy} onClick={p.onRemove} className="-my-1 -mr-1 inline-flex rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ul>
      )}
      {below}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">{links}</div>
    </Box>
  )
}
