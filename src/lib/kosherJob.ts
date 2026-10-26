import { selectValues } from './categories'
import {
  KEYSTONE_CERT,
  baseName,
  compareKeystone,
  entryFor,
  findingKey as keystoneKey,
  keystoneSlug,
  type KeystoneEntry,
  type WatchFinding,
} from './keystoneWatch'
import { compareMekor, findingKey as mekorKey, matchEntries, type GuideListing, type MekorEntry, type MekorFinding } from './mekorWatch'
import type { JobCounts } from './watchJobs'

// ─────────────────────────────────────────────────────────────────────────────
// The Watches tab's Kosher certification page (step 5, Oct 21): every food
// place in the guide, with what Keystone-K's and Mekor Habracha's lists say
// about it, next to what the listing says. "Keystone-K's list is 'Kosher
// certification', with each food place on it or not" (the plan, Oct 21).
//
// It compares the same way the two lists' daily reads do (keystoneWatch.ts,
// mekorWatch.ts), so the page shows exactly what those reads file. What
// they file waits here, to compare (watchFindings.ts, step 6); what each
// difference became is worked out from what they filed before (FiledState).
//
// Pure: the route reads the lists and the database.
// ─────────────────────────────────────────────────────────────────────────────

export type KosherList = 'keystone' | 'mekor'

export const KOSHER_LIST_NAMES: Record<KosherList, string> = { keystone: 'Keystone-K’s list', mekor: 'Mekor Habracha’s list' }
const WHO: Record<KosherList, string> = { keystone: 'Keystone-K', mekor: 'Mekor Habracha' }

/** What became of a difference: a finding waiting to compare; one filed
 *  before and decided (not filed again until the list or the listing
 *  changes); or neither yet, so the next morning's read files it. */
export type FiledState = 'queued' | 'decided' | 'next'

/** A list that has the place: its name for it, its page, and what it says
 *  about its certification, in its own words. */
export type OnList = { list: KosherList; name: string; url: string; says: string }
export type Difference = { list: KosherList; line: string; filed: FiledState }

export type KosherPlace = {
  id: string
  name: string
  category: string
  /** What the listing says: its hechsherim, and meat, dairy or parve. */
  certs: string[]
  levels: string[]
  on: OnList[]
  differences: Difference[]
}

/** A place on a list that the guide doesn't have (or has only archived:
 *  that listing's name, and its id for Bring it back). */
export type NewOnList = { name: string; address: string; on: OnList[]; archived: string | null; archivedId: string | null; filed: FiledState }

/** Where a place is on the page.
 *   to_check    a list differs from it, and that waits here or will
 *   decided     a list differs, but that was decided before
 *   checked     on a list, and the list agrees
 *   not_listed  on neither list: its hechsher is one they don't cover, or
 *               it names none */
export type KosherSection = 'to_check' | 'decided' | 'checked' | 'not_listed'

/** `waiting`: how many of the lists' findings for it wait on the page
 *  (watchFindings.ts), whatever the lists say now. */
export function kosherSection(p: Pick<KosherPlace, 'on' | 'differences'> & { waiting?: number }): KosherSection {
  if (p.waiting || p.differences.some((d) => d.filed !== 'decided')) return 'to_check'
  if (p.differences.length) return 'decided'
  return p.on.length ? 'checked' : 'not_listed'
}

/** Suggestions each list's read filed before, by what they propose
 *  (each module's submissionKey), split by whether they still wait. */
export type Filed = { pending: ReadonlySet<string>; settled: ReadonlySet<string> }
const NOTHING_FILED: Filed = { pending: new Set(), settled: new Set() }

function filedState(key: string, filed: Filed): FiledState {
  if (filed.pending.has(key)) return 'queued'
  return filed.settled.has(key) ? 'decided' : 'next'
}

const join = (xs: readonly string[], none: string) => (xs.length ? xs.join(', ') : none)

function keystoneOn(e: KeystoneEntry): OnList {
  return { list: 'keystone', name: e.name, url: e.url, says: e.certification || e.levels.join(', ') }
}
function mekorOn(e: MekorEntry): OnList {
  return { list: 'mekor', name: e.name, url: e.url, says: e.supervision }
}

/** A Keystone-K difference, in a line: what the list says, then what the
 *  listing says. */
function keystoneLines(f: Exclude<WatchFinding, { kind: 'new' }>): string[] {
  if (f.kind === 'gone') {
    return [f.remove ? 'Not on Keystone-K’s list any more, and Keystone-K is its only hechsher' : 'Not on Keystone-K’s list any more; the listing names Keystone-K']
  }
  const l = f.listing.details
  const out: string[] = []
  if (!selectValues(l.kosherCert).includes(KEYSTONE_CERT)) out.push('On Keystone-K’s list; the listing doesn’t name Keystone-K')
  if (f.details.k !== l.k) out.push(keystoneSlug(l) ? 'Its page on Keystone-K’s list has moved' : 'The listing has no link to its page on Keystone-K’s list')
  const ours = selectValues(l.t)
  const theirs: string[] = f.entry.levels
  if (theirs.length && (theirs.length !== ours.length || theirs.some((x) => !ours.includes(x)))) {
    out.push(`Keystone-K says ${theirs.join(', ')}; the listing says ${join(ours, 'neither meat, dairy nor parve')}`)
  }
  return out.length ? out : f.changes
}

function mekorLine(f: Exclude<MekorFinding, { kind: 'new' }>): string {
  if (f.kind === 'only-here') return 'The listing says IKC; Mekor Habracha’s list doesn’t have it'
  return `Mekor Habracha says ${join(f.entry.certs, 'no hechsher')}; the listing says ${join(selectValues(f.listing.details.kosherCert), 'no hechsher')}`
}

/** The places the page checks: Food (the user, Oct 22: "We only need to
 *  check Food, not grocery stores"). Groceries are still matched with the
 *  lists, so one on a list isn't a new place. */
export const KOSHER_JOB_CATEGORIES = ['restaurant']

export type KosherInput = {
  /** The food places, live and archived (Mekor's read says an archived
   *  place it still lists as such). */
  listings: GuideListing[]
  /** Each list's entries; null when it wasn't read (no watch, paused, or
   *  it didn't load). */
  keystone: KeystoneEntry[] | null
  mekor: MekorEntry[] | null
  filed?: Partial<Record<KosherList, Filed>>
}

export function kosherPlaces({ listings, keystone, mekor, filed = {} }: KosherInput): { places: KosherPlace[]; newPlaces: NewOnList[] } {
  const live = listings.filter((l) => l.status === 'approved')
  const on = new Map<string, OnList[]>(live.map((l) => [l.id, []]))
  const differences = new Map<string, Difference[]>(live.map((l) => [l.id, []]))
  const fresh: { on: OnList; address: string; archived: string | null; archivedId: string | null; filed: FiledState }[] = []

  if (keystone) {
    const k = filed.keystone ?? NOTHING_FILED
    for (const l of live) {
      const e = entryFor(l, keystone)
      if (e) on.get(l.id)!.push(keystoneOn(e))
    }
    for (const f of compareKeystone(keystone, live)) {
      const state = filedState(keystoneKey(f), k)
      if (f.kind === 'new') fresh.push({ on: keystoneOn(f.entry), address: f.entry.address, archived: null, archivedId: null, filed: state })
      else for (const line of keystoneLines(f)) differences.get(f.listing.id)!.push({ list: 'keystone', line, filed: state })
    }
  }

  if (mekor) {
    const m = filed.mekor ?? NOTHING_FILED
    for (const [slug, l] of matchEntries(mekor, listings).matched) {
      const e = mekor.find((x) => x.slug === slug)!
      on.get(l.id)?.push(mekorOn(e))
    }
    // Nothing left out as already in the queue: the page shows a new
    // place either way, and says where its suggestion is.
    for (const f of compareMekor(mekor, listings, [])) {
      const state = filedState(mekorKey(f), m)
      if (f.kind === 'new') fresh.push({ on: mekorOn(f.entry), address: f.entry.address, archived: f.archived?.name ?? null, archivedId: f.archived?.id ?? null, filed: state })
      else differences.get(f.listing.id)?.push({ list: 'mekor', line: mekorLine(f), filed: state })
    }
  }

  // A place new on both lists is one place.
  const newPlaces: NewOnList[] = []
  for (const f of fresh) {
    const same = newPlaces.find((n) => baseName(n.name) === baseName(f.on.name))
    if (!same) {
      newPlaces.push({ name: f.on.name, address: f.address, on: [f.on], archived: f.archived, archivedId: f.archivedId, filed: f.filed })
      continue
    }
    same.on.push(f.on)
    same.archived ??= f.archived
    same.archivedId ??= f.archivedId
    const states = [same.filed, f.filed]
    same.filed = states.includes('queued') ? 'queued' : states.includes('next') ? 'next' : 'decided'
  }

  return {
    places: live
      .filter((l) => KOSHER_JOB_CATEGORIES.includes(l.category))
      .map((l) => ({
        id: l.id,
        name: l.name,
        category: l.category,
        certs: selectValues(l.details.kosherCert),
        levels: selectValues(l.details.t),
        on: on.get(l.id)!,
        differences: differences.get(l.id)!,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    newPlaces: newPlaces.sort((a, b) => a.name.localeCompare(b.name)),
  }
}

/** Who says it, for a line: "Keystone-K", "Mekor Habracha". */
export const listWho = (list: KosherList) => WHO[list]

/** The page's counts, for its row on the Watches tab. To check counts the
 *  places a list differs from and the places only a list has, unless
 *  decided before; didn't load counts the lists. */
export function kosherCounts(places: readonly (KosherPlace & { waiting?: number })[], newPlaces: readonly NewOnList[], listsUnread: number): JobCounts & { notListed: number } {
  const of = (s: KosherSection) => places.filter((p) => kosherSection(p) === s).length
  return {
    checked: of('checked'),
    toCheck: of('to_check') + newPlaces.filter((n) => n.filed !== 'decided').length,
    cantRead: 0,
    didntLoad: listsUnread,
    notListed: of('not_listed'),
  }
}
