import type { ResourceRow, ResourceSubmission, SubmissionRow } from '@/types'
import { companionKeys, type CategoryConfig, type CategoryField } from './categories'
import { hoursJobCategories, hoursJobName } from './hoursJob'
import { diffListing } from './submissionDiff'
import { LISTING_PAGE_WATCH_NAME } from './listingPageWatch'
import { NEWSLETTER_WATCH_NAME } from './newsletter'
import { REFUAH_WATCH_NAME } from './refuahWatch'
import { KEYSTONE_WATCH_NAME } from './keystoneWatch'
import { MEKOR_WATCH_NAME } from './mekorWatch'
import { submissionSource } from './submissionSource'

// Step 6 of keeping listings current (decided by the user, Oct 21):
// "Findings go to the job pages, next to what the listing says, not the
// moderation queue. The queue keeps what people send in."
//
// A watch still files what it finds as a pending suggestion, exactly as
// before, so a finding already decided is never filed again ("Skip keeps it
// out of to check until the page changes again"). What changes is where it
// is shown: on the job page that reads the place, with Compare, a tick per
// line and "Update N on the listing"; and no longer in the queue. A finding
// no job page shows (a hand-added watch on a category with no job) stays in
// the queue, so nothing a watch finds goes unseen.

/** The jobs whose pages show findings, and the watches that file them. */
export type FindingJob = 'hours' | 'times' | 'hospitals' | 'kosher'

export const FINDING_SOURCES: Record<FindingJob, readonly string[]> = {
  hours: [LISTING_PAGE_WATCH_NAME],
  times: [LISTING_PAGE_WATCH_NAME, NEWSLETTER_WATCH_NAME],
  hospitals: [REFUAH_WATCH_NAME],
  kosher: [KEYSTONE_WATCH_NAME, MEKOR_WATCH_NAME],
}

/** Where a finding came from, said of the place ("From its website"). */
const FROM: Record<string, string> = {
  [LISTING_PAGE_WATCH_NAME]: 'its website',
  [NEWSLETTER_WATCH_NAME]: 'its newsletter',
  [REFUAH_WATCH_NAME]: 'Refuah',
  [KEYSTONE_WATCH_NAME]: 'Keystone-K’s list',
  [MEKOR_WATCH_NAME]: 'Mekor Habracha’s list',
}

/** The heading over what it says, beside "The listing says". */
const SAYS: Record<string, string> = {
  [LISTING_PAGE_WATCH_NAME]: 'Its page says',
  [NEWSLETTER_WATCH_NAME]: 'Its newsletter says',
  [REFUAH_WATCH_NAME]: 'Refuah says',
  [KEYSTONE_WATCH_NAME]: 'Keystone-K says',
  [MEKOR_WATCH_NAME]: 'Mekor Habracha says',
}

export const watchNameOf = (s: Pick<SubmissionRow, 'submitted_by'>): string | null => s.submitted_by?.name ?? null

/** One field the finding would change: what the listing says now, and what
 *  its source says. `choosable`: it has a tick of its own; a field the
 *  admin's copy can't carry (reviewEdits.ts) comes with the rest. */
export type FindingLine = {
  key: string
  label: string
  before: string
  after: string
  choosable: boolean
  /** What was read says nothing here, and the listing does: added to the
   *  listing since it was read (an approval replaces the details whole), or
   *  a list taking a hechsher off. Unticked to start, so Update leaves it
   *  be unless the admin ticks it. */
  empties?: boolean
}

export type Finding = {
  id: string
  operation: SubmissionRow['operation']
  targetId: string | null
  /** The new place's name, for a finding that adds one. */
  name: string
  /** "its website", "Refuah", "Keystone-K’s list". */
  from: string
  /** "Its page says", "Refuah says": the heading over what it says. */
  says: string
  /** Approved, the listing is dated as confirmed by this source by name
   *  ("Refuah"); none, as confirmed. */
  named: string | null
  at: string
  /** Where it was read, in the watch's words ("From their website, read
   *  Oct 20: https://…"), and the list's own note on a kosher finding. */
  notes: string[]
  lines: FindingLine[]
}

const CORE = new Set(['name', 'address', 'phone'])
/** Set by every approval (withConfirmedNow), so never a line to choose. */
const NOT_A_LINE = new Set(['confirmedAt'])
const NONE = '—'

/** The keys an admin's copy of a suggestion may change (reviewEdits.ts). */
function editableKeys(fields: readonly CategoryField[]): Set<string> {
  return new Set([...CORE, ...fields.flatMap((f) => [f.key, ...companionKeys(f)])])
}

/** A pending suggestion a watch filed, as the job page shows it. */
export function findingFrom(s: SubmissionRow, current: ResourceRow | null, fields: readonly CategoryField[]): Finding {
  const payload = s.payload as unknown as ResourceSubmission
  const source = submissionSource(s)
  const editable = editableKeys(fields)
  const lines =
    s.operation === 'delete' || !payload?.details
      ? []
      : diffListing(s.operation === 'create' ? null : current, payload, [...fields])
          .filter((d) => d.changed && !NOT_A_LINE.has(d.key))
          .map(({ key, label, before, after }) => {
            const choosable = s.operation === 'update' && editable.has(key)
            return { key, label, before, after, choosable, ...(choosable && after === NONE && before !== NONE ? { empties: true } : {}) }
          })
  const name = watchNameOf(s) ?? ''
  return {
    id: s.id,
    operation: s.operation,
    targetId: s.target_id,
    name: typeof payload?.name === 'string' ? payload.name : current?.name ?? '',
    from: FROM[name] ?? 'its source',
    says: SAYS[name] ?? 'It says',
    named: source.named ?? null,
    at: s.created_at,
    notes: [...new Set([source.note, s.note].filter((n): n is string => typeof n === 'string' && n.trim() !== ''))],
    lines,
  }
}

/** The suggestion as it will be approved with only the `keep` lines ticked:
 *  every other line the finding would change goes back to what the listing
 *  says now. Shaped as an admin's copy (reviewEdits.ts), which records what
 *  was left out. */
export function keepOnly(sent: ResourceSubmission, current: ResourceRow, keep: readonly string[], fields: readonly CategoryField[]): Record<string, unknown> {
  const editable = editableKeys(fields)
  const kept = new Set(keep)
  const out: Record<string, unknown> = { name: sent.name, address: sent.address ?? '', phone: sent.phone ?? '' }
  const details: Record<string, unknown> = { ...sent.details }
  for (const key of editable) {
    if (kept.has(key)) continue
    if (CORE.has(key)) out[key] = (current[key as 'name' | 'address' | 'phone'] as string | null) ?? ''
    else details[key] = key in current.details ? current.details[key] : null
  }
  return { ...out, details, ...(sent.geo ? { geo: sent.geo } : {}) }
}

/** The categories each job page reads, for the queue to leave out. */
export type JobCategories = Partial<Record<FindingJob, ReadonlySet<string>>>

export function jobCategories(categories: readonly Pick<CategoryConfig, 'id' | 'detailFields'>[]): JobCategories {
  return {
    hours: new Set(hoursJobCategories(categories, 'hours').map((c) => c.id)),
    times: new Set(hoursJobCategories(categories, 'times').map((c) => c.id)),
  }
}

/** Whether a job page shows this pending suggestion, so the moderation
 *  queue leaves it out. Refuah's and the kosher lists' are always on theirs;
 *  a website's or a newsletter's only when its place is one a job reads. */
export function onAJobPage(s: Pick<SubmissionRow, 'submitted_by' | 'target_type'>, category: string | undefined, jobs: JobCategories): boolean {
  if (s.target_type !== 'listing') return false
  const name = watchNameOf(s)
  if (!name) return false
  if (FINDING_SOURCES.hospitals.includes(name) || FINDING_SOURCES.kosher.includes(name)) return true
  if (!category) return false
  return (['hours', 'times'] as const).some((job) => FINDING_SOURCES[job].includes(name) && !!jobs[job]?.has(category))
}

const PAGE_NAME: Record<Exclude<FindingJob, 'hours'>, string> = {
  times: 'Shul times',
  hospitals: 'Hospitals',
  kosher: 'Kosher certification',
}

/** The job page a watch's findings wait on, for its email: its admin path
 *  and its name. Mikvah hours is named from its category ("Mikvah hours",
 *  hoursJobName), so it's given. */
export function findingPage(community: string, job: FindingJob, hoursName?: string): { path: string; name: string } {
  return { path: `/${community}/admin/watches/${job}`, name: job === 'hours' ? hoursName ?? 'Hours' : PAGE_NAME[job] }
}

/** The job page a place's findings wait on: Shul times or the hours job,
 *  for a category one of them reads; none otherwise, and they wait in the
 *  moderation queue. */
export function jobPageFor(community: string, category: Pick<CategoryConfig, 'id' | 'label' | 'detailFields'>): { path: string; name: string } | undefined {
  if (hoursJobCategories([category], 'times').length) return findingPage(community, 'times')
  if (hoursJobCategories([category], 'hours').length) return findingPage(community, 'hours', hoursJobName([category]))
  return undefined
}
