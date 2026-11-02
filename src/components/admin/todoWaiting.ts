import { didntLoad } from '@/lib/watchJobs'
import { linkBroken } from '@/lib/linkCheck'
import { waitingGroups, type Decide } from './waitingGroups'
import { jobsSettled, troublesOf, type Jobs } from './useWatchJobs'
import { kindsOf } from './WatchKinds'

// What a job read that waits on a decision and isn't in the queue, for To do
// (Oct 31). A list's or a page's finding is a submission, so it's already
// there; these are decided on the place itself: a closure Google reports, a
// check against Google, a menu's reading, a place the guide has archived.

export type TodoWaiting = { id: string; name: string; kind: string; line: string }
/** `since`: when each broken check started failing, the row's date (J1Dates,
 *  N1List: every place on To do is dated). */
export type TodoNotRead = { id: string; name: string; line: string; since?: (string | null)[] }
const NO_EMAIL = 'No email has come in 3 weeks'

const earliest = (dates: readonly (string | null | undefined)[]) => dates.filter((d): d is string => !!d).sort()[0] ?? null
type Failing = { active: boolean; failingSince: string | null; lastRunAt: string | null; lastOkAt: string | null; lastError: string | null }
/** Since when a page has failed: its first failure, else its last good read. */
const failedSince = (watches: readonly Failing[], now: number) =>
  earliest(watches.filter((w) => w.active && didntLoad(w, now)).map((w) => w.failingSince ?? w.lastOkAt ?? w.lastRunAt))

/** When one of a place's broken checks (placeTroubles' words) started. */
export function troubleSince(id: string, trouble: string, jobs: Jobs, now: number): string | null {
  const shul = jobs.times?.places.find((p) => p.id === id)
  const mikvah = jobs.hours?.places.find((p) => p.id === id)
  const site = jobs.sites?.find((p) => p.id === id)
  const food = jobs.dishes?.find((p) => p.id === id)
  if (trouble === 'Website didn’t load') {
    const pages = [...(shul?.pages ?? []), ...(mikvah?.pages ?? []), ...(site?.pages ?? [])].map((p) => p.watch)
    return failedSince([...pages, ...(food?.pages ?? [])], now)
  }
  if (trouble === 'Menu didn’t load') return food?.menuWatch ? failedSince([food.menuWatch], now) : null
  if (trouble === 'Menu can’t be read') return food?.reading?.readAt ?? null
  if (/^(Times|Hours) can’t be read$/.test(trouble)) {
    const place = trouble.startsWith('Times') ? shul : mikvah
    return earliest((place?.pages ?? []).filter((p) => p.watch.active).map((p) => p.watch.lastCheck?.at ?? p.watch.lastRunAt))
  }
  if (trouble.startsWith('Google stopped answering')) return jobs.google?.places.find((p) => p.id === id)?.failedAt ?? null
  if (trouble === 'Refuah didn’t load' || trouble === 'Not found on Refuah') {
    const w = jobs.hospitals?.find((h) => h.id === id)?.watch
    return w ? (w.failingSince ?? w.lastRunAt) : null
  }
  if (trouble === 'Link doesn’t open') return earliest((jobs.links ?? []).filter((l) => l.resourceId === id && linkBroken(l)).map((l) => l.failingSince ?? l.checkedAt))
  return null
}

const QUEUED: readonly Decide['kind'][] = ['findings', 'off', 'archive', 'new']

/** Its own words for one with no words of its own ("3 changes" says nothing
 *  beside the others): where the change came from. */
function lineOf(pill: string | null, first: Decide['kind'] | undefined): string {
  if (pill && !/^\d+ changes?$/.test(pill)) return pill
  if (first === 'google') return 'Google has a change'
  if (first === 'menu') return 'Its menu has a change'
  return 'Its page has a change'
}

const THREE_WEEKS = 21 * 24 * 60 * 60 * 1000

/** A source that has stopped being read, for To do's Not being read (boards
 *  Todo10, EmailTodo12): what's broken, and an email address that's gone
 *  quiet. Nothing until every job has answered, as below. */
export function notBeingRead(jobs: Jobs, now: number): TodoNotRead[] {
  if (!jobsSettled(jobs)) return []
  const out = new Map<string, TodoNotRead>()
  const names = new Map((jobs.google?.places ?? []).map((p) => [p.id, p.name]))
  for (const p of [...(jobs.times?.places ?? []), ...(jobs.hours?.places ?? []), ...(jobs.sites ?? [])]) names.set(p.id, p.name)
  for (const p of jobs.dishes ?? []) names.set(p.id, p.name)
  for (const h of jobs.hospitals ?? []) names.set(h.id, h.name)
  for (const l of jobs.links ?? []) if (!names.has(l.resourceId)) names.set(l.resourceId, l.place)
  for (const [id, troubles] of troublesOf(jobs, now)) {
    const name = names.get(id)
    if (name) out.set(id, { id, name, line: troubles.join(' · '), since: troubles.map((t) => troubleSince(id, t, jobs, now)) })
  }
  const quiet = (at: string | null | undefined) => !!at && now - Date.parse(at) > THREE_WEEKS
  if (!jobs.runs?.off?.includes('newsletters')) {
    for (const p of jobs.times?.places ?? []) {
      const live = p.newsletters?.filter((w) => w.active) ?? []
      if (!out.has(p.id) && live.length > 0 && live.every((w) => quiet(w.pageChangedAt ?? w.createdAt))) {
        out.set(p.id, { id: p.id, name: p.name, line: NO_EMAIL, since: [earliest(live.map((w) => w.pageChangedAt ?? w.createdAt))] })
      }
    }
  }
  if (!jobs.runs?.off?.includes('eruvs')) {
    for (const e of jobs.eruvim?.eruvim ?? []) if (e.statusEmail && quiet(e.statusCheckedAt)) out.set(e.id, { id: e.id, name: e.name, line: NO_EMAIL, since: [e.statusCheckedAt ?? null] })
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Nothing until every job has answered, so To do's number doesn't climb. */
export function waitingNotQueued(jobs: Jobs, now: number): TodoWaiting[] {
  if (!jobsSettled(jobs)) return []
  const all = kindsOf(jobs, '', now)
  if (!all) return []
  return all.kinds.flatMap((k) =>
    k.places
      .filter((p) => p.state === 'waiting')
      .flatMap((p) => {
        const { groups } = waitingGroups(p.id, jobs, now)
        const own = groups.filter((g) => !QUEUED.includes(g.decide.kind) && (g.decide.kind !== 'later' || !!g.decide.archivedId))
        if (groups.length > 0 && own.length === 0) return []
        return [{ id: p.id, name: p.name, kind: k.label, line: lineOf(p.pill, own[0]?.decide.kind) }]
      }),
  )
}
