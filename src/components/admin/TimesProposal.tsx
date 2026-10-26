'use client'

import type { ReactNode } from 'react'
import type { SpecialSchedule } from '@/lib/schedules'
import { usualProposal, type ProposalRow, type RowGroup } from '@/lib/timesProposal'
import { TIMES_PARTS, partsFromRead, type PartGiven, type TimesPart } from '@/lib/timesParts'
import type { Watch } from '@/lib/watches'
import { samePage } from '@/lib/hoursJob'
import type { Finding } from '@/lib/watchFindings'
import type { Minyan } from '@/lib/davening'
import { BoxRow, BoxRows } from './JobBoxes'
import type { HoursPlace } from './watchJobTypes'

// ── Shul times: a shul's listing boxes (Oct 21) ─────────────────────────────
// Drawn on artifact B3vwpSiqwdK833s9VAVHBc (v13, approved Oct 21): a
// reading is one of three updates, each in a box named for the part of the
// listing it changes: Usual weekday times, Usual Shabbos times, This week's
// schedule (timesParts.ts). Its rows marked, a changed time beside the
// listing's old one. A shul opened on its kind's page (OpenedPlace.tsx)
// draws its boxes with these.

type Listed = { key: string; minyanim: Minyan[]; schedules: SpecialSchedule[] }
/** A shul as Shul times shows it: its listing's times too. */
export type ShulPlace = HoursPlace & { times?: Listed | null }

const readOf = (w: Watch) => (w.lastRunAt && w.lastCheck && w.lastCheck.result !== 'nothing' && w.lastCheck.result !== 'unreadable' ? w.lastCheck : null)

/** The parts a page gave on its last read: kept with the read since Oct
 *  21, worked out from its lines before then. */
const partsOf = (w: Watch): PartGiven[] => {
  const c = readOf(w)
  return c ? (c.parts ?? partsFromRead(c.read)) : []
}

/** The page named for each part: the one its waiting update came from, else
 *  the page that gives the most of it, as fileParts files it. */
export function partPages(pages: readonly Watch[], findings: readonly Finding[]): Map<TimesPart, Watch> {
  const out = new Map<TimesPart, Watch>()
  for (const part of TIMES_PARTS) {
    const from = findings.find((f) => f.part === part && f.page)
    const named = from && pages.find((w) => samePage(w.url, from.page!))
    const most = pages
      .map((w) => ({ w, size: partsOf(w).find((g) => g.part === part)?.size ?? 0 }))
      .filter((x) => x.size > 0)
      .sort((a, b) => b.size - a.size)[0]?.w
    const page = named ?? most
    if (page) out.set(part, page)
  }
  return out
}

export function Groups<R>({ groups, row }: { groups: RowGroup<R>[]; row: (r: R, i: number) => ReactNode }) {
  return (
    <>
      {groups.map((g) => (
        <div key={g.label}>
          <h4 className="pb-0.5 text-xs font-semibold uppercase tracking-wider text-slate-500">{g.label}</h4>
          <BoxRows>{g.rows.map(row)}</BoxRows>
        </div>
      ))}
    </>
  )
}

/** One usual minyan: its name, its season and note under it, its time on
 *  the right, and what changed beside what it was. */
export function UsualRow({ r }: { r: ProposalRow }) {
  const sub = [r.season, r.note].filter(Boolean).join(' · ')
  const was = [r.was?.days, r.was?.season, r.was?.note].filter((w): w is string => !!w)
  return (
    <BoxRow
      name={r.tefillah}
      sub={
        (sub || was.length > 0) && (
          <>
            {sub}
            {was.map((w) => (
              <s key={w} className="ml-1.5">
                {w}
              </s>
            ))}
          </>
        )
      }
      right={r.when}
      mark={r.status}
      why="Not on their website"
      was={r.was?.when}
    />
  )
}

/** A usual part's rows, the website's against the listing's. */
export const usualRows = (part: 'weekday' | 'shabbos', current: readonly Minyan[], proposed: readonly Minyan[]): ProposalRow[] => usualProposal(current, proposed).find((b) => b.box === part)?.rows ?? []
