'use client'

import { useState, type ReactNode } from 'react'

// ── A place's boxes, opened on its kind's page (OpenedPlace.tsx) ────────────
// The pieces the Watches job pages shared (agreed Oct 21), kept for the
// kind pages when those went (Oct 26): a box per part of the listing a
// source reads, and in it the listing's rows, marked by what the source
// says: a new one highlighted, a changed one highlighted with "was …", one
// going crossed out with why ("Not on the menu"). One highlight colour, and
// no New or Changed tags.

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
      {/* Capped, so a long rule ("Approximately 45 minutes before
          shkiya") wraps rather than squeezing the name to a word a line. */}
      <span className="max-w-[10rem] text-right tabular-nums sm:max-w-[16rem]">
        {right}
        {was && <s className="block text-xs text-slate-500">{was}</s>}
      </span>
    </li>
  )
}
