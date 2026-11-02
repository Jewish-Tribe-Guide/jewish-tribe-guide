'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useOwnHead } from './AdminUI'

// A place opened from To do, as the boards draw every kind of it (canvas
// RHnm5WvGCsVa86Dam8rtmL: M2First, N6Desk, R1Women to R6After, L3NewPlace,
// L5Feedback). On a phone: the chevron and the name in a bar across the
// top, then "Category · See the listing" with "N of M" beside it in grey,
// the switches, a white card with the field in its own editor, the source
// folded under it, and the answers pinned over the tabs. On a computer: the
// name with that line under it and "N of M" with up and down beside, and
// the answers along the pane's bottom.

export type PlacePosition = { at: number; total: number; back: () => void; prev?: () => void; next?: () => void }

export default function PlaceFrame({
  name,
  subline,
  position,
  switches,
  children,
  source,
  error,
  foot,
  onBack,
}: {
  name: string
  /** "Synagogue · See the listing", or a day for feedback; null for none
   *  (R6Give: giving its menu is a step of its own). */
  subline: ReactNode | null
  position: PlacePosition
  switches?: ReactNode
  children: ReactNode
  /** The folded source card (SourceCard). */
  source?: ReactNode
  error?: string | null
  /** The answers (PlaceButtons). */
  foot?: ReactNode
  /** The phone's chevron, when it steps back inside the place (out of
   *  Give, out of a minyan) rather than to To do. */
  onBack?: () => void
}) {
  useOwnHead()
  const counter = (
    <span className="text-[13.5px] text-slate-500 whitespace-nowrap">
      {position.at + 1} of {position.total}
    </span>
  )
  return (
    <div className="flex flex-col md:h-dvh" data-testid="place-frame">
      <header className="-mx-4 md:mx-0 flex items-center gap-1 min-h-14 bg-white border-b border-slate-200 pl-1 pr-4 md:gap-4 md:px-8 md:py-4">
        <button type="button" onClick={onBack ?? position.back} aria-label={onBack ? 'Back' : 'Back to To do'} className="md:hidden inline-flex items-center justify-center w-11 h-11 shrink-0 text-primary cursor-pointer">
          <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M10 3L5 8l5 5" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="m-0 truncate text-lg md:text-[24px] font-bold text-slate-900">{name}</h1>
          {subline !== null && <p className="max-md:hidden m-0 text-[13.5px] text-slate-500">{subline}</p>}
        </div>
        <div className="max-md:hidden flex items-center gap-2">
          {counter}
          <StepButton label="The place before" onClick={position.prev} d="M4 10l4-4 4 4" />
          <StepButton label="The next place" onClick={position.next} d="M4 6l4 4 4-4" />
        </div>
      </header>
      {subline !== null && (
        <div className="md:hidden flex items-center justify-between gap-3 pt-3 pb-2 text-[13.5px] text-slate-500">
          <span className="min-w-0">{subline}</span>
          {counter}
        </div>
      )}
      <div className={`flex flex-col gap-3 pb-44 ${subline === null ? 'max-md:pt-3' : ''} md:flex-1 md:overflow-y-auto md:px-8 md:py-6`}>
        {switches}
        {children}
        {source}
        {error && <p className="m-0 bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>}
      </div>
      {foot && (
        <div
          role="group"
          aria-label="Decide"
          className="max-md:fixed max-md:inset-x-0 max-md:bottom-[var(--admin-tabs,0px)] z-20 bg-white border-t border-slate-200 px-4 py-3 md:px-8 md:py-5"
        >
          {foot}
        </div>
      )}
    </div>
  )
}

function StepButton({ label, onClick, d }: { label: string; onClick?: () => void; d: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={!onClick}
      onClick={onClick}
      className="inline-flex items-center justify-center size-8 rounded-lg border border-slate-300 bg-white text-slate-700 cursor-pointer disabled:opacity-40 disabled:cursor-default"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d={d} />
      </svg>
    </button>
  )
}

/** "Synagogue · See the listing". */
export function placeSubline(category: string | null | undefined, listingHref: string | null): ReactNode {
  return (
    <>
      {category}
      {category && listingHref && ' · '}
      {listingHref && (
        <Link href={listingHref} target="_blank" className="text-slate-500 underline-offset-2 hover:underline">
          See the listing
        </Link>
      )}
    </>
  )
}

/** The white card a field is answered in, its name over it. */
export function PlaceCard({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={typeof title === 'string' ? title : undefined} className="bg-white border border-slate-200 rounded-[14px] p-4 flex flex-col gap-3">
      {title && <h2 className="m-0 text-[17px] font-bold text-slate-900">{title}</h2>}
      {children}
    </section>
  )
}

/** Where the place is read from, folded to one line: its name, what else,
 *  and when ("didn't load since Oct 22" in brown). Opens to the link and
 *  what can be done with it (O1Women), or why it can't be read (O2Pizza). */
export function SourceCard({ name, rest, failed, children }: { name: ReactNode; rest?: ReactNode; failed?: string | null; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <section aria-label="Where it’s read from" className="bg-white border border-slate-200 rounded-[14px]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        disabled={!children}
        className="w-full flex items-start gap-2.5 px-4 py-3 min-h-11 text-left text-[14px] text-slate-600 cursor-pointer disabled:cursor-default"
      >
        {children && (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={`mt-1 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-90' : ''}`}>
            <path d="M6 3l5 5-5 5" />
          </svg>
        )}
        <span className="min-w-0">
          <span className="font-bold text-slate-900">{name}</span>
          {rest}
          {failed && (
            <>
              {' · '}
              <span className="font-bold text-amber-800">{failed}</span>
            </>
          )}
        </span>
      </button>
      {open && children && <div className="flex flex-col gap-1.5 px-4 pb-3.5 pl-[42px] text-[14px]">{children}</div>}
    </section>
  )
}

/** `computerOnly`: Cancel, which a phone does with the header's chevron. */
export type PlaceButton = { label: string; onClick?: () => void; href?: string; busy?: string | false; disabled?: boolean; computerOnly?: boolean }

const PILL = 'inline-flex items-center justify-center min-h-[46px] px-6 rounded-full text-[15px] font-bold cursor-pointer disabled:opacity-60 disabled:cursor-default'

/** The answers: the first blue and full width on a phone, the rest white
 *  under it, two side by side; on a computer all in a row. */
export function PlaceButtons({ buttons }: { buttons: PlaceButton[] }) {
  const [first, ...rest] = buttons
  if (!first) return null
  const one = (b: PlaceButton, primary: boolean) => {
    const look = `${PILL} ${primary ? 'w-full md:w-auto bg-primary text-white' : 'flex-1 md:flex-none bg-white text-primary border border-slate-300'} ${b.computerOnly ? 'max-md:hidden' : ''}`
    return b.href ? (
      <a key={b.label} href={b.href} className={look}>
        {b.label}
      </a>
    ) : (
      <button key={b.label} type="button" onClick={b.onClick} disabled={b.disabled || !!b.busy} className={look}>
        {b.busy || b.label}
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-2 md:flex-row md:gap-3">
      {one(first, true)}
      {rest.length > 0 && <div className={`flex gap-2 md:gap-3 ${rest.every((b) => b.computerOnly) ? 'max-md:hidden' : ''}`}>{rest.map((b) => one(b, false))}</div>}
    </div>
  )
}
