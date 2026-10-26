'use client'

import { useState } from 'react'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { hoursRows, noteChanged, sectionChanges, type HoursRow } from '@/lib/hoursSections'
import { watchHealth, type Watch } from '@/lib/watches'
import { samePage } from '@/lib/hoursJob'
import type { Finding } from '@/lib/watchFindings'
import type { CategoryConfig } from '@/lib/categories'
import type { DirectoryResource } from '@/types'
import BoxEditSheet, { type BoxEdit } from '@/components/resources/BoxEditSheet'
import { sectionEdit, withSave } from './findingEdits'
import FindingCompare, { type Decision } from './FindingCompare'
import { GivePage, day, shortUrl, type JobStatus } from './JobPage'
import { Box, BoxActions, BoxRow, BoxRows, LINK, PlaceRow, Reads, SourceLine, type ReadPage } from './JobBoxes'
import { cantRead, shulPill } from './TimesProposal'
import type { HoursPlace } from './HoursJob'
import { updatesPill } from '@/lib/dishProposal'
import ContactBoxes, { givesContact, isContactFinding } from './ContactBoxes'

// ── Mikvah hours: a mikvah opened, as its listing's own sections (Oct 22) ───
// Drawn on artifact 7MUNppcA4S4yvXKupEKJPR (agreed Oct 21), on the pieces
// every job page shares (JobBoxes.tsx), the same way as Shul times
// (TimesProposal.tsx). A box per section the listing has (Women’s, Men’s,
// Keilim), each with its Hours and its Notes: an update first and open, a
// changed day beside what it was, a changed note highlighted whole with
// the old one struck under it, then Use this / Edit / Keep the listing and
// the page it's from. A section a page gives that matches the listing is a
// closed "Same" box. Reads last.

type Settled = ReadonlyMap<string, Decision>
/** A section as the listing has it (the hours route's `sections`). */
export type ListedSection = { section: string; label: string; hours: string | null; notes: string | null; labels?: string[]; now: Record<string, unknown> }
/** A mikvah as Mikvah hours shows it: its listing's sections too. */
export type MikvahPlace = HoursPlace & { sections?: ListedSection[] }
type SectionFinding = Finding & { section: string; values: Record<string, unknown> }

const loads = (w: Watch, now: number) => !['failing', 'stale'].includes(watchHealth(w, now).state)
const readOf = (w: Watch) => (w.lastRunAt && w.lastCheck && w.lastCheck.result !== 'nothing' && w.lastCheck.result !== 'unreadable' ? w.lastCheck : null)
const today = () => day(new Date().toISOString())
const doneText = (d: Decision) => `${d === 'approved' ? 'Used' : 'Kept'} ${today()}`
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

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

export function MikvahRow({
  place: p,
  status,
  busy,
  reading,
  progress,
  token,
  community,
  jobName,
  settled,
  words,
  now,
  onAct,
  onDecided,
}: {
  place: MikvahPlace
  status: JobStatus
  busy: boolean
  reading: boolean
  // "Reading 2 of 4…" while its pages are read one by one.
  progress?: string
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
  const sections = p.sections ?? []
  const findings = p.findings ?? []
  const isSection = (f: Finding): f is SectionFinding => f.operation === 'update' && !!f.values && sections.some((s) => s.section === f.section)
  const own = findings.filter(isSection)
  const contacts = findings.filter(isContactFinding)
  const others = findings.filter((f) => !isSection(f) && !isContactFinding(f))
  const live = p.pages.filter((x) => x.watch.active).map((x) => x.watch)
  const named = sectionPages(live, sections, findings)
  const headers = { Authorization: `Bearer ${token}` }
  const readAt = (url?: string) => (url ? live.find((x) => samePage(x.url, url))?.lastCheck?.at : undefined)
  const sectionOf = (f: SectionFinding) => sections.find((s) => s.section === f.section)!

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

  /** Edit: the listing's own Edit for the section, filled in with the
   *  website's version, saved straight to the listing. */
  async function edit(f: SectionFinding) {
    setError(null)
    try {
      const { item, category } = await fetchJson<{ item: DirectoryResource; category: CategoryConfig }>(withCommunity(`/api/admin/watches/hours?item=${p.id}`, community), { headers }, 'Could not open its hours.')
      const fe = sectionEdit(f, category, sectionOf(f))
      if (!fe) return
      setEditing({ item, category, edit: withSave(fe, { community, token, onSaved: () => (setEditing(null), onDecided(f, 'approved')) }) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open its hours.')
    }
  }

  // Updates still to decide first, in the listing's order, then the ones
  // decided this visit.
  const order = (f: SectionFinding) => sections.findIndex((s) => s.section === f.section)
  const ordered = [...own].sort((a, b) => Number(settled.has(a.id)) - Number(settled.has(b.id)) || order(a) - order(b))
  // A section a page gives, with no update: the same as the website.
  const same = sections.filter((s) => !own.some((f) => f.section === s.section) && named.has(s.section))
  const boxes = ordered.length + same.length + others.length + contacts.length

  // Reads: a line per page, named for the sections it gives; the pages
  // that give one first, then the ones read for nothing, greyed ones last.
  const pages: ReadPage[] = live
    .map((w) => {
      const c = w.lastCheck
      const given = sections.filter((s) => named.get(s.section)?.id === w.id)
      const failed = !loads(w, now)
      const read = readOf(w)
      const none = failed || (!!c && !read && !givesContact(w))
      const names = [...given.map((s) => s.label), ...(p.contact && givesContact(w) ? [p.contact.name] : [])]
      const page: ReadPage = {
        key: w.id,
        url: w.url,
        label: !failed && (read || names.length) ? (names.length ? names.join(' · ') : 'Nothing from it') : '',
        right: off ? '' : failed ? 'didn’t load' : !w.lastRunAt || !c ? 'not read yet' : read || givesContact(w) ? `read ${day(c.at)}` : 'no hours',
        none,
        onRemove: off ? undefined : () => onAct({ action: 'stop', id: w.id }),
      }
      return { page, rank: given.length ? sections.indexOf(given[0]) : none ? sections.length + 1 : sections.length }
    })
    .sort((a, b) => a.rank - b.rank)
    .map(({ page }) => page)
  if (!p.pages.length && p.website) pages.push({ key: 'website', url: p.website, label: '', right: cantRead(p.reason).short, none: true })
  const unsure = status === 'unsure' ? live.flatMap((w) => readOf(w)?.read ?? []) : []

  return (
    <PlaceRow name={p.name} pill={shulPill(p, status, reading, settled, progress)} back={jobName}>
      {ordered.map((f) => {
        const s = sectionOf(f)
        const decided = settled.get(f.id)
        const rows = s.hours ? hoursRows(s.now[s.hours], s.hours in f.values ? f.values[s.hours] : s.now[s.hours]) : []
        const [was, next] = s.notes ? [text(s.now[s.notes]), text(s.notes in f.values ? f.values[s.notes] : s.now[s.notes])] : ['', '']
        const n = sectionChanges(rows, noteChanged(was, next))
        return (
          <Box
            // Decided, it closes.
            key={decided ? `${f.id}-done` : f.id}
            name={s.label}
            pill={decided ? { text: doneText(decided), tone: 'grey' } : { text: n ? `${n} change${n === 1 ? '' : 's'}` : 'Update', tone: 'amber' }}
            defaultOpen={!decided}
          >
            {s.hours && <Rows rows={rows} />}
            <Notes now={was} next={next} />
            {!decided && <BoxActions busy={busy || saving === f.id} onUse={() => void decide(f, { status: 'approved' }, 'approved')} onEdit={() => void edit(f)} onKeep={() => void decide(f, { status: 'rejected' }, 'rejected')} />}
            <SourceLine url={f.page} what={f.page ? shortUrl(f.page) : 'their website'} at={readAt(f.page) ?? f.at} />
          </Box>
        )
      })}
      <ContactBoxes placeId={p.id} contact={p.contact ?? null} findings={contacts} pages={live} settled={settled} busy={busy} token={token} community={community} itemUrl="/api/admin/watches/hours" onDecided={onDecided} show="updates" />
      {same.map((s) => {
        const page = named.get(s.section)!
        return (
          <Box key={s.section} name={s.label} pill={{ text: 'Same', tone: 'green' }}>
            {s.hours && <Rows rows={hoursRows(s.now[s.hours])} />}
            {s.notes && <Notes now={text(s.now[s.notes])} next={text(s.now[s.notes])} />}
            <SourceLine lead="Same as" url={page.url} at={page.lastCheck?.at} />
          </Box>
        )
      })}
      {/* Its phone and email: Mikvah hours board 1's Contact, after the
          sections; an update to it above the Same ones. */}
      <ContactBoxes placeId={p.id} contact={p.contact ?? null} findings={contacts} pages={live} settled={settled} busy={busy} token={token} community={community} itemUrl="/api/admin/watches/hours" onDecided={onDecided} show="same" />
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
                {busy ? (progress ?? 'Reading…') : 'Read them now'}
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
