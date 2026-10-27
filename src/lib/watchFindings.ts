import type { ResourceRow, ResourceSubmission, SubmissionRow } from '@/types'
import { companionKeys, type CategoryConfig, type CategoryField } from './categories'
import { hoursJobCategories, ownSiteCategories } from './hoursJob'
import { diffListing } from './submissionDiff'
import { LISTING_PAGE_WATCH_NAME } from './listingPageWatch'
import { NEWSLETTER_WATCH_NAME } from './newsletter'
import { REFUAH_WATCH_NAME } from './refuahWatch'
import { KEYSTONE_WATCH_NAME } from './keystoneWatch'
import { MEKOR_WATCH_NAME } from './mekorWatch'
import { ERUV_WEBSITE_WATCH_NAME } from './eruvWebsite'
import { submissionSource } from './submissionSource'
import { regularMinyanim, readSchedules, schedulesKey, type SpecialSchedule } from './schedules'
import type { Minyan } from './davening'
import type { TimesPart } from './timesParts'
import { hoursSections, sectionKeys, sectionOfKeys, type SectionSource } from './hoursSections'
import { CONTACT_SECTION } from './contactRead'
import { itemsField } from './listingView'
import { itemWording } from './itemMarks'

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
export type FindingJob = 'hours' | 'times' | 'dishes' | 'hospitals' | 'kosher' | 'sites'

export const FINDING_SOURCES: Record<FindingJob, readonly string[]> = {
  hours: [LISTING_PAGE_WATCH_NAME],
  times: [LISTING_PAGE_WATCH_NAME, NEWSLETTER_WATCH_NAME],
  // A food place's website: its hours and phone, when Google doesn't keep
  // them (Main dishes board 3, Oct 22).
  dishes: [LISTING_PAGE_WATCH_NAME],
  hospitals: [REFUAH_WATCH_NAME],
  kosher: [KEYSTONE_WATCH_NAME, MEKOR_WATCH_NAME],
  // Any other place's website (a grocery's, a childcare's): its phone,
  // email and hours, where Google doesn't have them. They wait under its
  // kind's row on the Watches tab (the user, Oct 25).
  sites: [LISTING_PAGE_WATCH_NAME],
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
  /** A shul's times, when they're all it would change: the listing's and
   *  what was read, whole, for Shul times to show as a proposal
   *  (timesProposal.ts) rather than line by line. */
  times?: FindingTimes
  /** Which of a shul's three parts it changes (timesParts.ts). */
  part?: TimesPart
  /** The page it was read from, for "From soicherryhill.org/tefillot". */
  page?: string
  /** Which of a mikvah's sections it changes (hoursSections.ts): filed
   *  as one, or, from before they were, all its lines in one. */
  section?: string
  /** That section's hours and notes as the finding has them; a page's
   *  phone and email (the section `contact`), its phone among them. */
  values?: Record<string, unknown>
}

export type FindingTimes = {
  field: CategoryField
  current: Minyan[]
  proposed: Minyan[]
  currentSchedules: SpecialSchedule[]
  proposedSchedules: SpecialSchedule[]
}

/** A finding's times, when an update would change a shul's times and
 *  nothing else. */
function timesOf(s: SubmissionRow, current: ResourceRow | null, payload: ResourceSubmission | undefined, lines: readonly FindingLine[], fields: readonly CategoryField[]): FindingTimes | undefined {
  if (s.operation !== 'update' || !current || !payload?.details || !lines.length) return undefined
  const field = fields.find((f) => f.type === 'minyanim' && lines.every((l) => l.key === f.key || l.key === schedulesKey(f.key)))
  if (!field) return undefined
  const key = schedulesKey(field.key)
  return {
    field,
    current: regularMinyanim(current.details[field.key]),
    proposed: regularMinyanim(payload.details[field.key]),
    currentSchedules: readSchedules(current.details[key]),
    proposedSchedules: readSchedules(key in payload.details ? payload.details[key] : current.details[key]),
  }
}

const CORE = new Set(['name', 'address', 'phone'])
/** Set by every approval (withConfirmedNow), so never a line to choose. */
const NOT_A_LINE = new Set(['confirmedAt'])
const NONE = '—'

/** The keys an admin's copy of a suggestion may change (reviewEdits.ts). */
function editableKeys(fields: readonly CategoryField[]): Set<string> {
  return new Set([...CORE, ...fields.flatMap((f) => [f.key, ...companionKeys(f)])])
}

/** The page in a watch's note: "From their website, read Oct 20: https://…". */
export function pageOf(note: string | null | undefined): string | undefined {
  return note?.split('\n')[0].match(/:\s(https?:\/\/\S+)\s*$/)?.[1]
}

/** A pending suggestion a watch filed, as the job page shows it. */
export function findingFrom(s: SubmissionRow, current: ResourceRow | null, fields: readonly CategoryField[]): Finding {
  const payload = s.payload as unknown as ResourceSubmission
  const source = submissionSource(s)
  const editable = editableKeys(fields)
  // A shul's times read a part at a time change only that part when
  // approved (submissionStore.ts), so they show only it: whatever else
  // the listing has changed since the read isn't theirs (Oct 27).
  const part = source.part?.field
  const partKeys = part ? new Set([part, schedulesKey(part)]) : null
  const lines =
    s.operation === 'delete' || !payload?.details
      ? []
      : diffListing(s.operation === 'create' ? null : current, payload, [...fields])
          .filter((d) => d.changed && !NOT_A_LINE.has(d.key) && (!partKeys || partKeys.has(d.key)))
          .map(({ key, label, before, after }) => {
            const choosable = s.operation === 'update' && editable.has(key)
            return { key, label, before, after, choosable, ...(choosable && after === NONE && before !== NONE ? { empties: true } : {}) }
          })
  const name = watchNameOf(s) ?? ''
  const times = timesOf(s, current, payload, lines, fields)
  const page = pageOf(source.note ?? s.note)
  const section = sectionFinding(s, source.section, payload, lines, fields)
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
    ...(times ? { times } : {}),
    ...(source.part ? { part: source.part.part } : {}),
    ...(page ? { page } : {}),
    ...(section ?? {}),
  }
}

/** A mikvah's section a finding changes, and its values there: the one it
 *  was filed for, or, filed before the sections, the one all its lines
 *  are in. */
function sectionFinding(s: SubmissionRow, stated: SectionSource | undefined, payload: ResourceSubmission | undefined, lines: readonly FindingLine[], fields: readonly CategoryField[]): { section: string; values: Record<string, unknown> } | undefined {
  if (s.operation !== 'update' || !payload?.details) return undefined
  const named = fields.filter((f) => f.type === 'hours' && f.key !== 'hours').map((f) => f.key)
  const derived = !stated && lines.length ? sectionOfKeys(hoursSections({ detailFields: [...fields] }, named), lines.map((l) => l.key)) : null
  const src = stated ?? (derived ? { section: derived.section, keys: sectionKeys(derived) } : null)
  if (!src) return undefined
  const d = src.section === CONTACT_SECTION ? { ...payload.details, phone: payload.phone ?? null } : payload.details
  return { section: src.section, values: Object.fromEntries(src.keys.filter((k) => k in d).map((k) => [k, d[k]])) }
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

export function jobCategories(categories: readonly Pick<CategoryConfig, 'id' | 'kind' | 'hasPhone' | 'detailFields'>[]): JobCategories {
  return {
    hours: new Set(hoursJobCategories(categories, 'hours').map((c) => c.id)),
    times: new Set(hoursJobCategories(categories, 'times').map((c) => c.id)),
    dishes: new Set(dishCategories(categories).map((c) => c.id)),
    sites: new Set(siteCategories(categories).map((c) => c.id)),
  }
}

/** The places whose own website is read with no job page of their own
 *  (a grocery, a childcare, a hotel): what it finds waits on their kind's
 *  page on the Watches tab. The food places' wait on Main dishes. */
export function siteCategories<C extends Pick<CategoryConfig, 'id' | 'kind' | 'hasPhone' | 'detailFields'>>(categories: readonly C[]): C[] {
  return ownSiteCategories(categories).filter((c) => !dishCategories([c]).length)
}

/** The categories Main dishes reads: a list of dishes (the food places). */
export function dishCategories<C extends Pick<CategoryConfig, 'detailFields'>>(categories: readonly C[]): C[] {
  return categories.filter((c) => {
    const field = itemsField(c as unknown as CategoryConfig)
    return !!field && itemWording(field).noun === 'dish'
  })
}

/** Whether a job page shows this pending suggestion, so the moderation
 *  queue leaves it out. Refuah's, the kosher lists' and an eruv website's
 *  are always on theirs;
 *  a website's or a newsletter's only when its place is one a job reads. */
export function onAJobPage(s: Pick<SubmissionRow, 'submitted_by' | 'target_type'>, category: string | undefined, jobs: JobCategories): boolean {
  // An eruv's website's: on Eruv status (eruvWebsite.ts).
  if (s.target_type === 'eruv') return watchNameOf(s) === ERUV_WEBSITE_WATCH_NAME
  if (s.target_type !== 'listing') return false
  const name = watchNameOf(s)
  if (!name) return false
  if (FINDING_SOURCES.hospitals.includes(name) || FINDING_SOURCES.kosher.includes(name)) return true
  if (!category) return false
  return (['hours', 'times', 'dishes', 'sites'] as const).some((job) => FINDING_SOURCES[job].includes(name) && !!jobs[job]?.has(category))
}

/** Where a watch's findings wait, for its email: a place's kind's page on
 *  the Watches tab, opened on it when `placeId` is given; the tab itself
 *  (no name) for a list's, which span kinds. */
export function findingPage(community: string, category?: Pick<CategoryConfig, 'id' | 'pluralLabel'> | null, placeId?: string): { path: string; name: string } {
  if (!category) return { path: `/${community}/admin/watches`, name: '' }
  return { path: `/${community}/admin/watches/kind/${category.id}${placeId ? `?place=${placeId}` : ''}`, name: category.pluralLabel }
}

/** Where a place's findings wait: its kind's page, for a category Shul
 *  times, the hours job, Main dishes or its own website reads; none
 *  otherwise, and they wait in the moderation queue. */
export function jobPageFor(community: string, category: Pick<CategoryConfig, 'id' | 'label' | 'pluralLabel' | 'kind' | 'hasPhone' | 'detailFields'>, placeId?: string): { path: string; name: string } | undefined {
  const read = hoursJobCategories([category], 'times').length || hoursJobCategories([category], 'hours').length || dishCategories([category]).length || siteCategories([category]).length
  return read ? findingPage(community, category, placeId) : undefined
}
