// ─────────────────────────────────────────────────────────────────────────────
// The KCL list watch (Nov 4).
//
// KCL (Kashrus Council of Lakewood) publishes the places it certifies as a
// PDF of names, linked "See Complete Listing" from its home page; the file's
// address changes with each edition, so the watch is on the home page. The
// user, Nov 4: "Can we add [it] to our kashrut checks for the ones that are
// KCL? Would be nice to get hechsher things off of not checked".
//
// The list has no addresses, no towns and no kinds, so it can only confirm:
// a listing the guide says is KCL, whose name is on the list, has its
// hechsher checked. Nothing is added from it. A name on the list is never
// taken for a place that doesn't already say KCL ("Authentic Kosher
// Chinese" is on it; ours isn't KCL).
//
// A listing that says KCL and that no name on the list could be gets a
// card in To do, to take KCL off or keep it (the user, Nov 18), as Mekor's
// watch does for IKC. Before, it was simply never dated, and nothing said
// why. One that two names could be is left alone: it may well be there.
// Pure.
// ─────────────────────────────────────────────────────────────────────────────

import { selectValues } from './categories'
import { baseName } from './keystoneWatch'

export const KCL_HOME_URL = 'https://www.kclkashrus.org/'
export const KCL_NAME = 'KCL'
const KCL_CERT = 'KCL'

/** KCL's home page, which links the current list. */
export function isKclList(url: string): boolean {
  try {
    const u = new URL(url)
    return /^(www\.)?kclkashrus\.org$/i.test(u.hostname) && /^\/?$/.test(u.pathname)
  } catch {
    return false
  }
}

/** The establishments PDF its home page links, or null. */
export function kclListLink(html: string, base: string): string | null {
  const href = html.match(/href=["']([^"']*KCL-Establishments[^"']*\.pdf)["']/i)?.[1]
  if (!href) return null
  try {
    return new URL(href, base).toString()
  } catch {
    return null
  }
}

export type KclEntry = { name: string }

const MONTH_YEAR = /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}$/i

/** The PDF's text, one name a line: its edition ("December 2025") and its
 *  names, each once (a page starts with the last page's last few). */
export function parseKclList(text: string): { updated: string | null; entries: KclEntry[] } {
  let updated: string | null = null
  const seen = new Set<string>()
  const entries: KclEntry[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || /certified establishments/i.test(line) || /^reminder$/i.test(line) || /^do not assume\b/i.test(line)) continue
    if (MONTH_YEAR.test(line)) {
      updated ??= line
      continue
    }
    if (seen.has(line)) continue
    seen.add(line)
    entries.push({ name: line })
  }
  return { updated, entries }
}

/** A name with its branch ("| Lakewood") and spaces gone: "Southside" and
 *  "South Side Smokehouse" start the same. */
function compact(name: string): string {
  return baseName(name.split(/\s+\|\s+/)[0]).replace(/ /g, '')
}

/** Shorter than this and a name starting another tells nothing. */
const MIN_PREFIX = 6

type KclListing = { id: string; name: string; status: string; details: Record<string, unknown> }

/** Each live listing that says KCL, by id, to the name it has on the list:
 *  the same name, or one starting the other. Only a single match counts. */
export function kclMatches(entries: KclEntry[], listings: KclListing[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const [l, found] of candidates(entries, listings)) if (found.length === 1) out.set(l.id, found[0])
  return out
}

/** Each live listing that says KCL, with the names on the list it could
 *  be: the same name, or else one starting the other. */
function candidates<L extends KclListing>(entries: KclEntry[], listings: readonly L[]): [L, string[]][] {
  const names = entries.map((e) => ({ name: e.name, key: compact(e.name) })).filter((e) => e.key)
  const out: [L, string[]][] = []
  for (const l of listings) {
    if (l.status !== 'approved' || !selectValues(l.details.kosherCert).includes(KCL_CERT)) continue
    const key = compact(l.name)
    if (!key) continue
    const same = names.filter((e) => e.key === key)
    const found = same.length
      ? same
      : names.filter((e) => Math.min(e.key.length, key.length) >= MIN_PREFIX && (e.key.startsWith(key) || key.startsWith(e.key)))
    out.push([l, found.map((e) => e.name)])
  }
  return out
}

// ── Listings the list doesn't have ───────────────────────────────────────────

/** submitted_by.name on every card the watch files. */
export const KCL_WATCH_NAME = 'KCL list (automated)'

/** A listing that says KCL and that no name on the list could be, with
 *  what approving its card leaves: the listing without KCL. */
export type KclMissing<L extends KclListing = KclListing> = { listing: L; details: Record<string, unknown> }

export function kclMissing<L extends KclListing>(entries: KclEntry[], listings: readonly L[]): KclMissing<L>[] {
  const keys = entries.map((e) => compact(e.name)).filter(Boolean)
  // Not even a name too short to match on ("Bagel", with "Bagel King" on
  // the list): that may be the place, so it isn't said to be missing.
  const anyStart = (l: L) => {
    const key = compact(l.name)
    return keys.some((k) => k.startsWith(key) || key.startsWith(k))
  }
  return candidates(entries, listings)
    .filter(([l, found]) => found.length === 0 && !anyStart(l))
    .map(([listing]) => ({ listing, details: { ...listing.details, kosherCert: selectValues(listing.details.kosherCert).filter((c) => c !== KCL_CERT) } }))
}

/** The card's note: what the list lacks, and what each button does. */
export function kclMissingNote(f: KclMissing, updated: string | null): string {
  const left = selectValues(f.details.kosherCert)
  return [
    `The guide says KCL, and KCL's list of the places it certifies doesn't have this place by this name: ${KCL_HOME_URL}`,
    'The list is names only, so a place it lists under another name looks missing here: check the place’s own certificate before approving.',
    left.length
      ? `Approving takes KCL off; ${left.join(', ')} stays. Rejecting keeps KCL.`
      : 'Approving takes KCL off, which leaves it with no hechsher named: edit in the right one first. Rejecting keeps KCL.',
    updated && `KCL's list is the ${updated} edition.`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** What a card proposes, so it isn't filed twice: once rejected, it stays
 *  rejected until the listing's hechshers change. */
export function kclMissingKey(f: KclMissing): string {
  return `cert:${f.listing.id}:${proposal(f.details)}`
}

/** The same key, read back from a card the watch filed earlier. */
export function kclSubmissionKey(s: { operation: string; target_id: string | null; payload: Record<string, unknown> }): string | null {
  if (s.operation !== 'update' || !s.target_id) return null
  return `cert:${s.target_id}:${proposal((s.payload.details ?? {}) as Record<string, unknown>)}`
}

function proposal(d: Record<string, unknown>): string {
  return JSON.stringify([...selectValues(d.kosherCert)].sort())
}
