'use client'

import { useState, type ReactNode } from 'react'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { schedulesKey, type SpecialSchedule } from '@/lib/schedules'
import { boxPill, groupedRows, scheduleProposal, usualProposal, type ProposalRow, type RowGroup } from '@/lib/timesProposal'
import { TIMES_PARTS, TIMES_PART_LABELS, isDatedLine, partsFromRead, type PartGiven, type TimesPart } from '@/lib/timesParts'
import { minyanWriting } from '@/lib/minyanText'
import { watchHealth, type Watch } from '@/lib/watches'
import { samePage } from '@/lib/hoursJob'
import { updatesPill } from '@/lib/dishProposal'
import type { Finding, FindingTimes } from '@/lib/watchFindings'
import type { CategoryConfig } from '@/lib/categories'
import type { Minyan } from '@/lib/davening'
import type { DirectoryResource } from '@/types'
import BoxEditSheet, { type BoxEdit } from '@/components/resources/BoxEditSheet'
import FindingCompare, { type Decision } from './FindingCompare'
import { GivePage, day, shortUrl, type JobStatus } from './JobPage'
import { Box, BoxActions, BoxRow, BoxRows, LINK, PlaceRow, Reads, SourceLine, type ReadPage, type Tone } from './JobBoxes'
import type { HoursPlace } from './HoursJob'
import ContactBoxes, { givesContact, isContactFinding } from './ContactBoxes'

// ── Shul times: a shul opened, as its listing's own boxes (Oct 21) ──────────
// Drawn on artifact B3vwpSiqwdK833s9VAVHBc (v13, approved Oct 21), on the
// pieces every job page shares (JobBoxes.tsx). A reading is one of three
// updates, each in a box named for the part of the listing it changes:
// Usual weekday times, Usual Shabbos times, This week's schedule
// (timesParts.ts). One with an update comes first and open, its rows marked
// (a changed time beside the listing's old one), then Use this / Edit /
// Keep the listing, then the page it came from. Decided, it closes and says
// so ("Used Oct 21") under the ones still to decide. A usual part a page
// gives that matches the listing is a closed "Same" box, the listing's
// times under it. Reads is last: the switch, a line per page naming the
// parts it gives, and Add a page · Read them now · Open its listing.

type Settled = ReadonlyMap<string, Decision>
type Listed = { key: string; minyanim: Minyan[]; schedules: SpecialSchedule[] }
/** A shul as Shul times shows it: its listing's times too. */
export type ShulPlace = HoursPlace & { times?: Listed | null }
type PartFinding = Finding & { part: TimesPart; times: FindingTimes }

const isPart = (f: Finding): f is PartFinding => f.operation === 'update' && !!f.part && !!f.times
const loads = (w: Watch, now: number) => !['failing', 'stale'].includes(watchHealth(w, now).state)
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

/** Why a place has nothing to read, said short: its row's pill, and its
 *  website's line in Reads. */
export function cantRead(reason: string | null): { pill: string; short: string } {
  const r = reason ?? ''
  if (/turned the reader away/.test(r)) return { pill: 'Turned the reader away', short: 'turned away' }
  if (/no davening times/.test(r)) return { pill: 'No times found', short: 'no times' }
  if (/no weekly hours/.test(r)) return { pill: 'No hours found', short: 'no hours' }
  if (/No website/.test(r)) return { pill: 'No website', short: '' }
  if (/Not searched yet/.test(r)) return { pill: 'Not searched yet', short: 'not searched yet' }
  if (/took too long|didn’t answer in time/.test(r)) return { pill: 'Too slow to read', short: 'too slow' }
  if (/didn’t load/.test(r)) return { pill: 'Didn’t load', short: 'didn’t load' }
  if (/wouldn’t open/.test(r)) return { pill: 'Wouldn’t open', short: 'wouldn’t open' }
  return { pill: 'Can’t be read', short: 'can’t be read' }
}

const today = () => day(new Date().toISOString())
/** A box decided this visit: "Used Oct 21", "Kept Oct 21", a week's
 *  "Skipped Oct 21". */
const doneText = (d: Decision, part?: TimesPart) => `${d === 'approved' ? 'Used' : part === 'week' ? 'Skipped' : 'Kept'} ${today()}`

/** Its row's pill. */
export function shulPill(p: HoursPlace, status: JobStatus, reading: boolean, settled: Settled): { text: string; tone: Tone } {
  const findings = p.findings ?? []
  const waiting = findings.filter((f) => !settled.has(f.id))
  if (status === 'off') return { text: 'Not read', tone: 'grey' }
  if (reading) return { text: 'Reading…', tone: 'grey' }
  if (findings.length && !waiting.length) return { text: `${findings.some((f) => settled.get(f.id) === 'approved') ? 'Used' : 'Kept'} ${today()}`, tone: 'grey' }
  if (waiting.length) return { text: updatesPill(waiting.length), tone: 'amber' }
  if (status === 'not_read') return { text: 'Not read yet', tone: 'grey' }
  if (status === 'didnt_load') return { text: 'Didn’t load', tone: 'red' }
  if (status === 'cant_read') return { text: cantRead(p.reason).pill, tone: 'grey' }
  if (status === 'differs') return { text: 'In the queue', tone: 'amber' }
  if (status === 'unsure') return { text: 'Couldn’t compare', tone: 'amber' }
  return { text: 'Same', tone: 'green' }
}

function Groups<R>({ groups, row }: { groups: RowGroup<R>[]; row: (r: R, i: number) => ReactNode }) {
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
function UsualRow({ r }: { r: ProposalRow }) {
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
const usualRows = (part: 'weekday' | 'shabbos', current: readonly Minyan[], proposed: readonly Minyan[]): ProposalRow[] => usualProposal(current, proposed).find((b) => b.box === part)?.rows ?? []

/** This week's: each day the website posts, a time it gives instead of the
 *  usual one beside it, and what comes off. */
function WeekRows({ t }: { t: FindingTimes }) {
  const { weeks, gone } = scheduleProposal(t.currentSchedules, t.proposedSchedules, t.proposed)
  return (
    <>
      {weeks.map((w) => (
        <div key={w.title} className="grid gap-2.5">
          {(weeks.length > 1 || !w.isWeek) && <p className="text-sm font-semibold text-slate-900">{w.title}</p>}
          <Groups groups={w.days} row={(r, i) => <BoxRow key={i} name={r.what} sub={r.note} right={r.when} mark={r.usually ? 'changed' : 'same'} was={r.usually} />} />
        </div>
      ))}
      {gone.length > 0 && (
        <BoxRows>
          {gone.map((g) => (
            <BoxRow key={g} name={g} mark="gone" why="Taken off" />
          ))}
        </BoxRows>
      )}
    </>
  )
}

/** One update: its part's rows, its three choices, and where it's from. */
function PartBox({ f, decided, busy, at, onUse, onEdit, onKeep }: { f: PartFinding; decided?: Decision; busy: boolean; at: string; onUse: () => void; onEdit?: () => void; onKeep: () => void }) {
  const t = f.times
  const part = f.part
  const week = part === 'week'
  const rows = part === 'week' ? [] : usualRows(part, t.current, t.proposed)
  const what = week ? scheduleProposal(t.currentSchedules, t.proposedSchedules, t.proposed).weeks[0]?.range : boxPill(rows)
  return (
    <Box name={TIMES_PART_LABELS[f.part]} pill={decided ? { text: doneText(decided, f.part), tone: 'grey' } : { text: what ?? 'Update', tone: 'amber' }} defaultOpen={!decided}>
      {week ? <WeekRows t={t} /> : <Groups groups={groupedRows(rows)} row={(r, i) => <UsualRow key={i} r={r} />} />}
      {!decided && <BoxActions busy={busy} onUse={onUse} onEdit={onEdit} onKeep={onKeep} {...(week ? { use: 'Use this week', keep: 'Skip this week' } : {})} />}
      {/* A newsletter's has no page: "From its newsletter". */}
      <SourceLine url={f.page} what={f.page ? shortUrl(f.page) : f.from === 'its website' ? 'their website' : f.from} at={at} />
    </Box>
  )
}

export function ShulRow({
  place: p,
  status,
  busy,
  reading,
  token,
  community,
  jobName,
  settled,
  words,
  now,
  onAct,
  onDecided,
}: {
  place: ShulPlace
  status: JobStatus
  busy: boolean
  /** Being read now, on its own (a page found and not read yet). */
  reading: boolean
  token: string
  community: string
  jobName: string
  settled: Settled
  words: { pageLabel: string; placeholder: string }
  now: number
  onAct: (body: Record<string, unknown>) => void
  onDecided: (f: Finding, d: Decision) => void
}) {
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<{ item: DirectoryResource; category: CategoryConfig; edit: BoxEdit } | null>(null)
  const off = status === 'off'
  const findings = p.findings ?? []
  const parts = findings.filter(isPart)
  const contacts = findings.filter(isContactFinding)
  const others = findings.filter((f) => !isPart(f) && !isContactFinding(f))
  const live = p.pages.filter((x) => x.watch.active).map((x) => x.watch)
  const named = partPages(live, findings)
  const headers = { Authorization: `Bearer ${token}` }
  const readAt = (url?: string) => (url ? live.find((x) => samePage(x.url, url))?.lastCheck?.at : undefined)

  async function decide(f: Finding, body: Record<string, unknown>, d: Decision) {
    setError(null)
    setSaving(f.id)
    try {
      await fetchJson(withCommunity(`/api/admin/submissions/${f.id}`, community), { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 'Could not save that.')
      onDecided(f, d)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.')
    } finally {
      setSaving(null)
    }
  }

  /** Edit: the listing's own box editor for the part, filled in with the
   *  website's version, saved straight to the listing. */
  async function edit(f: PartFinding, weeks: readonly string[]) {
    setError(null)
    try {
      const { item, category } = await fetchJson<{ item: DirectoryResource; category: CategoryConfig }>(withCommunity(`/api/admin/watches/hours?job=times&item=${p.id}`, community), { headers }, 'Could not open its times.')
      const field = category.detailFields.find((x) => x.key === f.times.field.key)
      if (!field) return
      const key = field.key
      const sk = schedulesKey(key)
      setEditing({
        item,
        category,
        edit: {
          title: TIMES_PART_LABELS[f.part],
          fields: [field],
          minyanimBox: f.part === 'week' ? 'this_week' : f.part,
          writing: minyanWriting,
          weeks,
          preset: f.part === 'week' ? { [sk]: f.times.proposedSchedules } : { [key]: f.times.proposed },
          save: {
            label: 'Save to the listing',
            via: async ({ payload }) => {
              const d = (payload.details ?? {}) as Record<string, unknown>
              return fetch(withCommunity(`/api/admin/submissions/${f.id}`, community), {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'approved', payload: { details: { [key]: d[key], [sk]: d[sk] } } }),
              })
            },
            onSaved: () => {
              setEditing(null)
              onDecided(f, 'approved')
            },
          },
        },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open its times.')
    }
  }

  // Updates still to decide first, then the ones decided this visit.
  const ordered = [...parts].sort((a, b) => Number(settled.has(a.id)) - Number(settled.has(b.id)) || TIMES_PARTS.indexOf(a.part) - TIMES_PARTS.indexOf(b.part))
  // A usual part a page gives, with no update: the same as the website.
  const same = (['weekday', 'shabbos'] as const).filter((part) => !parts.some((f) => f.part === part) && named.has(part) && !!p.times && usualRows(part, p.times.minyanim, p.times.minyanim).length > 0)
  // This week's from a page that gave it, with no update waiting: what it
  // read, when that's what the listing has (it agreed, or its update was
  // used since). Rodeph Shalom's and Leyv Ha-Ir's calendars give nothing
  // else, and said "Same" with nothing under it (the user, Oct 22).
  const weekPage = parts.some((f) => f.part === 'week') ? undefined : named.get('week')
  const weekRead = weekPage && readOf(weekPage)
  const weekAgrees = !!weekRead && (weekRead.result === 'agrees' || (p.decided?.status === 'approved' && p.decided.at >= weekRead.at))
  const weekSame = weekAgrees ? weekRead.read.filter(isDatedLine) : []
  const boxes = ordered.length + same.length + (weekSame.length ? 1 : 0) + others.length + contacts.length

  // Reads: a line per page, named for the parts it gives. The pages that
  // give a part first, in the parts' order; then the ones read for nothing;
  // the greyed ones last.
  const pages: ReadPage[] = live
    .map((w) => {
      const c = w.lastCheck
      const given = TIMES_PARTS.filter((part) => named.get(part)?.id === w.id)
      const failed = !loads(w, now)
      const read = readOf(w)
      const none = failed || (!!c && !read && !givesContact(w))
      const names = [...given.map((part) => TIMES_PART_LABELS[part]), ...(p.contact && givesContact(w) ? [p.contact.name] : [])]
      const page: ReadPage = {
        key: w.id,
        url: w.url,
        label: !failed && (read || names.length) ? (names.length ? names.join(' · ') : 'Nothing from it') : '',
        right: off ? '' : failed ? 'didn’t load' : !w.lastRunAt || !c ? 'not read yet' : read || givesContact(w) ? `read ${day(c.at)}` : 'no times',
        none,
        onRemove: off ? undefined : () => onAct({ action: 'stop', id: w.id }),
      }
      return { page, rank: given.length ? TIMES_PARTS.indexOf(given[0]) : none ? TIMES_PARTS.length + 1 : TIMES_PARTS.length }
    })
    .sort((a, b) => a.rank - b.rank)
    .map(({ page }) => page)
  if (!p.pages.length && p.website) pages.push({ key: 'website', url: p.website, label: '', right: cantRead(p.reason).short, none: true })
  const unsure = status === 'unsure' ? live.flatMap((w) => readOf(w)?.read ?? []) : []

  return (
    <PlaceRow name={p.name} pill={shulPill(p, status, reading, settled)} back={jobName}>
      {ordered.map((f) => {
        const t = f.times
        const posted = f.part === 'week' ? t.proposedSchedules.filter((s) => !t.currentSchedules.some((c) => JSON.stringify(c) === JSON.stringify(s))) : []
        return (
          <PartBox
            // Decided, it closes.
            key={settled.has(f.id) ? `${f.id}-done` : f.id}
            f={f}
            decided={settled.get(f.id)}
            busy={busy || saving === f.id}
            at={readAt(f.page) ?? f.at}
            onUse={() => void decide(f, { status: 'approved' }, 'approved')}
            onEdit={f.part !== 'week' || posted.length > 0 ? () => void edit(f, posted.map((s) => s.id)) : undefined}
            onKeep={() => void decide(f, { status: 'rejected' }, 'rejected')}
          />
        )
      })}
      <ContactBoxes placeId={p.id} contact={p.contact ?? null} findings={contacts} pages={live} settled={settled} busy={busy} token={token} community={community} itemUrl="/api/admin/watches/hours?job=times" onDecided={onDecided} show="updates" />
      {same.map((part) => {
        const page = named.get(part)!
        return (
          <Box key={part} name={TIMES_PART_LABELS[part]} pill={{ text: 'Same', tone: 'green' }}>
            <Groups groups={groupedRows(usualRows(part, p.times!.minyanim, p.times!.minyanim))} row={(r, i) => <UsualRow key={i} r={r} />} />
            <SourceLine lead="Same as" url={page.url} at={page.lastCheck?.at} />
          </Box>
        )
      })}
      {weekSame.length > 0 && (
        <Box name={TIMES_PART_LABELS.week} pill={{ text: 'Same', tone: 'green' }}>
          <BoxRows>
            {weekSame.map((line) => {
              const [, what, when] = /^(.*) (\d{1,2}:\d{2} [AP]M)$/.exec(line) ?? [line, line, undefined]
              return <BoxRow key={line} name={what} right={when} />
            })}
          </BoxRows>
          <SourceLine lead="Same as" url={weekPage!.url} at={weekRead!.at} />
        </Box>
      )}
      {/* Its phone, under its times (Shul times' notes, Oct 21); an
          update to it above the Same ones. */}
      <ContactBoxes placeId={p.id} contact={p.contact ?? null} findings={contacts} pages={live} settled={settled} busy={busy} token={token} community={community} itemUrl="/api/admin/watches/hours?job=times" onDecided={onDecided} show="same" />
      {others.map((f) => (
        <Box key={settled.has(f.id) ? `${f.id}-done` : f.id} name={`From ${f.from}`} pill={settled.has(f.id) ? { text: doneText(settled.get(f.id)!), tone: 'grey' } : { text: updatesPill(f.lines.length), tone: 'amber' }} defaultOpen={!settled.has(f.id)}>
          <FindingCompare finding={f} token={token} community={community} jobName={jobName} decided={settled.get(f.id)} onDecided={(d) => onDecided(f, d)} />
        </Box>
      ))}
      {error && <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <Reads
        on={!off}
        busy={busy}
        onSwitch={(on) => onAct({ action: on ? 'on' : 'off' })}
        pages={pages}
        pill={off ? 'Off' : undefined}
        defaultOpen={boxes === 0}
        below={
          <>
            {unsure.length > 0 && (
              <ul className="space-y-0.5 text-sm text-slate-700" data-testid="job-read">
                {unsure.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            {adding && (
              <GivePage
                label={words.pageLabel}
                placeholder={words.placeholder}
                busy={busy}
                onGive={(url) => {
                  setAdding(false)
                  onAct({ action: 'give', url })
                }}
                onCancel={() => setAdding(false)}
              />
            )}
          </>
        }
        links={
          <>
            {!adding && (
              <button type="button" disabled={busy} onClick={() => setAdding(true)} className={LINK}>
                Add a page
              </button>
            )}
            {!off && (
              <button type="button" disabled={busy} onClick={() => onAct({ action: 'check' })} className={LINK}>
                {busy ? 'Reading…' : 'Read them now'}
              </button>
            )}
            <a href={p.href} target="_blank" rel="noopener noreferrer" className={LINK}>
              Open its listing
            </a>
          </>
        }
      />
      {editing && <BoxEditSheet item={editing.item} category={editing.category} edit={editing.edit} onClose={() => setEditing(null)} />}
    </PlaceRow>
  )
}
