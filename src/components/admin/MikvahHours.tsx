'use client'

import { noteChanged, type HoursRow } from '@/lib/hoursSections'
import type { Watch } from '@/lib/watches'
import { samePage } from '@/lib/hoursJob'
import type { Finding } from '@/lib/watchFindings'
import { BoxRow, BoxRows } from './JobBoxes'
import type { HoursPlace } from './watchJobTypes'

// ── Mikvah hours: a mikvah's listing sections (Oct 22) ──────────────────────
// Drawn on artifact 7MUNppcA4S4yvXKupEKJPR (agreed Oct 21): a box per
// section the listing has (Women’s, Men’s, Keilim), each with its Hours and
// its Notes, a changed day beside what it was, a changed note highlighted
// whole with the old one struck under it. A mikvah opened on its kind's
// page (OpenedPlace.tsx) draws its sections with these.

/** A section as the listing has it (the hours route's `sections`). */
export type ListedSection = { section: string; label: string; hours: string | null; notes: string | null; labels?: string[]; now: Record<string, unknown> }
/** A mikvah as Mikvah hours shows it: its listing's sections too. */
export type MikvahPlace = HoursPlace & { sections?: ListedSection[] }

const readOf = (w: Watch) => (w.lastRunAt && w.lastCheck && w.lastCheck.result !== 'nothing' && w.lastCheck.result !== 'unreadable' ? w.lastCheck : null)

/** The sections a page's last read gave: a line it read starts with one
 *  of a section's field names ("Women’s Hours, Sun–Thu: …"). */
export function sectionsRead(w: Watch, sections: readonly ListedSection[]): string[] {
  const lines = readOf(w)?.read ?? []
  return sections.filter((s) => (s.labels ?? []).some((l) => lines.some((r) => r.startsWith(`${l}:`) || r.startsWith(`${l},`)))).map((s) => s.section)
}

/** The page named for each section: the one its waiting update came from,
 *  else the first that reads it. */
export function sectionPages(pages: readonly Watch[], sections: readonly ListedSection[], findings: readonly Finding[]): Map<string, Watch> {
  const out = new Map<string, Watch>()
  for (const s of sections) {
    const from = findings.find((f) => f.section === s.section && f.page)
    const named = from && pages.find((w) => samePage(w.url, from.page!))
    const first = pages.find((w) => sectionsRead(w, sections).includes(s.section))
    const page = named ?? first
    if (page) out.set(s.section, page)
  }
  return out
}

export function Rows({ rows }: { rows: readonly HoursRow[] }) {
  return (
    <div>
      <h4 className="pb-0.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Hours</h4>
      <BoxRows>
        {rows.map((r, i) => (
          <BoxRow key={i} name={r.days} right={r.text} mark={r.mark} was={r.was} />
        ))}
      </BoxRows>
    </div>
  )
}

/** The section's note: changed, the new one highlighted whole, the old one
 *  struck under it. */
export function Notes({ now, next }: { now: string; next: string }) {
  if (!now && !next) return null
  const changed = noteChanged(now, next)
  return (
    <div>
      <h4 className="pb-0.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Notes</h4>
      <BoxRows>
        <li className={`border-t border-slate-100 py-1.5 text-sm whitespace-pre-line ${changed ? '-mx-2 bg-amber-50 px-2' : ''}`} data-testid="box-note" data-mark={changed ? 'changed' : 'same'}>
          <span className="text-slate-900">{next || 'None'}</span>
          {changed && now && <s className="mt-1 block text-xs text-slate-500">{now}</s>}
        </li>
      </BoxRows>
    </div>
  )
}
