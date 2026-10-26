import type { CategoryConfig } from './categories'
import { closureText, closureWaits, type GooglePlace } from './googleJob'
import { hoursDidntLoad, hoursSection } from './hoursJob'
import { dishJobStatus, didntLoad, hospitalSection, type DishPlace } from './watchJobs'
import { eruvStanding, findingFor, websiteWatchOf, type EruvJobLoaded } from './eruvJob'
import { KOSHER_JOB_CATEGORIES, kosherSection, type KosherPlace, type NewOnList } from './kosherJob'
import { dishProposal } from './dishProposal'
import { watchHealth, type Watch } from './watches'
import { linkBroken, type LinkStanding } from './linkCheck'
import { routes } from './routes'

// ─────────────────────────────────────────────────────────────────────────────
// The Watches tab by kind of place (drawings settled Oct 24): a row per
// category of the site, each counting its places waiting for you, not
// checked, and up to date, and naming where they're read from. The jobs
// still do the reading; this only puts each job's own standing for a place
// together, so a place says one thing wherever it's shown.
//
//   waiting      something read differs from the listing: a page's,
//                Refuah's or a list's finding, a menu that would change
//                its dishes, a check against Google with changes, a
//                closure Google reports, or a place only a kosher list has
//   not checked  a field nothing checks, Google stopped answering, a
//                page or menu that can't be read or didn't load, or a
//                link the listing shows that doesn't open (linkCheck.ts)
//   up to date   the rest
//
// A place is in one of them, the first that fits. A job's first-night
// grace (read, not compared yet) is neither: it's up to date until it's
// compared.
//
// Waiting for you is in the agreed order (Oct 24): a place off a kosher
// list first, its pill red; then Google's closures; then new places; then
// changes.
// ─────────────────────────────────────────────────────────────────────────────

export type WatchState = 'waiting' | 'not_checked' | 'up_to_date'

/** Where a place is read from, in the order it's said. */
export type WatchSource = 'refuah' | 'google' | 'keystone' | 'mekor' | 'menu' | 'website' | 'newsletter' | 'email'
const SOURCES: readonly WatchSource[] = ['refuah', 'google', 'keystone', 'mekor', 'menu', 'website', 'newsletter', 'email']
const NAMED: Partial<Record<WatchSource, string>> = { refuah: 'Refuah', google: 'Google', keystone: 'Keystone-K', mekor: 'Mekor Habracha' }
const OWN: Partial<Record<WatchSource, [one: string, many: string]>> = {
  menu: ['its menu', 'menus'],
  website: ['its website', 'websites'],
  newsletter: ['its newsletter', 'newsletters'],
  email: ['its emails', 'emails'],
}

export type WatchedPlace = {
  id: string
  name: string
  category: string
  state: WatchState
  /** Why it waits or isn't checked ("3 changes", "Website didn’t load");
   *  none when up to date. */
  pill: string | null
  /** Off a kosher list: its pill is red. */
  red?: boolean
  /** Where it goes on Waiting for you: off a list, a closure, new, changes. */
  rank?: Rank
  sources: WatchSource[]
  /** Its listing on the site, for Open its listing; none for a place
   *  only a list has, or an eruv. */
  listing: string | null
}

/** Waiting for you's order. */
export type Rank = 'off' | 'closed' | 'new' | 'changes'
const RANKS: readonly Rank[] = ['off', 'closed', 'new', 'changes']

export type WatchCounts = { waiting: number; notChecked: number; upToDate: number }

export type WatchKind = { id: string; label: string; places: WatchedPlace[]; counts: WatchCounts; sources: WatchSource[] }

type Page = { watch: Watch }
type Found = { id: string; at?: string; operation?: string; from?: string }
export type PagesPlace = { id: string; name: string; href: string; pages: Page[]; off: boolean; findings?: readonly Found[]; decided?: { at: string } | null; newsletters?: readonly Watch[] }
export type DishesPlace = DishPlace & { id: string; name: string; href: string; pages?: readonly Watch[] }
/** A place whose own website is read with no job page of its own (a
 *  grocery's, a childcare's): what it finds waits under its kind's row. */
export type SitePlace = { id: string; name: string; category: string; href: string; pages: Page[]; findings?: readonly Found[] }
export type HospitalPlace = { id: string; name: string; href: string; watch: Watch | null; notOnRefuah: boolean; findings?: readonly Found[] }
export type KosherJob = {
  places: (KosherPlace & { href: string; findings?: readonly Found[] })[]
  newPlaces: (NewOnList & { findings?: readonly Found[] })[]
  others?: readonly (Found & { name: string; targetId: string | null; operation?: string; from?: string })[]
}

/** Each job's places as its page loads them; null, a job that didn't load. */
export type WatchJobsIn = {
  categories: readonly Pick<CategoryConfig, 'id' | 'pluralLabel' | 'kind' | 'hasAddress' | 'active'>[]
  google: readonly GooglePlace[] | null
  dishes: readonly DishesPlace[] | null
  hours: readonly PagesPlace[] | null
  times: readonly PagesPlace[] | null
  sites?: readonly SitePlace[] | null
  hospitals: readonly HospitalPlace[] | null
  kosher: KosherJob | null
  eruvim: EruvJobLoaded | null
  /** The weekly link check's links. */
  links?: readonly LinkStanding[] | null
}

const dayText = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const LIST_NAMES = { keystone: 'Keystone-K’s', mekor: 'Mekor Habracha’s' } as const

/** What one job says of a place: changes waiting, things not checked
 *  (each with its own pill), and where it reads it from. */
type Say = { changes: number; unchecked: string[]; sources: WatchSource[]; pill?: string; rank?: Rank; red?: boolean }

/** Its sources, as its row on Up to date says them: "Google · its website". */
export function placeSourcesText(sources: readonly WatchSource[]): string {
  return sources.map((s) => NAMED[s] ?? OWN[s]![0]).join(' · ')
}

/** A category's, all told: "Google · their websites · newsletters", and
 *  "menus · websites" (the drawing's). */
export function kindSourcesText(sources: readonly WatchSource[]): string {
  const firstOwn = sources.find((s) => OWN[s])
  const words = sources.map((s) => {
    const own = OWN[s]
    if (!own) return NAMED[s]!
    return s === firstOwn && s !== 'menu' ? `their ${own[1]}` : own[1]
  })
  const text = words.join(' · ')
  return text ? text[0].toUpperCase() + text.slice(1) : ''
}

/** The one that comes first on Waiting for you. */
const firstSay = (says: readonly Say[]) =>
  [...says].filter((s) => s.pill).sort((a, b) => RANKS.indexOf(a.rank ?? 'changes') - RANKS.indexOf(b.rank ?? 'changes'))[0]

function pillOf(state: WatchState, says: readonly Say[]): string | null {
  if (state === 'waiting') {
    const own = firstSay(says)
    if (own) return own.pill!
    return plural(says.reduce((n, s) => n + s.changes, 0), 'change')
  }
  if (state === 'not_checked') {
    const things = says.flatMap((s) => s.unchecked)
    return things.length === 1 ? things[0] : `${things.length} not checked`
  }
  return null
}

function placeOf(id: string, name: string, category: string, listingHref: string, says: readonly Say[]): WatchedPlace {
  const waiting = says.find((s) => s.changes > 0 || s.pill)
  const unchecked = says.find((s) => s.unchecked.length > 0)
  const state: WatchState = waiting ? 'waiting' : unchecked ? 'not_checked' : 'up_to_date'
  const have = new Set(says.flatMap((s) => s.sources))
  const first = state === 'waiting' ? firstSay(says) : undefined
  return {
    id,
    name,
    category,
    state,
    pill: pillOf(state, says),
    ...(state === 'waiting' ? { rank: first?.rank ?? 'changes', ...(first?.red ? { red: true } : {}) } : {}),
    sources: SOURCES.filter((s) => have.has(s)),
    listing: listingHref,
  }
}

// ── What each job says ──────────────────────────────────────────────────────

function googleSays(p: GooglePlace): Say {
  const compare = p.decided ? null : p.compare
  const changes = compare?.rows.filter((r) => r.changed).length ?? 0
  const unchecked =
    p.section === 'cant_read'
      ? [p.failedAt ? `Google stopped answering ${dayText(p.failedAt)}` : 'Google not read yet']
      : p.fields.filter((f) => f.by.kind === 'nothing').map((f) => `${f.label} not checked`)
  const sources: WatchSource[] = []
  if (p.matched) sources.push('google')
  if (p.fields.some((f) => f.by.kind === 'website')) sources.push('website')
  // "Closed for now, says Google · Oct 12": on the site at once, waiting
  // for Keep closed or Show as open.
  if (closureWaits(p.closure)) {
    const pill = `${closureText(p.closure)}, says Google${p.closure.since ? ` · ${dayText(p.closure.since)}` : ''}`
    return { changes, unchecked, sources, pill, rank: 'closed' }
  }
  return { changes, unchecked, sources }
}

function dishesSays(p: DishesPlace, now: number): Say {
  const status = dishJobStatus(p, now)
  let changes = 0
  if (status === 'differs') {
    const r = p.reading
    const menu = r?.status === 'proposed' ? dishProposal(p, { dishes: r.dishes ?? [], missing: r.missing }).updates : 0
    changes = Math.max(1, (p.findings?.length ?? 0) + menu)
  }
  const unchecked =
    status === 'not_read' ? ['Menu never read'] : status === 'cant_read' ? ['Menu can’t be read'] : status === 'didnt_load' ? ['Menu didn’t load'] : []
  const sources: WatchSource[] = []
  if (status !== 'off' && (p.menuWatch?.active || p.menuUrl || p.reading?.sourceUrl)) sources.push('menu')
  if (p.pages?.some((w) => w.active)) sources.push('website')
  return { changes, unchecked, sources }
}

function pagesSays(p: PagesPlace, job: 'hours' | 'times', now: number): Say {
  const state = { pages: p.pages.map((x) => x.watch), off: p.off, waiting: p.findings?.length, decidedAt: p.decided?.at, newsletters: p.newsletters }
  const section = hoursSection(state, now)
  const what = job === 'times' ? 'Times' : 'Hours'
  const unchecked =
    section === 'to_check' ? [] : hoursDidntLoad(state, now) ? ['Website didn’t load'] : section === 'cant_read' ? [`${what} can’t be read`] : []
  const sources: WatchSource[] = []
  if (!p.off && p.pages.some((x) => x.watch.active)) sources.push('website')
  if (p.newsletters?.some((w) => w.active)) sources.push('newsletter')
  // A page that differs, not yet a finding, is one change.
  return { changes: section === 'to_check' ? Math.max(1, p.findings?.length ?? 0) : 0, unchecked, sources }
}

function siteSays(p: SitePlace, now: number): Say {
  const live = p.pages.filter((x) => x.watch.active).map((x) => x.watch)
  const changes = p.findings?.length ?? 0
  const loads = live.some((w) => !['failing', 'stale'].includes(watchHealth(w, now).state))
  return { changes, unchecked: changes || !live.length || loads ? [] : ['Website didn’t load'], sources: live.length ? ['website'] : [] }
}

function hospitalSays(h: HospitalPlace, now: number): Say {
  const section = hospitalSection({ watch: h.watch, notOnRefuah: h.notOnRefuah, waiting: h.findings?.length }, now)
  const unchecked = section !== 'cant_read' ? [] : h.watch && didntLoad(h.watch, now) ? ['Refuah didn’t load'] : ['Not found on Refuah']
  const sources: WatchSource[] = h.watch?.active && !h.notOnRefuah ? ['refuah'] : []
  return { changes: section === 'to_check' ? Math.max(1, h.findings?.length ?? 0) : 0, unchecked, sources }
}

/** "Off Keystone-K’s list · Oct 24", red: a list's removal. */
function offSay(f: Found): Say | null {
  if (f.operation !== 'delete' || !f.from) return null
  return { changes: 1, unchecked: [], sources: [], pill: `Off ${f.from}${f.at ? ` · ${dayText(f.at)}` : ''}`, rank: 'off', red: true }
}

function kosherSays(p: KosherJob['places'][number]): Say {
  const waiting = p.findings?.length ?? 0
  const open = kosherSection({ ...p, waiting }) === 'to_check'
  const sources = [...new Set(p.on.map((o) => o.list))]
  const off = (p.findings ?? []).map((f) => offSay(f)).find((x) => x)
  if (off) return { ...off, changes: Math.max(1, waiting), sources }
  return { changes: open ? Math.max(1, waiting) : 0, unchecked: [], sources }
}

// ── All of it, by kind of place ─────────────────────────────────────────────

/** The categories whose places nothing reads: ones with no address, which
 *  Google doesn't look for, and no job takes up. */
export function notWatched(categories: WatchJobsIn['categories']): string[] {
  return categories.filter((c) => c.kind === 'listing' && c.hasAddress === false && c.active !== false).map((c) => c.pluralLabel)
}

export function watchKinds(jobs: WatchJobsIn, base: string, now: number): WatchKind[] {
  const says = new Map<string, Say[]>()
  const add = (id: string, say: Say) => says.set(id, [...(says.get(id) ?? []), say])
  for (const p of jobs.dishes ?? []) add(p.id, dishesSays(p, now))
  for (const p of jobs.hours ?? []) add(p.id, pagesSays(p, 'hours', now))
  for (const p of jobs.times ?? []) add(p.id, pagesSays(p, 'times', now))
  for (const p of jobs.sites ?? []) add(p.id, siteSays(p, now))
  for (const h of jobs.hospitals ?? []) add(h.id, hospitalSays(h, now))
  for (const p of jobs.kosher?.places ?? []) add(p.id, kosherSays(p))
  // A link it shows that doesn't open, whatever reads the rest of it.
  const broken = new Map<string, LinkStanding>()
  for (const l of jobs.links ?? []) {
    if (!linkBroken(l)) continue
    add(l.resourceId, { changes: 0, unchecked: ['Link doesn’t open'], sources: [] })
    broken.set(l.resourceId, l)
  }
  // A list's finding that matches no place on its page now waits on the
  // listing it names, whatever its kind (a grocery), or on its own.
  const listed = new Set((jobs.google ?? []).map((g) => g.id))
  const loose: WatchedPlace[] = []
  for (const f of jobs.kosher?.others ?? []) {
    if (f.targetId && listed.has(f.targetId)) add(f.targetId, offSay(f) ?? { changes: 1, unchecked: [], sources: [] })
    else {
      const isNew = f.operation === 'create' && !!f.from
      const pill = isNew ? `New on ${f.from}${f.at ? ` · ${dayText(f.at)}` : ''}` : '1 change'
      loose.push({ id: f.id, name: f.name, category: KOSHER_JOB_CATEGORIES[0], state: 'waiting', pill, rank: isNew ? 'new' : 'changes', sources: [], listing: null })
    }
  }

  const byCategory = new Map<string, WatchedPlace[]>()
  const put = (p: WatchedPlace) => byCategory.set(p.category, [...(byCategory.get(p.category) ?? []), p])
  // Every listing the jobs read is one Google covers (googleJobRun.ts).
  // A name two listings share says its street ("The Kosher Grill · S Broad St").
  for (const g of jobs.google ?? []) put(placeOf(g.id, g.street ? `${g.name} · ${g.street}` : g.name, g.category, g.href, [googleSays(g), ...(says.get(g.id) ?? [])]))
  // A place whose website is read and Google doesn't cover (its category
  // has no address) is its kind's all the same.
  for (const p of jobs.sites ?? []) if (!listed.has(p.id)) put(placeOf(p.id, p.name, p.category, p.href, says.get(p.id) ?? []))
  // A place nothing else reads, its row for a link that doesn't open.
  const sites = new Set((jobs.sites ?? []).map((p) => p.id))
  for (const [id, l] of broken) if (!listed.has(id) && !sites.has(id)) put(placeOf(id, l.place, l.category, l.href, says.get(id) ?? []))
  for (const n of jobs.kosher?.newPlaces ?? []) {
    if (n.filed === 'decided' && !n.findings?.length) continue
    const lists = [...new Set(n.on.map((o) => o.list))]
    const at = n.findings?.map((f) => f.at).filter((x): x is string => !!x).sort()[0]
    const pill = `New on ${lists.map((l) => LIST_NAMES[l]).join(' and ')} list${lists.length > 1 ? 's' : ''}${at ? ` · ${dayText(at)}` : ''}`
    put({ id: `new:${n.name}`, name: n.name, category: KOSHER_JOB_CATEGORIES[0], state: 'waiting', pill, rank: 'new', sources: lists, listing: null })
  }
  loose.forEach(put)

  const eruvKind = jobs.categories.find((c) => c.kind === 'eruv')
  if (eruvKind && jobs.eruvim) {
    const d = jobs.eruvim
    for (const e of d.eruvim) {
      const watch = websiteWatchOf(e, d.watches)
      const s = eruvStanding(e, { finding: findingFor(d.findings, e.id), watch, now: new Date(now), timezone: d.timezone })
      const sources: WatchSource[] = []
      if (e.statusUrl || watch?.active) sources.push('website')
      if (e.statusEmail) sources.push('email')
      const state: WatchState = s.tab === 'to_check' ? 'waiting' : s.tab === 'cant_read' ? 'not_checked' : 'up_to_date'
      put({ id: e.id, name: e.name, category: eruvKind.id, state, pill: state === 'up_to_date' ? null : s.pill.text, ...(state === 'waiting' ? { rank: 'changes' as const } : {}), sources, listing: routes.eruv(base.split('/')[1], e.id) })
    }
  }

  return jobs.categories.flatMap((c) => {
    const places = byCategory.get(c.id)
    if (!places?.length) return []
    const n = (s: WatchState) => places.filter((p) => p.state === s).length
    const have = new Set(places.flatMap((p) => p.sources))
    return [
      {
        id: c.id,
        label: c.pluralLabel,
        places: [...places].sort((a, b) => RANKS.indexOf(a.rank ?? 'changes') - RANKS.indexOf(b.rank ?? 'changes') || a.name.localeCompare(b.name)),
        counts: { waiting: n('waiting'), notChecked: n('not_checked'), upToDate: n('up_to_date') },
        sources: SOURCES.filter((s) => have.has(s)),
      },
    ]
  })
}
