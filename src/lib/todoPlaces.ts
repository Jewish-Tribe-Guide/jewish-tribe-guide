import type { EnrichedSubmission, ResourceSubmission } from '@/types'
import type { CategoryConfig } from './categories'
import { GOOGLE_SUBMITTER_NAME } from './activity'
import { reviewParts } from './reviewParts'
import { submissionSource } from './submissionSource'
import { changeWhat, isNewPlace, submissionName, type TodoResponse, type TodoUnmatched } from './todo'
import type { TodoNotRead, TodoWaiting } from '@/components/admin/todoWaiting'

// To do as one row per place (the "one tap per place" boards, approved
// Nov 2): everything waiting at a place under its name, the oldest of it
// dated, what's waiting said in a grey line ("Usual weekday times ·
// Website didn't load"). A new place, a new category and a piece of
// feedback are each a row of their own. What each line says is the board
// "What each line says" (P2Words).

export type TodoFilter = 'changes' | 'new' | 'broken' | 'feedback'
export type TodoSort = 'oldest' | 'newest' | 'name'

export type TodoThing =
  /** A suggestion, or for an edit with more than one part, one part of it. */
  | { kind: 'submission'; id: string; label: string; filter: TodoFilter; submission: EnrichedSubmission; part?: string }
  /** What a job read, decided on the place itself. */
  | { kind: 'waiting'; id: string; label: string; filter: 'changes' }
  /** A check that has stopped working. */
  | { kind: 'broken'; id: string; label: string; filter: 'broken'; unmatched?: boolean; since?: string | null }
  | { kind: 'feedback'; id: string; label: string; filter: 'feedback'; response: TodoResponse }

export type TodoPlace = {
  /** The place's id, or the suggestion's or the response's for a row of its own. */
  key: string
  /** A listing to open on its own screen, for what's decided there. */
  placeId: string | null
  name: string
  /** Its category's id, for To do's Category menu; none for feedback or a
   *  new category, or a place To do can't place. */
  category: string | null
  /** The oldest dated thing waiting. */
  at: string | null
  things: TodoThing[]
}

const ORDER: TodoFilter[] = ['changes', 'new', 'broken', 'feedback']

/** A suggestion's things: an edit's parts, else one, in the board's words. */
function submissionThings(s: EnrichedSubmission, category: CategoryConfig | undefined): TodoThing[] {
  const one = (label: string, filter: TodoFilter): TodoThing[] => [{ kind: 'submission', id: s.id, label, filter, submission: s }]
  if (s.target_type === 'category') return one('New category', 'changes')
  if (isNewPlace(s)) return one('New place', 'new')
  if (s.operation === 'delete') {
    const source = submissionSource(s)
    if (source.readBy !== 'person' && /list/i.test(source.from)) return one(`Off ${source.from.replace(/^the /, '')}`, 'changes')
    return one(s.submitted_by?.name === GOOGLE_SUBMITTER_NAME ? 'Closed, says Google' : 'Closed, says a visitor', 'changes')
  }
  if (s.target_type === 'listing' && s.operation === 'update' && s.current && category) {
    const parts = reviewParts(s.current, s.payload as unknown as ResourceSubmission, category)
    if (parts.length > 1) return parts.map((p) => ({ kind: 'submission', id: `${s.id}:${p.id}`, label: p.label, filter: 'changes', submission: s, part: p.id }))
    if (parts.length === 1) return one(parts[0].label, 'changes')
  }
  return one(changeWhat(s, category), 'changes')
}

/** "Oct 12", as a line says it, as the latest such day not after `now`. */
export function dayToIso(day: string, now: number): string | null {
  const year = new Date(now).getUTCFullYear()
  for (const y of [year, year - 1]) {
    const t = Date.parse(`${day}, ${y} 12:00 UTC`)
    if (!Number.isNaN(t) && t <= now + 86_400_000) return new Date(t).toISOString()
  }
  return null
}

export function todoPlaces(
  data: {
    submissions: EnrichedSubmission[]
    responses: TodoResponse[]
    unmatched: TodoUnmatched[]
    waiting?: TodoWaiting[]
    notRead?: TodoNotRead[]
    /** The guide's places and eruvs, for the category of what a job found. */
    jobs?: { places?: readonly { id: string; category: string }[] | null; eruvim?: { eruvim?: readonly { id: string }[] } | null }
  },
  categoriesById: Map<string, CategoryConfig>,
  now = Date.now(),
): TodoPlace[] {
  const eruvCategory = [...categoriesById.values()].find((c) => c.kind === 'eruv')?.id ?? null
  const categoryOf = new Map((data.jobs?.places ?? []).map((p) => [p.id, p.category]))
  if (eruvCategory) for (const e of data.jobs?.eruvim?.eruvim ?? []) categoryOf.set(e.id, eruvCategory)

  const places = new Map<string, TodoPlace>()
  const at = (key: string, name: string, placeId: string | null, category: string | null = placeId ? (categoryOf.get(placeId) ?? null) : null) => {
    let p = places.get(key)
    if (!p) places.set(key, (p = { key, placeId, name, category, at: null, things: [] }))
    else p.category ??= category
    return p
  }
  const dated = (p: TodoPlace, iso: string) => {
    if (!p.at || iso < p.at) p.at = iso
  }
  for (const s of data.submissions) {
    const listing = s.target_type === 'listing' && s.operation !== 'create' && s.target_id
    const categoryId = (s.payload as Partial<ResourceSubmission>).category ?? s.current?.category ?? ''
    const category = s.target_type === 'eruv' ? eruvCategory : s.target_type === 'listing' ? categoryId || null : null
    const p = listing ? at(s.target_id!, submissionName(s), s.target_id!, category) : at(s.id, submissionName(s), null, category)
    p.things.push(...submissionThings(s, categoriesById.get(categoryId)))
    dated(p, s.created_at)
  }
  // Its date is the row's to show, not the line's.
  for (const w of data.waiting ?? []) {
    const p = at(w.id, w.name, w.id)
    const day = / · ([A-Z][a-z]{2} \d{1,2})$/.exec(w.line)?.[1]
    p.things.push({ kind: 'waiting', id: `waiting:${w.id}`, label: w.line.replace(/ · [A-Z][a-z]{2} \d{1,2}$/, ''), filter: 'changes' })
    const iso = w.at ?? (day && dayToIso(day, now))
    if (iso) dated(p, iso)
  }
  for (const n of data.notRead ?? []) {
    const p = at(n.id, n.name, n.id)
    n.line.split(' · ').forEach((label, i) => {
      const since = n.since?.[i] ?? null
      p.things.push({ kind: 'broken', id: `broken:${n.id}:${i}`, label, filter: 'broken', since })
      if (since) dated(p, since)
    })
  }
  // Look again found it on Google: that answers it.
  const found = new Set((data.waiting ?? []).filter((w) => w.found).map((w) => w.id))
  for (const u of data.unmatched) {
    if (found.has(u.id)) continue
    const p = at(u.id, u.name, u.id, u.category || null)
    p.things.push({ kind: 'broken', id: `unmatched:${u.id}`, label: 'Google not found', filter: 'broken', unmatched: true, since: u.at ?? null })
    if (u.at) dated(p, u.at)
  }
  for (const r of data.responses) {
    const p = at(`response:${r.id}`, r.title, null)
    p.things.push({ kind: 'feedback', id: `response:${r.id}`, label: r.line || 'Feedback', filter: 'feedback', response: r })
    dated(p, r.createdAt)
  }
  // Changes come before broken checks.
  for (const p of places.values()) p.things.sort((a, b) => ORDER.indexOf(a.filter) - ORDER.indexOf(b.filter))
  return [...places.values()]
}

/** The nav's number: the places with something waiting, as the list has
 *  them. Not searches nobody found: those are in Reports. */
export function todoPlaceCount(data: Parameters<typeof todoPlaces>[0]): number {
  return todoPlaces(data, new Map()).length
}

/** The places To do lists under Broken checks, for Watches (Nov 4). */
export function brokenPlaceCount(data: Parameters<typeof todoPlaces>[0]): number {
  return todoPlaces(data, new Map()).filter((p) => p.things.some((t) => t.filter === 'broken')).length
}

/** The rows the search, the filters and the sort leave, in order. A place
 *  is in a filter when anything waiting there is; undated ones last. */
export function shownPlaces(
  places: TodoPlace[],
  { query, filters, category = '', sort }: { query: string; filters: TodoFilter[]; category?: string; sort: TodoSort },
): TodoPlace[] {
  const q = query.trim().toLowerCase()
  const shown = places.filter(
    (p) => (!q || p.name.toLowerCase().includes(q)) && (filters.length === 0 || p.things.some((t) => filters.includes(t.filter))) && (!category || p.category === category),
  )
  const byName = (a: TodoPlace, b: TodoPlace) => a.name.localeCompare(b.name)
  if (sort === 'name') return shown.sort(byName)
  const sign = sort === 'oldest' ? 1 : -1
  return shown.sort((a, b) => (a.at && b.at ? sign * a.at.localeCompare(b.at) || byName(a, b) : a.at ? -1 : b.at ? 1 : byName(a, b)))
}

/** Where a place opens when the filter picked it: its first thing of that kind. */
export function firstThing(p: TodoPlace, filters: TodoFilter[]): TodoThing {
  return p.things.find((t) => filters.includes(t.filter)) ?? p.things[0]
}

/** The thing a place screen shows: the one picked while it waits. Once it's
 *  answered, what arrived since the place opened (Read it again's new
 *  reading, which follows from that answer), else the next one still
 *  waiting after it in the order first opened. */
export function shownThing<T extends { id: string }>(order: readonly { id: string }[], things: readonly T[], on: string): T | undefined {
  const present = new Map(things.map((t) => [t.id, t]))
  const picked = present.get(on)
  if (picked) return picked
  const arrived = things.find((t) => !order.some((o) => o.id === t.id))
  if (arrived) return arrived
  const at = order.findIndex((t) => t.id === on)
  return [...order.slice(at), ...order.slice(0, at)].map((t) => present.get(t.id)).find(Boolean) ?? things[0]
}

/** The row's grey line: what's waiting, in order. */
export function placeLine(p: TodoPlace): string {
  // "Google stopped answering Oct 17": the row's corner says when.
  return p.things.map((t) => (t.kind === 'broken' ? t.label.replace(/ [A-Z][a-z]{2} \d{1,2}$/, '') : t.label)).join(' · ')
}
