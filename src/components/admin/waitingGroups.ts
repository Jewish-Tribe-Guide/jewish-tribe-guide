import { closureText, closureWaits } from '@/lib/googleJob'
import { dishProposal } from '@/lib/dishProposal'
import { findingFor } from '@/lib/eruvJob'
import { detailsKeysToUse, detailsRows } from '@/lib/eruvWebsite'
import { kosherBoxKeys, kosherInTheBox, kosherProposal, kosherRows } from '@/lib/kosherBox'
import type { CategoryConfig } from '@/lib/categories'
import { KOSHER_LIST_NAMES, type KosherList } from '@/lib/kosherJob'
import { scheduleProposal } from '@/lib/timesProposal'
import type { Finding } from '@/lib/watchFindings'
import { day, shortUrl } from './JobPage'
import { usualRows } from './TimesProposal'
import { checkedLines, openedPlace, type CheckedLine, type FootLink } from './openedPlaceBoxes'
import type { Jobs } from './useWatchJobs'

// ── A place waiting for you, opened on its kind's page (piece 4, Oct 25) ────
// Drawn on FinalChanges2, FinalNewsletter, FinalClosed, FinalDropped and
// FinalNewPlace (settled Oct 24): a group per source, "From chalavita.com ·
// Oct 25", what it would change lit ("Hours  Sun–Thu 11 AM–10 PM, was Sun–
// Thu 11 AM–9 PM"), and the group's own buttons. Then "N more up to date",
// a line each, and Open its listing.
//
// Each job's own findings (watchFindings.ts), as the Watches tab loads them,
// so a group decides exactly what its job page would. The buttons:
//   changes   Accept / Edit / Keep as is: the finding approved or rejected
//             (Google's check: Use Google's or Keep the listing; a menu
//             reading: Use this or Skip)
//   closed    Keep closed / Show as open
//   off       Remove the listing / Keep it / Edit, off a kosher list
//   new       Add as new / Don't add, a place only a list has

export type WaitJob = 'google' | 'times' | 'hours' | 'dishes' | 'hospitals' | 'kosher' | 'eruv'
/** "Hours  Sun–Thu 11 AM–10 PM, was Sun–Thu 11 AM–9 PM"; `old` none for
 *  a value the listing doesn't have yet. */
export type WaitLine = { label: string; value: string; old: string | null }
/** A line that's only so: "On the site  Shown closed since Oct 12". */
export type WaitFact = { label: string; value: string; url?: string | null }
export type Decide =
  /** Each submission approved, `only` its keys for a list's or an eruv's. */
  | { kind: 'findings'; ids: string[]; only?: Record<string, string[]> }
  | { kind: 'google' }
  | { kind: 'closure' }
  | { kind: 'menu' }
  | { kind: 'off'; id: string }
  /** A change that leaves it no hechsher: the Kosher page's archive. */
  | { kind: 'archive'; id: string }
  | { kind: 'new'; id: string }
  /** Nothing to decide yet: a list's new place, filed after its next read. */
  | { kind: 'later' }
export type WaitGroup = { key: string; job: WaitJob; page: FootLink | null; when: string | null; lines: WaitLine[]; facts: WaitFact[]; note: string | null; decide: Decide }

export type Waiting = { groups: WaitGroup[]; checked: CheckedLine[] }

const NONE = '—'
const value = (v: string) => (v === NONE || !v.trim() ? 'None' : v)
const was = (v: string) => (v === NONE || !v.trim() ? 'none' : v)
const pageLink = (url: string): FootLink => ({ text: shortUrl(url), url })
const latest = (fs: readonly Finding[]) => fs.map((f) => f.at).sort().at(-1) ?? null

/** A shul's times as the finding would make them: only what changes. */
function timesLines(f: Finding): WaitLine[] | null {
  const t = f.times
  if (!t || !f.part) return null
  if (f.part === 'week') {
    const { weeks, gone } = scheduleProposal(t.currentSchedules, t.proposedSchedules, t.proposed)
    const lines: WaitLine[] = []
    for (const w of weeks) {
      if (w.none) lines.push({ label: 'No minyan this week', value: w.range, old: null })
      const rows = w.days.flatMap((d) => d.rows.map((r) => ({ d, r })))
      // What differs from the usual times; a week that differs in nothing
      // shown whole.
      const differs = rows.filter((x) => x.r.usually)
      for (const { d, r } of differs.length ? differs : rows) lines.push({ label: `${r.what}, ${d.label}`, value: r.when, old: r.usually })
    }
    for (const g of gone) lines.push({ label: g, value: 'Taken off', old: null })
    return lines
  }
  return usualRows(f.part, t.current, t.proposed)
    .filter((r) => r.status !== 'same')
    .map((r) => ({
      label: r.what,
      value: r.status === 'gone' ? 'Taken off' : [r.when, r.note, r.season].filter(Boolean).join(' · '),
      old: r.status === 'changed' ? [r.was?.days, r.was?.when ?? r.when, r.was?.note ?? r.note, r.was?.season ?? r.season].filter(Boolean).join(' · ') : r.status === 'gone' ? r.when : null,
    }))
}

const findingLines = (f: Finding): WaitLine[] =>
  timesLines(f) ?? f.lines.map((l) => ({ label: l.label, value: value(l.after), old: f.operation === 'create' ? null : was(l.before) }))

/** Its findings from one job, a group per page (or list, or Refuah) they
 *  came from. */
function findingGroups(job: WaitJob, findings: readonly Finding[], pageOf: (f: Finding) => FootLink | null): WaitGroup[] {
  const by = new Map<string, Finding[]>()
  for (const f of findings) {
    const k = f.page ?? f.from
    by.set(k, [...(by.get(k) ?? []), f])
  }
  return [...by.entries()].map(([k, fs]) => {
    const at = latest(fs)
    return {
      key: `${job}:${k}`,
      job,
      page: pageOf(fs[0]),
      when: at ? day(at) : null,
      lines: fs.flatMap(findingLines),
      facts: [],
      note: null,
      decide: { kind: 'findings', ids: fs.map((f) => f.id) },
    }
  })
}

/** "Keystone-K’s list", linked to the list. */
function listPage(jobs: Jobs, f: Finding | KosherList): FootLink {
  const list = typeof f === 'string' ? f : f.from.startsWith('Mekor') ? 'mekor' : 'keystone'
  return { text: KOSHER_LIST_NAMES[list], url: jobs.kosher?.lists.find((l) => l.list === list)?.url ?? null }
}

/** "ritasice.com", as a fact shows a website. */
const hostOf = (url: string) => shortUrl(url).split('/')[0]

/** A place only a list has, as the listing it would add (FinalNewPlace):
 *  its name is the heading, its website by its address, its Kosher box's
 *  rows by their names ("Hechsher"). */
function newLines(f: Finding & { address?: string }, category: CategoryConfig | undefined): WaitLine[] {
  const box = new Set(category ? kosherBoxKeys(category) : [])
  const kosher = category ? kosherRows(category, {}, f.values ?? {}) : []
  const own = f.lines.filter((l) => l.key !== 'name' && l.key !== 'address' && !box.has(l.key) && !kosher.some((r) => r.keys.includes(l.key)))
  return [
    ...(f.address ? [{ label: 'Address', value: f.address, old: null }] : []),
    ...own.map((l) => ({ label: l.label, value: l.key === 'website' && l.after !== NONE ? hostOf(l.after) : value(l.after), old: null })),
    ...kosher.map((r) => ({ label: r.name, value: r.value, old: null })),
  ]
}

export function waitingGroups(id: string, jobs: Jobs, now: number): Waiting {
  const off: WaitGroup[] = []
  const closed: WaitGroup[] = []
  const added: WaitGroup[] = []
  const changes: WaitGroup[] = []
  // Boxes and lines up to date that a group stands for, left out of "N
  // more up to date".
  const covered = new Set<string>()
  const google = jobs.google?.places.find((g) => g.id === id)
  const website = google?.fields.find((f) => f.field === 'website')?.value
  const siteFact = (): WaitFact[] => (website && website !== NONE ? [{ label: 'Its website', value: hostOf(website), url: website }] : [])

  // A place only a kosher list has: what it would add.
  const kosher = jobs.kosher
  const fresh = id.startsWith('new:') ? kosher?.newPlaces.find((n) => `new:${n.name}` === id) : undefined
  const loose = kosher?.others?.find((f) => f.id === id)
  const newFinding = fresh?.findings?.[0] ?? (loose?.operation === 'create' ? loose : undefined)
  if (newFinding) {
    const f = newFinding
    added.push({
      key: 'new',
      job: 'kosher',
      page: listPage(jobs, f),
      when: day(f.at),
      lines: newLines(f, kosher?.categories?.find((c) => c.id === (f.category ?? 'restaurant'))),
      facts: fresh?.archived ? [{ label: 'In the guide', value: `Archived, as “${fresh.archived}”` }] : [],
      note: null,
      decide: { kind: 'new', id: f.id },
    })
  } else if (fresh) {
    // Not filed yet: the Kosher page's "Suggested after tomorrow
    // morning's read", nothing to decide until it is.
    added.push({
      key: 'new',
      job: 'kosher',
      page: fresh.on[0] ? listPage(jobs, fresh.on[0].list) : null,
      when: null,
      lines: fresh.address ? [{ label: 'Address', value: fresh.address, old: null }] : [],
      facts: fresh.archived ? [{ label: 'In the guide', value: `Archived, as “${fresh.archived}”` }] : [],
      note: fresh.filed === 'next' ? 'Suggested after tomorrow morning’s read, if Google says it’s open.' : null,
      decide: { kind: 'later' },
    })
  }

  // Off a list: a removal it filed, or a change that leaves it no hechsher.
  // The rest of what a list filed is a change like any other's.
  const kosherPlace = kosher?.places.find((p) => p.id === id)
  const category = kosherPlace && kosher?.categories?.find((c) => c.id === kosherPlace.category)
  const listFindings = [...(kosherPlace?.findings ?? []), ...(kosher?.others ?? []).filter((f) => f.targetId === id)]
  const listChanges: WaitGroup[] = []
  for (const f of listFindings) {
    const list = listPage(jobs, f)
    const box = category && kosherPlace?.findings?.includes(f) && kosherInTheBox(category, f) ? kosherProposal(category, kosherPlace.box ?? {}, f) : null
    if (box?.noneLeft) {
      off.push({
        key: `off:${f.id}`,
        job: 'kosher',
        page: list,
        when: day(f.at),
        lines: [{ label: 'Hechsher', value: 'None', old: list.text.replace(/’s list$/, '') }],
        facts: [...siteFact(), ...(google?.matched ? [{ label: 'Google', value: google.closure ? closureText(google.closure) : 'Open' }] : [])],
        note: 'Its only hechsher. Removing archives it.',
        decide: f.operation === 'delete' ? { kind: 'off', id: f.id } : { kind: 'archive', id: f.id },
      })
    } else if (box) {
      listChanges.push({
        key: `kosher:${f.id}`,
        job: 'kosher',
        page: list,
        when: day(f.at),
        lines: box.rows.filter((r) => r.mark !== 'same').map((r) => ({ label: r.name, value: r.mark === 'gone' ? 'None' : r.value, old: r.mark === 'changed' ? (r.was ?? null) : r.mark === 'gone' ? r.value : null })),
        facts: [],
        note: null,
        decide: { kind: 'findings', ids: [f.id], only: { [f.id]: box.use } },
      })
    } else listChanges.push(...findingGroups('kosher', [f], () => list))
    covered.add('kosher')
  }

  // Google's closure, on the site at once.
  if (google && closureWaits(google.closure)) {
    const c = google.closure
    closed.push({
      key: 'closure',
      job: 'google',
      page: { text: 'its Google listing', url: null },
      when: c.readAt ? day(c.readAt) : null,
      lines: [{ label: 'Open or closed', value: closureText(c), old: 'Open' }],
      facts: [...(c.since ? [{ label: 'On the site', value: `Shown closed since ${day(c.since)}` }] : []), ...siteFact()],
      note: 'Opens again by itself when Google says open.',
      decide: { kind: 'closure' },
    })
  }

  // The rest: each job's findings, a group per page.
  const pages = (f: Finding) => (f.page ? pageLink(f.page) : { text: f.from, url: null })
  for (const job of ['times', 'hours'] as const) {
    const p = jobs[job]?.places.find((x) => x.id === id)
    if (!p?.findings?.length) continue
    changes.push(...findingGroups(job, p.findings, pages))
    for (const f of p.findings) {
      if (f.part) covered.add(f.part === 'week' ? 'week' : f.part)
      if (f.section) covered.add(f.section)
    }
  }
  const dishes = jobs.dishes?.find((x) => x.id === id)
  if (dishes?.findings?.length) changes.push(...findingGroups('dishes', dishes.findings as Finding[], pages))
  const hospital = jobs.hospitals?.find((x) => x.id === id)
  if (hospital?.findings?.length) {
    changes.push(...findingGroups('hospitals', hospital.findings, () => ({ text: 'Refuah', url: hospital.watch?.url ?? null })))
    for (const f of hospital.findings) if (f.section) covered.add(`refuah-${f.section}`)
  }
  changes.push(...listChanges)

  // A menu read that would change its dishes.
  const r = dishes?.reading
  if (dishes && r?.status === 'proposed') {
    const proposal = dishProposal(dishes, { dishes: r.dishes ?? [], missing: r.missing })
    if (proposal.updates > 0) {
      const named = (s: string) => proposal.rows.filter((x) => x.status === s).map((x) => x.name)
      const url = r.sourceUrl ?? dishes.menuUrl
      changes.push({
        key: 'menu',
        job: 'dishes',
        page: url ? pageLink(url) : { text: 'its menu', url: null },
        when: day(r.readAt),
        lines: [
          ...(named('new').length ? [{ label: 'New on its menu', value: named('new').join(', '), old: null }] : []),
          ...(named('gone').length ? [{ label: 'Not on its menu', value: named('gone').join(', '), old: null }] : []),
        ],
        facts: [],
        note: null,
        decide: { kind: 'menu' },
      })
      covered.add('dishes')
    }
  }

  // What a check against Google found.
  const compare = google && !google.decided ? google.compare : null
  const changed = compare?.rows.filter((x) => x.changed) ?? []
  if (google && compare && changed.length) {
    const shown = (field: string, v: string) => (field === 'website' && v !== NONE ? shortUrl(v) : v)
    changes.push({
      key: 'google',
      job: 'google',
      page: { text: 'its Google listing', url: null },
      when: day(compare.at),
      lines: changed.map((x) => {
        const listed = google.fields.find((f) => f.field === x.field)?.value ?? NONE
        return { label: x.label, value: value(shown(x.field, x.google)), old: was(shown(x.field, listed)) }
      }),
      facts: [],
      note: null,
      decide: { kind: 'google' },
    })
  }

  // An eruv's details, read from its website.
  const eruv = jobs.eruvim?.eruvim.find((e) => e.id === id)
  const ef = eruv && jobs.eruvim ? findingFor(jobs.eruvim.findings, id) : null
  if (eruv && ef) {
    const rows = detailsRows(eruv, { hotline: ef.hotline, alertsUrl: ef.alertsUrl }).filter((x) => x.mark !== 'same')
    if (rows.length) {
      changes.push({
        key: 'eruv',
        job: 'eruv',
        page: eruv.website ? pageLink(eruv.website) : { text: 'its website', url: null },
        when: day(ef.at),
        lines: rows.map((x) => ({ label: x.name, value: x.mark === 'gone' ? 'None' : x.value, old: x.mark === 'changed' ? (x.was ?? null) : x.mark === 'gone' ? x.value : null })),
        facts: [],
        note: null,
        decide: { kind: 'findings', ids: [ef.id], only: { [ef.id]: detailsKeysToUse(rows) } },
      })
    }
  }

  const groups = [...off, ...closed, ...added, ...changes]
  const labels = new Set(groups.flatMap((g) => g.lines.map((l) => l.label)))
  const boxes = newFinding ? [] : openedPlace(id, jobs, now).boxes
  const checked = checkedLines(boxes.filter((b) => !covered.has(b.key) && !(b.key.startsWith('week-') && covered.has('week')))).filter((l) => !labels.has(l.label))
  return { groups, checked }
}

