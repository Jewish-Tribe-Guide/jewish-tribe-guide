import type { CategoryConfig } from './categories'
import { isCategorySyncEligible } from './categories'
import { hoursJobCategories, ownSiteCategories } from './hoursJob'
import type { NightKindId } from './jobRuns'
import { KOSHER_JOB_CATEGORIES } from './kosherJob'
import { NIGHT_KINDS, type KindFix, type NightKindView } from './nightKinds'
import { HOSPITAL_CATEGORY } from './refuahMatch'

// ── Which jobs a community sees (the user, Oct 31) ──────────────────────────
// One Watches page, for a new admin and an old one alike. A job with
// something to read is under Jobs. One that needs a step first is under
// Needs one step, with what to do, and moves up once it's done. Both only if
// the community has that kind of place. What's left, and anything turned
// off, is under + Add a watch.

type Cat = Pick<CategoryConfig, 'id' | 'kind' | 'hasAddress' | 'hasPhone' | 'detailFields' | 'active'>

/** Each job's one step: what it needs before it can read anything. Those
 *  not here read what's on the listings already. */
export const JOB_STEPS: Partial<Record<NightKindId, string>> = {
  times: 'Add each shul’s times page',
  newsletters: 'Sign up with this address',
  hours: 'Add each mikvah’s hours page',
  kosher: 'Add your certifier’s list',
  eruvs: 'Add your eruv’s website',
  hospitals: 'Add each hospital’s Refuah page',
}

function hasPlacesFor(id: NightKindId, categories: readonly Cat[]): boolean {
  const live = categories.filter((c) => c.active !== false)
  const places = live.filter((c) => c.kind === 'listing')
  switch (id) {
    case 'google':
      return places.some(isCategorySyncEligible)
    case 'times':
    case 'newsletters':
      return hoursJobCategories(places, 'times').length > 0
    case 'hours':
      return hoursJobCategories(places, 'hours').length > 0
    case 'kosher':
    case 'menus':
      return places.some((c) => KOSHER_JOB_CATEGORIES.includes(c.id))
    case 'hospitals':
      return places.some((c) => c.id === HOSPITAL_CATEGORY)
    case 'eruvs':
      return live.some((c) => c.kind === 'eruv')
    case 'sites':
      return ownSiteCategories(places).length > 0
    case 'links':
      return places.length > 0
    default:
      return false
  }
}

export type JobLists = {
  jobs: NightKindView[]
  steps: { id: NightKindId; name: string; step: string }[]
  /** Under + Add a watch: `off`, turned off here. */
  more: { id: NightKindId; name: string; off: boolean }[]
}

export function jobLists(categories: readonly Cat[], kinds: readonly NightKindView[], off: readonly NightKindId[]): JobLists {
  const out: JobLists = { jobs: [], steps: [], more: [] }
  // nightKinds() leaves out Other pages, Phone and Links with nothing to read.
  const byId = new Map(kinds.map((k) => [k.id, k]))
  for (const { id, name } of NIGHT_KINDS) {
    if (off.includes(id)) {
      out.more.push({ id, name, off: true })
      continue
    }
    const view = byId.get(id)
    const step = JOB_STEPS[id]
    if (view?.tracked.length) out.jobs.push(view)
    else if (id === 'other') out.more.push({ id, name, off: false })
    else if (hasPlacesFor(id, categories)) {
      if (step) out.steps.push({ id, name, step })
      else out.jobs.push(view ?? blank(id, name))
    }
  }
  return out
}

/** A job waiting for its first night, with nothing to read yet. */
function blank(id: NightKindId, name: string): NightKindView {
  const kind = NIGHT_KINDS.find((k) => k.id === id)!
  return { id, name, about: kind.about, when: null, count: 'Not run yet', trouble: null, misses: [], tracked: [], nights: [], fixes: [], lastAt: null, schedule: '' }
}

/** Needs fixing, whatever jobs say the same: one job's run failing is every
 *  kind it reads, so those are one line. */
export function needsFixing(jobs: readonly Pick<NightKindView, 'id' | 'name' | 'fixes'>[]): KindFix[] {
  const whole = new Map<string, { names: string[]; page: string }>()
  const fixes: KindFix[] = []
  for (const j of jobs) {
    for (const f of j.fixes) {
      if (!f.whole) {
        fixes.push(f)
        continue
      }
      const line = whole.get(f.why)
      if (line) line.names.push(j.name)
      else whole.set(f.why, { names: [j.name], page: f.page })
    }
  }
  const lines = [...whole].map(([why, { names, page }]): KindFix => ({ name: names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(' and '), why, page, whole: true }))
  return [...lines, ...fixes]
}

/** What a job's row says of its last run: "Last night", "Yesterday",
 *  "Sunday", "Oct 12". */
export function lastRunWord(iso: string, now: number, nightly: boolean): string {
  const at = Date.parse(iso)
  const zone = { timeZone: 'America/New_York' } as const
  const day = (t: number) => new Date(t).toLocaleDateString('en-CA', zone)
  const hours = (now - at) / 3_600_000
  if (nightly && hours < 30) return 'Last night'
  if (!nightly && day(at) === day(now)) return 'Today'
  if (!nightly && day(at) === day(now - 86_400_000)) return 'Yesterday'
  if (hours < 7 * 24) return new Date(at).toLocaleDateString('en-US', { weekday: 'long', ...zone })
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...zone })
}

/** The sentence at the top of the page. */
export function watchesSentence(jobs: readonly Pick<NightKindView, 'lastAt'>[], fixes: number): { tone: 'new' | 'good' | 'bad'; text: string } {
  if (fixes > 0) return { tone: 'bad', text: `${fixes} ${fixes === 1 ? 'thing needs' : 'things need'} fixing. The rest is fine.` }
  if (!jobs.some((j) => j.lastAt)) return { tone: 'new', text: 'Watches read the web each night and bring you what changed.' }
  return { tone: 'good', text: 'All fine. Nothing to fix.' }
}
