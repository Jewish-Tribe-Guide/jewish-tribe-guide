import { settles, watchHealth, type Watch } from './watches'

// ─────────────────────────────────────────────────────────────────────────────
// The Watches tab's jobs (the user, Oct 21): a row per thing the guide keeps
// current on its own, each with four counts (checked, to check, can't be
// read, didn't load today), opening a page with every place in it: Dishes
// (what was the Main dishes tab), Hospitals, Eruv status here, and Mikvah
// hours, Shul times (hoursJob.ts) and Kosher certification (kosherJob.ts).
//
// The counts are worked out here, from the same sections each job's page
// shows, so a row and the page it opens can't disagree.
//
// Pure: no network, no database.
// ─────────────────────────────────────────────────────────────────────────────

export type JobCounts = { checked: number; toCheck: number; cantRead: number; didntLoad: number }

// ── Dishes ──────────────────────────────────────────────────────────────────

export type DishReadingStatus = 'proposed' | 'approved' | 'skipped' | 'failed' | 'no_menu'
export type DishPlace = {
  website: string | null
  menuUrl: string | null
  dishes: readonly string[]
  menuAt?: string | null
  reading: { status: DishReadingStatus; readAt: string } | null
}

/** Its dishes came from a menu someone sent through the site ("+ Add"),
 *  approved after the tab last failed to read one, or said it had none.
 *  The tab's own approvals aren't this: their reading says approved. */
export function sentThroughSite(place: DishPlace): boolean {
  const r = place.reading
  if (!place.menuAt || place.dishes.length === 0) return false
  return !r || ((r.status === 'failed' || r.status === 'no_menu') && Date.parse(place.menuAt) > Date.parse(r.readAt))
}

/** The Dishes page's sections. */
export function dishSections<P extends DishPlace>(places: readonly P[]) {
  const of = (status: DishReadingStatus) => places.filter((p) => p.reading?.status === status && !sentThroughSite(p))
  return {
    approved: of('approved'),
    toCheck: of('proposed'),
    unread: places.filter((p) => !p.reading && (p.website || p.menuUrl) && !sentThroughSite(p)),
    failed: [...of('failed'), ...places.filter((p) => !p.reading && !p.website && !p.menuUrl && !sentThroughSite(p))],
    noMenus: of('no_menu'),
    done: [...of('approved'), ...of('skipped'), ...places.filter(sentThroughSite)],
  }
}

/** A watch whose page didn't open on its last run, or that hasn't run in
 *  two days. */
export function didntLoad(w: Pick<Watch, 'active' | 'lastRunAt' | 'lastOkAt' | 'lastError' | 'failingSince'>, now: number): boolean {
  const state = watchHealth(w, now).state
  return state === 'failing' || state === 'stale'
}

export function dishCounts(places: readonly DishPlace[], menuWatches: readonly Watch[], now: number): JobCounts {
  const s = dishSections(places)
  return { checked: s.done.length, toCheck: s.toCheck.length, cantRead: s.failed.length, didntLoad: menuWatches.filter((w) => didntLoad(w, now)).length }
}

// ── Hospitals ───────────────────────────────────────────────────────────────

/** Where a hospital is on its page.
 *   to_check   Refuah has contacts the listing doesn't
 *   checked    Refuah's contacts agree with the listing
 *   nothing    matched, but Refuah lists nothing there yet
 *   waiting    matched, not compared with the listing yet (the next
 *              morning's run does it)
 *   cant_read  no Refuah page for it, or its page didn't load
 *   off        turned off, or said not to be on Refuah */
export type HospitalSection = 'to_check' | 'checked' | 'nothing' | 'waiting' | 'cant_read' | 'off'

/** `waiting`: how many of Refuah's findings for it wait on the page; given,
 *  a difference already decided there (Update or Skip) is settled. */
export type HospitalState = { watch: Watch | null; notOnRefuah: boolean; waiting?: number }

export function hospitalSection(h: HospitalState, now: number): HospitalSection {
  if (h.notOnRefuah || (h.watch && !h.watch.active)) return 'off'
  if (h.waiting) return 'to_check'
  if (!h.watch) return 'cant_read'
  const state = watchHealth(h.watch, now).state
  if (state === 'failing' || state === 'stale') return 'cant_read'
  // Read, but what it found wasn't kept (before this branch's runs, or
  // migration 085): not known to agree.
  if (state === 'waiting' || !h.watch.lastCheck) return 'waiting'
  const result = h.watch.lastCheck.result
  if (result === 'differs') return settles(h.watch.lastCheck, h.waiting) ? 'checked' : 'to_check'
  if (result === 'nothing') return 'nothing'
  return 'checked'
}

export function hospitalCounts(hospitals: readonly HospitalState[], now: number): JobCounts & { nothing: number } {
  const of = (s: HospitalSection) => hospitals.filter((h) => hospitalSection(h, now) === s).length
  return {
    checked: of('checked'),
    toCheck: of('to_check'),
    cantRead: hospitals.filter((h) => !h.notOnRefuah && !h.watch).length,
    didntLoad: hospitals.filter((h) => h.watch?.active && didntLoad(h.watch, now)).length,
    nothing: of('nothing'),
  }
}

// ── Eruv status ─────────────────────────────────────────────────────────────

/** Where an eruv is on its page.
 *   read        its page or its email was read, and the site shows what it said
 *   didnt_load  its page didn't open on the last read, so the site shows no
 *               current status
 *   email       an email from it the reader couldn't make out, waiting for
 *               an admin to say what it says
 *   no_source   nowhere to read it from */
export type EruvSection = 'read' | 'didnt_load' | 'email' | 'no_source'

export type EruvState = {
  statusUrl: string | null
  statusEmail?: string | null
  statusEmailKept?: unknown
  statusErrorAt: string | null
  statusCheckedAt: string | null
}

export function eruvSection(e: EruvState): EruvSection {
  if (!e.statusUrl && !e.statusEmail) return 'no_source'
  if (e.statusEmailKept) return 'email'
  if (e.statusUrl && e.statusErrorAt && (!e.statusCheckedAt || Date.parse(e.statusErrorAt) > Date.parse(e.statusCheckedAt))) return 'didnt_load'
  return 'read'
}

/** An eruv's counts never have anything to check: its status goes live
 *  with no approval (the drawing's "goes live"). */
export type EruvCounts = Omit<JobCounts, 'toCheck'> & { toCheck: null }

export function eruvCounts(eruvim: readonly EruvState[]): EruvCounts {
  const of = (s: EruvSection) => eruvim.filter((e) => eruvSection(e) === s).length
  return { checked: of('read'), toCheck: null, cantRead: of('no_source') + of('email'), didntLoad: of('didnt_load') }
}
