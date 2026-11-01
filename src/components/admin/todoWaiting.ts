import { waitingGroups, type Decide } from './waitingGroups'
import { jobsSettled, type Jobs } from './useWatchJobs'
import { kindsOf } from './WatchKinds'

// What a job read that waits on a decision and isn't in the queue, for To do
// (Oct 31). A list's or a page's finding is a submission, so it's already
// there; these are decided on the place itself: a closure Google reports, a
// check against Google, a menu's reading, a place the guide has archived.

export type TodoWaiting = { id: string; name: string; kind: string; line: string }

const QUEUED: readonly Decide['kind'][] = ['findings', 'off', 'archive', 'new']

/** Its own words for one with no words of its own ("3 changes" says nothing
 *  beside the others): where the change came from. */
function lineOf(pill: string | null, first: Decide['kind'] | undefined): string {
  if (pill && !/^\d+ changes?$/.test(pill)) return pill
  if (first === 'google') return 'Google has a change'
  if (first === 'menu') return 'Its menu has a change'
  return 'Its page has a change'
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
