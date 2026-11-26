import type { NightKindId } from './jobRuns'
import type { NightKindView } from './nightKinds'
import { hasPlacesFor, lastRunWord } from './watchJobList'

// ── Watches: what's kept current (boards W1 and W2, Nov 25) ─────────────────
// The page used to list jobs by the source they read, with a sentence, Needs
// fixing, Look again and Needs one step around them. The user: "a box
// waiting to explode". Now it is one list, by what's kept current, each row
// saying where it's read from and when: "Minyan times · 14 shuls’ websites
// and emails · Last night". Google reads two things on two schedules (open
// or closed every night, the rest a seventh a night), so it is two rows.
// Shul emails have no row of their own: they're part of Minyan times and
// Eruv up or down, the two kinds whose emails are read. A new community sees
// every row, greyed, with what it has none of ("No shuls yet").

type Cat = Parameters<typeof hasPlacesFor>[1][number]

export type KeptRow = {
  key: string
  name: string
  /** Where it's read from: "14 shuls’ websites and emails". */
  from: string
  /** "Last night", "No shuls yet", or what's wrong ("Not since Oct 25"). */
  when: string
  tone: 'ok' | 'none' | 'bad'
  /** The job page it opens. */
  job: NightKindId
}

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** "A and B", "A, B and C". */
const andList = (names: readonly string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

const distinct = (names: readonly string[]) => [...new Set(names)]

type Spec = {
  key: string
  job: NightKindId
  name: string
  /** With nothing read yet. */
  none: string
  /** With nothing read yet, where from. */
  from0: string
  from: (job: NightKindView, all: Map<NightKindId, NightKindView>) => string
  nightly: boolean
}

const SPECS: Spec[] = [
  { key: 'open', job: 'google', name: 'Open or closed', none: 'No places yet', from0: 'Google', from: (j) => `Google · ${n(j.tracked.length, 'place', 'places')}`, nightly: true },
  { key: 'google', job: 'google', name: 'Hours, phone and website', none: 'No places yet', from0: 'Google', from: (j) => `Google · ${n(j.tracked.length, 'place', 'places')}, weekly`, nightly: true },
  {
    key: 'times',
    job: 'times',
    name: 'Minyan times',
    none: 'No shuls yet',
    from0: 'Shuls’ websites and emails',
    from: (j, all) => {
      const sites = distinct(j.tracked.map((t) => t.name))
      const emails = distinct((all.get('newsletters')?.tracked ?? []).filter((t) => !t.name.includes('@')).map((t) => t.name))
      const shuls = distinct([...sites, ...emails]).length
      return `${n(shuls, 'shul’s', 'shuls’')} ${[sites.length && 'websites', emails.length && 'emails'].filter(Boolean).join(' and ') || 'websites'}`
    },
    nightly: true,
  },
  { key: 'hours', job: 'hours', name: 'Mikvah hours', none: 'No mikvahs yet', from0: 'Mikvahs’ websites', from: (j) => `${n(distinct(j.tracked.map((t) => t.name)).length, 'mikvah’s website', 'mikvahs’ websites')}`, nightly: true },
  { key: 'sites', job: 'sites', name: 'Phone, email and hours', none: 'No places yet', from0: 'Places’ own websites', from: (j) => n(distinct(j.tracked.map((t) => t.name)).length, 'place’s website', 'places’ websites'), nightly: true },
  { key: 'menus', job: 'menus', name: 'Menus', none: 'No menus yet', from0: 'Restaurants’ menus', from: (j) => n(j.tracked.length, 'menu', 'menus'), nightly: true },
  { key: 'kosher', job: 'kosher', name: 'Kosher certification', none: 'No lists yet', from0: 'The agencies’ lists', from: (j) => andList(distinct(j.tracked.map((t) => t.name))), nightly: true },
  { key: 'eruvs', job: 'eruvs', name: 'Eruv up or down', none: 'No eruvs yet', from0: 'Eruvs’ pages and emails', from: (j) => `${n(distinct(j.tracked.map((t) => t.name)).length, 'eruv’s', 'eruvs’')} pages and emails`, nightly: true },
  { key: 'hospitals', job: 'hospitals', name: 'Hospitals', none: 'No hospitals yet', from0: 'Refuah', from: () => 'Refuah', nightly: true },
  { key: 'other', job: 'other', name: 'Other pages', none: '', from0: '', from: (j) => n(j.tracked.length, 'page', 'pages'), nightly: true },
  { key: 'links', job: 'links', name: 'Links', none: 'No links yet', from0: 'Every link nothing else reads, Sundays', from: () => 'Every link nothing else reads, Sundays', nightly: false },
]

/** Every row of Kept current, in the board's order. `kinds`: the jobs'
 *  views (nightKinds), `off`: jobs turned off here. */
export function keptCurrent(categories: readonly Cat[], kinds: readonly NightKindView[], off: readonly NightKindId[], now: number): KeptRow[] {
  const all = new Map(kinds.map((k) => [k.id, k]))
  const rows: KeptRow[] = []
  for (const s of SPECS) {
    const job = all.get(s.job)
    const read = !!job?.tracked.length
    // Pages added by hand: only when there are some.
    if (s.job === 'other' && !read) continue
    const base = { key: s.key, name: s.name, job: s.job }
    if (off.includes(s.job)) {
      rows.push({ ...base, from: read ? s.from(job!, all) : s.from0, when: 'Turned off', tone: 'none' })
      continue
    }
    if (!read) {
      rows.push({ ...base, from: s.from0, when: hasPlacesFor(s.job, categories) ? 'Nothing to read yet' : s.none, tone: 'none' })
      continue
    }
    // The job itself not running (late, failed) is the row's news.
    const whole = job!.fixes.find((f) => f.whole)
    const when = whole ? whole.why : job!.lastAt ? lastRunWord(job!.lastAt, now, s.nightly) : 'Not run yet'
    rows.push({ ...base, from: s.from(job!, all), when, tone: whole ? 'bad' : job!.lastAt ? 'ok' : 'none' })
  }
  return rows
}

/** A job page's title: its Kept current row's name ("Eruv up or down").
 *  Google keeps two rows, so its page keeps the job's own name. */
export function jobTitle(id: NightKindId, name: string): string {
  const rows = SPECS.filter((s) => s.job === id)
  return rows.length === 1 ? rows[0].name : name
}
