'use client'

import { useId, useState } from 'react'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import type { Finding, FindingLine } from '@/lib/watchFindings'

// ── A finding to check, on its job page (step 6, the user, Oct 21) ──────────
// What a watch found that differs from the listing, beside what the listing
// says: "Compare" opens it, in place on a computer and as its own screen on
// a phone. A tick per line, as Main dishes unticks a wrong dish: untick one
// and "Update 2 on the listing" becomes "Update 1". "Skip for now" keeps it
// out of To check until its source says something new, the way the daily
// run never files the same suggestion twice. Nothing goes to the
// moderation queue; "the queue keeps what people send in".
//
// Update is the queue's own approval (PATCH /api/admin/submissions/:id), so
// everything an approval does still happens: the listing is dated, the
// history records who approved it, and the site is refreshed. With a line
// unticked it sends `only`, and the unticked lines stay as the listing says.

export type Decision = 'approved' | 'rejected'

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** "its page says" in a sentence; a name keeps its capital. */
const saysInLine = (says: string) => says.replace(/^Its /, 'its ')
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** Longer than this, before and after together, and the line doesn't quote them. */
const SHORT = 140

/** The finding in a line, for its place's row. */
export function findingSummary(f: Finding): string {
  if (f.operation === 'delete') return f.notes[0] ?? `${capital(f.from)} suggests taking it off the guide.`
  if (f.operation === 'create') return `Suggested as a new listing, from ${f.from}.`
  // Led by what it says, not by what it leaves empty (maybe added since).
  const first = f.lines.find((l) => !l.empties) ?? f.lines[0]
  if (!first) return `${capital(f.from)} suggests a change to the listing.`
  const more = f.lines.length > 1 ? ` And ${f.lines.length - 1} more.` : ''
  // A whole schedule is Compare's to show, not the line's.
  if (first.before.length + first.after.length > SHORT) return `${first.label}: ${saysInLine(f.says)} something different from the listing.${more}`
  return `${first.label}: ${saysInLine(f.says)} ${first.after}. The listing says ${first.before}.${more}`
}

/** What deciding did, in a line, once it's done. */
export function decidedLine(f: Finding, d: Decision): string {
  if (d === 'rejected') return `Skipped. Not shown again unless ${f.from} says something new.`
  if (f.operation === 'delete') return 'Taken off the guide. It’s archived, and can be restored.'
  return f.operation === 'create' ? 'Added to the guide.' : 'Updated on the listing.'
}

function LineRow({ line, says, on, busy, onToggle }: { line: FindingLine; says: string; on: boolean; busy: boolean; onToggle: () => void }) {
  const id = useId()
  return (
    <li className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 py-2 sm:grid-cols-[1.25rem_9rem_minmax(0,1fr)_minmax(0,1fr)]" data-testid="finding-line">
      {line.choosable ? (
        <input id={id} type="checkbox" checked={on} disabled={busy} onChange={onToggle} className="mt-0.5 h-4 w-4 accent-primary" />
      ) : (
        <span aria-hidden="true" />
      )}
      <label htmlFor={line.choosable ? id : undefined} className="font-medium text-slate-900">
        {line.label}
      </label>
      <span className={`col-start-2 whitespace-pre-line [overflow-wrap:anywhere] sm:col-start-auto ${on ? 'text-slate-600' : 'text-slate-900'}`}>
        <span className="block text-xs text-slate-500 sm:hidden">The listing says</span>
        {line.before}
      </span>
      <span className="col-start-2 whitespace-pre-line [overflow-wrap:anywhere] sm:col-start-auto">
        <span className="block text-xs text-slate-500 sm:hidden">{says}</span>
        <span className={on ? 'text-slate-900' : 'text-slate-400 line-through'}>{line.after}</span>
      </span>
      {line.empties && (
        <span className="col-start-2 text-xs text-muted sm:col-[2/-1]">Empty in what was read. Tick it to empty the listing&rsquo;s too.</span>
      )}
    </li>
  )
}

export default function FindingCompare({
  finding: f,
  token,
  community,
  jobName,
  decided,
  onDecided,
}: {
  finding: Finding
  token: string
  community: string
  /** The job page's name, for the phone screen's way back. */
  jobName: string
  /** Decided here already, this visit. */
  decided?: Decision
  onDecided: (d: Decision) => void
}) {
  const [open, setOpen] = useState(false)
  // A line that would empty the listing starts unticked.
  const [off, setOff] = useState<ReadonlySet<string>>(() => new Set(f.lines.filter((l) => l.empties).map((l) => l.key)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (decided) {
    return (
      <p className="text-sm font-medium text-slate-700" data-testid="finding-decided">
        {decidedLine(f, decided)}
      </p>
    )
  }

  const choosable = f.lines.filter((l) => l.choosable)
  const ticked = choosable.filter((l) => !off.has(l.key))
  // The lines that change: those ticked, and those that come with them.
  const n = f.lines.length - (choosable.length - ticked.length)
  const toggle = (key: string) =>
    setOff((o) => {
      const next = new Set(o)
      if (!next.delete(key)) next.add(key)
      return next
    })

  async function decide(d: Decision) {
    setError(null)
    setBusy(true)
    try {
      const body = d === 'rejected' ? { status: 'rejected' } : off.size ? { status: 'approved', only: ticked.map((l) => l.key) } : { status: 'approved' }
      await fetchJson(
        withCommunity(`/api/admin/submissions/${f.id}`, community),
        { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        'Could not save that.',
      )
      setOpen(false)
      onDecided(d)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2" data-testid="finding">
        <p className="min-w-0 flex-1 text-sm text-amber-900">{findingSummary(f)}</p>
        <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100">
          Compare
        </button>
      </div>
    )
  }

  const update = f.operation === 'delete' ? 'Take it off the guide' : f.operation === 'create' ? 'Add it to the guide' : f.lines.length ? `Update ${n} on the listing` : 'Update the listing'
  return (
    <div
      role="region"
      aria-label={`${f.name}: what ${f.from} says`}
      className="space-y-3 max-sm:fixed max-sm:inset-0 max-sm:z-50 max-sm:overflow-y-auto max-sm:bg-white max-sm:px-4 max-sm:pb-8 max-sm:pt-[max(1rem,env(safe-area-inset-top))] sm:rounded-md sm:border sm:border-amber-200 sm:bg-white sm:p-3"
      data-testid="finding-open"
    >
      <button type="button" onClick={() => setOpen(false)} className="text-sm font-semibold text-primary hover:underline sm:hidden">
        ‹ {jobName}
      </button>
      <div>
        <p className="font-semibold text-slate-900 sm:hidden">{f.name}</p>
        <p className="text-sm text-slate-600">
          From {f.from}, read {day(f.at)}
        </p>
      </div>
      {f.lines.length > 0 && (
        <div className="text-sm">
          <div className="hidden grid-cols-[1.25rem_9rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 border-b border-slate-200 pb-1 text-xs font-semibold text-slate-500 sm:grid" aria-hidden="true">
            <span />
            <span />
            <span>The listing says</span>
            <span>{f.operation === 'create' ? 'It would say' : f.says}</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {f.lines.map((l) => (
              <LineRow key={l.key} line={l} says={f.operation === 'create' ? 'It would say' : f.says} on={!off.has(l.key)} busy={busy} onToggle={() => toggle(l.key)} />
            ))}
          </ul>
          {f.operation === 'update' && choosable.length < f.lines.length && <p className="pt-1 text-xs text-muted">A line with no tick comes with the rest.</p>}
        </div>
      )}
      {f.notes.length > 0 && (
        <ul className="space-y-0.5 text-xs text-slate-600">
          {f.notes.map((note) => (
            <li key={note} className="whitespace-pre-line break-words">
              {note}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy || (f.lines.length > 0 && n === 0)} onClick={() => void decide('approved')} className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50">
          {busy ? 'Saving…' : update}
        </button>
        <button type="button" disabled={busy} onClick={() => void decide('rejected')} className="text-sm font-medium text-muted hover:text-slate-800 disabled:opacity-50">
          Skip for now
        </button>
        <button type="button" onClick={() => setOpen(false)} className="hidden text-sm font-medium text-muted hover:text-slate-800 sm:inline">
          Close
        </button>
      </div>
      <p className="text-xs text-muted">
        {f.operation === 'delete'
          ? 'It’s archived, and can be restored.'
          : `${f.operation === 'create' ? 'Adding it' : 'Updating'} dates the listing as confirmed${f.named ? ` by ${f.named}` : ''} today.`}
      </p>
    </div>
  )
}
