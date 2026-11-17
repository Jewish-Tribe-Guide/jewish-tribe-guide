import type { JobId, KindCount, NightKindId } from './jobRuns'
import { changeDay, changeTime } from './whatChanged'

// ── What each night validated, for Activity (the user, Nov 17) ──────────────
// Each night is one quiet row in What changed, under its day at the time it
// ran: "Validated · 132 against Google · 119 against their own websites ·
// 2 AM" (canvas 6YK3gNdSPEZyhz3E1nYchS, W1-W3). It opens the night's own
// page: what was validated, a group per kind, every row a listing and the
// source only in the heading (X4, X5). Only what was validated is said: a
// place that didn't match just isn't counted, and what couldn't be read
// stays in the admin (the user). Validated means a check read the source
// and found it as we have it (validatedDuring.ts), whether or not the
// listing shows a date for it (the user, Nov 17: "I don't view those as
// the same thing"): a box dated "Confirmed by …", a menu still naming the
// listing's dishes, an eruv website still showing its hotline or alerts
// link, and for Google a listing it answered for that is as Google has it
// (countGoogleKinds).
// Pure: nightsStore.ts reads the runs, the two pages draw it.

/** The two jobs whose runs make a night: Google at 1 AM, the watches at 2
 *  (Philadelphia, in winter). */
export const NIGHT_JOBS: readonly JobId[] = ['sync-hours', 'watches']

export type NightRun = { job: JobId; startedAt: string; finishedAt: string | null; kinds: Partial<Record<NightKindId, KindCount>> | null }

export type GroupId = 'google' | 'times' | 'hours' | 'menus' | 'sites' | 'other' | 'contact' | 'eruvs' | 'hospitals' | 'kosher'

/** The night page's headings, in its order. */
export const GROUP_TITLES: Record<GroupId, string> = {
  google: 'Open or closed, against Google',
  times: 'Shul times, against their websites',
  hours: 'Hours, against their websites',
  menus: 'Dishes, against their menus',
  sites: 'Phone, email and hours, against their websites',
  other: 'Details, against their websites',
  contact: 'Phone and email, against their websites',
  eruvs: 'Eruv hotlines and alerts, against their websites',
  hospitals: 'Hospitals, against Refuah',
  kosher: 'Hechsher, against the kosher agencies’ lists',
}

const GROUP_ORDER = Object.keys(GROUP_TITLES) as GroupId[]

/** The groups the timeline row counts as "their own websites". */
export const OWN_WEBSITES: readonly GroupId[] = ['times', 'hours', 'menus', 'sites', 'other', 'contact', 'eruvs']

export type Night = {
  /** Its date where the community is, YYYY-MM-DD: its page's address. */
  key: string
  /** When its first run started, and its last finished. */
  at: string
  until: string
  groups: { id: GroupId; ids: string[] }[]
}

const dateIn = (at: string, timezone: string) => new Date(Date.parse(at)).toLocaleDateString('en-CA', { timeZone: timezone })

/** The nights in these runs, newest first. A job run twice in a night
 *  counts its latest run. A night that validated nothing has no row. */
export function nightsFrom(runs: readonly NightRun[], timezone: string): Night[] {
  const latest = new Map<string, NightRun>()
  for (const r of runs) {
    if (!NIGHT_JOBS.includes(r.job)) continue
    const k = `${dateIn(r.startedAt, timezone)} ${r.job}`
    const had = latest.get(k)
    if (!had || Date.parse(r.startedAt) > Date.parse(had.startedAt)) latest.set(k, r)
  }
  const byNight = new Map<string, NightRun[]>()
  for (const [k, r] of latest) {
    const key = k.split(' ')[0]
    byNight.set(key, [...(byNight.get(key) ?? []), r])
  }

  const nights: Night[] = []
  for (const [key, own] of byNight) {
    const ids = new Map<GroupId, Set<string>>()
    const put = (id: GroupId, list: readonly string[] | undefined) => {
      for (const x of list ?? []) (ids.get(id) ?? ids.set(id, new Set()).get(id)!).add(x)
    }
    for (const r of own) {
      const k = r.kinds ?? {}
      put('google', k.google?.validated)
      put('times', k.times?.validated)
      put('hours', k.hours?.validated)
      put('menus', k.menus?.validated)
      put('eruvs', k.eruvs?.validated)
      put('sites', k.sites?.validated)
      put('other', k.other?.validated)
      put('hospitals', k.hospitals?.validated)
      put('kosher', k.kosher?.validated)
      for (const kind of ['times', 'hours', 'sites', 'other'] as const) put('contact', k[kind]?.contact)
    }
    // A listing whose page agreed in full isn't also listed for its phone.
    for (const id of ['times', 'hours', 'sites', 'other'] as const) for (const x of ids.get(id) ?? []) ids.get('contact')?.delete(x)
    const groups = GROUP_ORDER.filter((g) => ids.get(g)?.size).map((g) => ({ id: g, ids: [...ids.get(g)!] }))
    if (groups.length === 0) continue
    const starts = own.map((r) => r.startedAt).sort()
    const ends = own.map((r) => r.finishedAt ?? r.startedAt).sort()
    nights.push({ key, at: starts[0], until: ends.at(-1)!, groups })
  }
  return nights.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

/** A night with each group's listings named, in order; ids no longer a
 *  live listing are dropped, so every count is of names shown. */
export type NamedNight = Omit<Night, 'groups'> & { groups: { id: GroupId; title: string; places: { id: string; name: string }[] }[] }

export function nameNight(night: Night, nameOf: (id: string) => string | undefined): NamedNight {
  const groups = night.groups
    .map((g) => ({
      id: g.id,
      title: GROUP_TITLES[g.id],
      places: g.ids.flatMap((id) => {
        const name = nameOf(id)
        return name ? [{ id, name }] : []
      }).sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.places.length > 0)
  return { ...night, groups }
}

/** The timeline's row: what it says, without the time. */
export type NightRow = { key: string; at: string; google: number; own: number }

export function nightRow(night: NamedNight): NightRow | null {
  const count = (ids: readonly GroupId[]) => new Set(night.groups.filter((g) => ids.includes(g.id)).flatMap((g) => g.places.map((p) => p.id))).size
  const row = { key: night.key, at: night.at, google: count(['google']), own: count(OWN_WEBSITES) }
  return row.google || row.own ? row : null
}

/** "Validated · 132 against Google · 119 against their own websites". */
export function nightLine(row: Pick<NightRow, 'google' | 'own'>): string[] {
  return [row.google > 0 && `${row.google} against Google`, row.own > 0 && `${row.own} against their own websites`].filter((p): p is string => !!p)
}

/** The night page's title: "Validated last night", or "Validated Sunday,
 *  Nov 15" (the day its row is under). */
export function nightTitle(night: Pick<Night, 'at'>, now: number, timezone: string): string {
  const day = changeDay(night.at, now, timezone)
  if (day === 'Today') return 'Validated last night'
  if (day === 'Yesterday') return 'Validated yesterday'
  return `Validated ${new Date(Date.parse(night.at)).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: timezone })}`
}

/** "1–3 AM", "11 PM–1 AM", "2 AM". */
export function nightHours(night: Pick<Night, 'at' | 'until'>, timezone: string): string {
  const hour = (at: string) => {
    const t = new Date(Date.parse(at)).toLocaleTimeString('en-US', { hour: 'numeric', timeZone: timezone })
    const [h, period] = t.split(' ')
    return { h, period }
  }
  const from = hour(night.at)
  // Up to the hour it finished in: a run that ends at 2:40 ran "1–3 AM".
  const end = Date.parse(night.until)
  const to = hour(new Date(end + (end % 3_600_000 === 0 ? 0 : 3_600_000)).toISOString())
  if (from.h === to.h && from.period === to.period) return `${from.h} ${from.period}`
  return from.period === to.period ? `${from.h}–${to.h} ${to.period}` : `${from.h} ${from.period}–${to.h} ${to.period}`
}

/** Under the night page's title: "Today, 1–3 AM". */
export function nightWhen(night: Pick<Night, 'at' | 'until'>, now: number, timezone: string): string {
  return `${changeDay(night.at, now, timezone)}, ${nightHours(night, timezone)}`
}

export { changeTime as nightTime }
