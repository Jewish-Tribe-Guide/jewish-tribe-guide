'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'

// ── One page for every job on the Watches tab (the user, Oct 21) ────────────
// "Each listing is there, showing the source reading from, the results, how
// it compares to what we have maybe. A way to have it check again, a way to
// replace the source or add a source it's reading from." So every job's
// page is one list, the same shape: every listing on a row, with how its
// last read compares with the listing, where it read it from, and Check now,
// all without opening it. Opened, a row shows each source: what it read,
// and ways to use a different one, stop it, or add another.
//
// No sections. The rows that need the admin (what was read differs, or
// couldn't be read) come first, the rest A–Z, Off last; in that order for
// the whole visit, so a row acted on doesn't jump away under the admin's
// hand.

/** How a listing's last read compares with the listing. */
export type JobStatus = 'differs' | 'unsure' | 'cant_read' | 'didnt_load' | 'not_read' | 'same' | 'off'

const STATUS: Record<JobStatus, { label: string; tone: string; needsYou: boolean }> = {
  differs: { label: 'Differs from the listing', tone: 'border-amber-300 bg-amber-50 text-amber-900', needsYou: true },
  unsure: { label: 'Couldn’t compare', tone: 'border-amber-300 bg-amber-50 text-amber-900', needsYou: true },
  cant_read: { label: 'Couldn’t read', tone: 'border-amber-300 bg-amber-50 text-amber-900', needsYou: true },
  didnt_load: { label: 'Didn’t load', tone: 'border-red-200 bg-red-50 text-red-800', needsYou: true },
  not_read: { label: 'Not read yet', tone: 'border-slate-200 bg-slate-50 text-slate-700', needsYou: false },
  same: { label: 'Same as the listing', tone: 'border-emerald-200 bg-emerald-50 text-emerald-800', needsYou: false },
  off: { label: 'Off', tone: 'border-slate-200 bg-slate-50 text-slate-500', needsYou: false },
}

export const needsYou = (s: JobStatus) => STATUS[s].needsYou

/** Needs you first, then the rest A–Z, Off last. */
export function jobOrder<T>(rows: readonly T[], status: (r: T) => JobStatus, name: (r: T) => string): T[] {
  const rank = (r: T) => (needsYou(status(r)) ? 0 : status(r) === 'off' ? 2 : 1)
  return [...rows].sort((a, b) => rank(a) - rank(b) || name(a).localeCompare(name(b)))
}

export const BUTTON = 'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50'
const INPUT = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm'

export function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** A page's address without its scheme, for its link. */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
}

export function StatusPill({ status }: { status: JobStatus }) {
  const s = STATUS[status]
  return (
    <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${s.tone}`} data-testid="job-status">
      {s.label}
    </span>
  )
}

export function JobPage({
  backHref,
  title,
  intro,
  needYou,
  total,
  noun,
  notice,
  children,
}: {
  backHref: string
  title: string
  intro: ReactNode
  needYou: number
  total: number
  /** "place", "shul". */
  noun: string
  notice?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="space-y-4">
      <Link href={backHref} className="text-sm font-semibold text-primary hover:underline">
        ‹ Watches
      </Link>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="max-w-[70ch] text-sm text-muted">{intro}</p>
        <p className="text-sm font-semibold text-slate-800" data-testid="job-counts">
          {needYou} need{needYou === 1 ? 's' : ''} you · {total} {total === 1 ? noun : `${noun}s`}
        </p>
      </div>
      {notice}
      {children && <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white shadow-sm">{children}</ul>}
    </div>
  )
}

/** One listing. Closed, it says everything at a glance; `children` is what
 *  opening it shows. `below` (a finding to compare) shows either way. */
export function JobRow({
  name,
  status,
  lines,
  check,
  below,
  defaultOpen = false,
  children,
}: {
  name: string
  status: JobStatus
  lines: ReactNode[]
  /** Check now, or Turn back on for one that's off. */
  check?: { label: string; busy: boolean; onClick: () => void }
  below?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <li className="space-y-2 px-4 py-3" data-testid="job-row">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 basis-60 cursor-pointer items-start gap-2 text-left">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className={`mt-1 shrink-0 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`}>
            <path d="M4 6l4 4 4-4" />
          </svg>
          <span className="min-w-0 space-y-0.5">
            <span className="block font-semibold text-slate-900">{name}</span>
            {lines.map((l, i) => (
              <span key={i} className="block text-sm text-slate-600 [overflow-wrap:anywhere]">
                {l}
              </span>
            ))}
          </span>
        </button>
        <div className="flex items-center gap-2 max-sm:pl-6">
          <StatusPill status={status} />
          {check && (
            <button type="button" disabled={check.busy} onClick={check.onClick} className={BUTTON}>
              {check.busy ? 'Reading…' : check.label}
            </button>
          )}
        </div>
      </div>
      {below && <div className="sm:pl-6">{below}</div>}
      {open && <div className="space-y-3 sm:pl-6">{children}</div>}
    </li>
  )
}

/** One source a listing is read from, opened: where it is and how it was
 *  found, what its last read said beside the listing, and what it read. */
export function SourceCard({
  url,
  how,
  result,
  differences = [],
  read = [],
  actions,
}: {
  url: string
  how: string
  result: string
  differences?: string[]
  read?: string[]
  actions?: ReactNode
}) {
  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-3" data-testid="job-source">
      <p className="text-sm [overflow-wrap:anywhere]">
        <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">
          {shortUrl(url)}
        </a>
        <span className="text-slate-500"> · {how}</span>
      </p>
      <p className="text-sm text-slate-800">{result}</p>
      {differences.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-800">
          {differences.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
      {read.length > 0 && (
        <div className="text-sm" data-testid="job-read">
          <p className="text-xs font-semibold text-slate-500">What it read</p>
          <ul className="space-y-0.5 text-slate-700">
            {read.map((r) => (
              <li key={r} className="whitespace-pre-line">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

/** Give a page to read from: "Add a page", or one to use instead. */
export function GivePage({ label, placeholder, busy, onGive, onCancel }: { label: string; placeholder: string; busy: boolean; onGive: (url: string) => void; onCancel?: () => void }) {
  const [url, setUrl] = useState('')
  return (
    <form
      className="flex flex-wrap gap-2 rounded-md border border-slate-200 bg-slate-50 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (url.trim()) onGive(url.trim())
      }}
    >
      <label className="min-w-0 flex-1 basis-60 text-xs text-slate-600">
        {label}
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={placeholder} className={`mt-1 ${INPUT}`} />
      </label>
      <div className="flex items-end gap-2">
        <button type="submit" disabled={busy || !url.trim()} className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
          Save and read
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={BUTTON}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
