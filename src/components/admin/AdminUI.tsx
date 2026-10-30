'use client'

import { createContext, useContext, useLayoutEffect, useState } from 'react'
import Link from 'next/link'

// The console's one look for boxes, rows and empty screens (the admin
// redesign's step 1): white boxes with a quiet border, one row style with a
// name, one line under it and a chevron, and empty screens that say so in a
// box of the same shape.

export function AdminBox({
  title,
  count,
  action,
  foldOnPhone = false,
  children,
}: {
  title?: string
  count?: number
  /** Something short on the right of the title, such as "+ Add a field". */
  action?: React.ReactNode
  /** On a phone the box is one row, its title and count, and opens in
   *  place (board 2); on a computer it's always open. */
  foldOnPhone?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const heading = (
    <>
      <h2 className="flex-1 m-0 text-base font-bold text-slate-900">{title}</h2>
      {count !== undefined && <AdminCount n={count} />}
      {action}
    </>
  )
  return (
    <section aria-label={title} className="bg-white border border-slate-200 rounded-[10px]">
      {title && foldOnPhone && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`sm:hidden w-full flex items-center gap-2.5 px-4 py-3.5 min-h-[52px] text-left cursor-pointer ${open ? 'border-b border-slate-100' : ''}`}
        >
          {heading}
          <span className={open ? 'rotate-90' : ''}>
            <Chevron />
          </span>
        </button>
      )}
      {title && <div className={`${foldOnPhone ? 'hidden sm:flex' : 'flex'} items-center gap-2.5 px-4 py-3.5 border-b border-slate-100`}>{heading}</div>}
      {foldOnPhone ? <div className={open ? '' : 'hidden sm:block'}>{children}</div> : children}
    </section>
  )
}

export function AdminCount({ n }: { n: number }) {
  return (
    <span className="text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-2 py-px">
      {n}
    </span>
  )
}

/** Tells the frame a screen brings its own heading and way back, so the
 *  frame's own heading steps aside (AdminFrame). */
export const AdminOwnHead = createContext<((by: number) => void) | null>(null)

const BACK_CHEVRON = (
  <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="md:hidden">
    <path d="M10 3L5 8l5 5" />
  </svg>
)

/** A screen with a way back (boards 19b and 19c, Oct 29): on a phone the
 *  chevron in a bar across the top, then the title; on a computer "‹ Name"
 *  over the title. The way back goes one step up, to `back`. `phoneOnly`:
 *  the way back is the phone's alone, where the computer's sidebar or tabs
 *  already show it. */
export function AdminHead({
  back,
  title,
  right,
  phoneOnly = false,
}: {
  back: { label: string; href?: string; onClick?: () => void }
  title: React.ReactNode
  right?: React.ReactNode
  phoneOnly?: boolean
}) {
  const linkClass = `inline-flex items-center justify-center w-11 h-11 shrink-0 text-primary cursor-pointer md:mr-auto md:justify-start md:w-auto md:h-auto md:min-h-11 md:-mt-3 md:text-sm md:font-semibold ${
    phoneOnly ? 'md:hidden' : ''
  }`
  const inner = (
    <>
      {BACK_CHEVRON}
      <span className="sr-only md:not-sr-only">‹ {back.label}</span>
    </>
  )
  return (
    <header className="-mx-4 flex items-center gap-1 min-h-14 bg-white border-b border-slate-200 pl-1 pr-4 md:mx-0 md:flex-wrap md:gap-x-3 md:gap-y-0 md:min-h-0 md:bg-transparent md:border-0 md:p-0">
      {back.href ? (
        <Link href={back.href} className={linkClass}>
          {inner}
        </Link>
      ) : (
        <button type="button" onClick={back.onClick} className={linkClass}>
          {inner}
        </button>
      )}
      <h1 className="flex-1 min-w-0 m-0 truncate text-lg font-bold text-slate-900 md:order-last md:basis-full md:whitespace-normal md:text-[26px]">{title}</h1>
      {right}
    </header>
  )
}

/** AdminHead, for a screen inside an area: the frame's own heading steps
 *  aside while it shows. */
export function AdminBack(props: React.ComponentProps<typeof AdminHead>) {
  const own = useContext(AdminOwnHead)
  useLayoutEffect(() => {
    if (!own) return
    own(1)
    return () => own(-1)
  }, [own])
  return <AdminHead {...props} />
}

/** Where there's no room for the page beside (a phone, a narrow window):
 *  the page full size (boards 21b and 21c). */
export function AdminPreviewButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white text-[15px] font-bold text-primary cursor-pointer"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
        <circle cx="8" cy="8" r="2" />
      </svg>
      Preview
    </button>
  )
}

export function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#94a3b8" strokeWidth="1.8" aria-hidden="true" className="shrink-0">
      <path d="M6 4l4 4-4 4" />
    </svg>
  )
}

const rowClass =
  'w-full flex items-center gap-3 px-4 py-2.5 min-h-[52px] border-b border-slate-100 last:border-b-0 text-left text-slate-900 hover:bg-slate-50 cursor-pointer'

/** One row: a name, at most one line under it, something short on the
 *  right, and a chevron. The whole row is the link, or a button with
 *  `onClick`. */
export function AdminRow({
  href,
  onClick,
  label,
  name,
  line,
  aside,
}: {
  href?: string
  onClick?: () => void
  /** The row's accessible name, when its text alone isn't one. */
  label?: string
  name: React.ReactNode
  line?: React.ReactNode
  aside?: React.ReactNode
}) {
  const inside = (
    <>
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{name}</span>
        {line && <span className="text-[13px] text-slate-600">{line}</span>}
      </span>
      {aside && <span className="text-[13px] text-slate-600">{aside}</span>}
      <Chevron />
    </>
  )
  if (onClick || !href) {
    return (
      <button type="button" onClick={onClick} aria-label={label} className={rowClass}>
        {inside}
      </button>
    )
  }
  return (
    <Link href={href} aria-label={label} className={rowClass}>
      {inside}
    </Link>
  )
}

/** Under a list cut short: "N more" opens the rest, and "Show fewer"
 *  folds it back. */
export function MoreToggle({ open, more, onToggle }: { open: boolean; more: number; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="w-full flex items-center gap-1.5 px-4 py-3 min-h-11 text-left text-sm text-slate-600 hover:bg-slate-50 cursor-pointer"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d={open ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'} />
      </svg>
      {open ? 'Show fewer' : `${more} more`}
    </button>
  )
}

/** The rows of a box, the first few shown and the rest behind "N more". */
export function AdminRows<T>({ items, shown = 4, children }: { items: T[]; shown?: number; children: (item: T) => React.ReactNode }) {
  const [all, setAll] = useState(false)
  const rest = items.length - shown
  return (
    <>
      {(all || rest <= 0 ? items : items.slice(0, shown)).map(children)}
      {rest > 0 && <MoreToggle open={all} more={rest} onToggle={() => setAll((a) => !a)} />}
    </>
  )
}

/** An empty screen or list: one short line, in the same box as everything
 *  else. To do's lists say "Nothing to do." */
export function AdminEmpty({ children = 'Nothing to do.' }: { children?: React.ReactNode }) {
  return (
    <p className="bg-white border border-slate-200 rounded-[10px] px-4 py-6 text-center text-[15px] text-slate-600">
      {children}
    </p>
  )
}

export const adminInputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[15px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary'

/** A labelled input: the label above, the input under it. */
export function AdminField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[13px] font-semibold text-slate-700 mb-1.5">{label}</span>
      {children}
    </label>
  )
}

/** An on/off switch, named by `label`. */
export function AdminSwitch({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors cursor-pointer ${checked ? 'bg-primary' : 'bg-slate-300'}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}
