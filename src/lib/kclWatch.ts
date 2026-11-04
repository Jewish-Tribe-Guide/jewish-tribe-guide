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
// hechsher checked. Nothing is filed and nothing is added from it. A name
// on the list is never taken for a place that doesn't already say KCL
// ("Authentic Kosher Chinese" is on it; ours isn't KCL). Pure.
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
  const names = entries.map((e) => ({ name: e.name, key: compact(e.name) })).filter((e) => e.key)
  const out = new Map<string, string>()
  for (const l of listings) {
    if (l.status !== 'approved' || !selectValues(l.details.kosherCert).includes(KCL_CERT)) continue
    const key = compact(l.name)
    if (!key) continue
    const same = names.filter((e) => e.key === key)
    const found = same.length
      ? same
      : names.filter((e) => Math.min(e.key.length, key.length) >= MIN_PREFIX && (e.key.startsWith(key) || key.startsWith(e.key)))
    if (found.length === 1) out.set(l.id, found[0].name)
  }
  return out
}
