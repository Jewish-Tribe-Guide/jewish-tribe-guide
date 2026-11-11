import type { CategoryField } from './categories'
import type { Eruv } from './eruv'
import { readEruvSuggestion, type EruvSuggestion } from './eruvSuggestion'
import { eruvIdFor } from './eruvEdit'
import { senderEmail } from './eruvEmail'
import { sourceKind } from './watchPurposes'
import { senderAddress } from './newsletter'
import { isHttpUrl, normalizeUrl } from './validation'

// ── A new eruv, as a visitor suggests it (Nov 9) ────────────────────────────
// The user, Nov 9: "why can't a user add an eruv? like on main site?" Anyone
// can suggest one from the Eruv page's "+": its name, the Eruv page's fields,
// and, if they know them, where its status is posted and where its map is.
// It goes to the moderation queue as a new place does, and is added only
// when an admin approves it: its status is then read from what they gave,
// never from anything the visitor says about it.

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ') : null)

/** What's where its status is posted, kept as given: a web page, or the
 *  address its emails come from. Undefined when it's neither. */
function statusAt(raw: string): string | undefined {
  // "Eruv Committee <status@…>", as an email's From line is copied, too.
  if (sourceKind(raw) === 'email') return senderEmail(senderAddress(raw) ?? raw) ?? undefined
  const url = normalizeUrl(raw)
  return isHttpUrl(url) ? url : undefined
}

/** A new eruv as sent, checked: it needs a name no eruv here has already,
 *  and its links must be links. Its id is the one adding it will give it. */
export function readNewEruv(
  raw: unknown,
  eruvim: readonly Pick<Eruv, 'id' | 'name'>[],
  own: readonly CategoryField[] = [],
): { ok: true; suggestion: EruvSuggestion } | { ok: false; errors: string[] } {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const name = text(body.name)
  const id = name ? eruvIdFor(name) : ''
  if (!name || !id) return { ok: false, errors: ['Give the eruv a name.'] }
  if (name.length > 120) return { ok: false, errors: ['The name is too long.'] }
  const there = eruvim.find((e) => e.id === id || e.name.trim().toLowerCase() === name.toLowerCase())
  if (there) return { ok: false, errors: [`${there.name} is already listed. Suggest an edit to it instead.`] }

  const blank: Eruv = {
    id,
    name,
    covers: null,
    website: null,
    hotline: null,
    alertsUrl: null,
    statusUrl: null,
    statusDated: false,
    status: null,
    statusWords: null,
    statusPostedOn: null,
    statusCheckedAt: null,
    statusErrorAt: null,
    statusError: null,
    details: {},
  }
  const read = readEruvSuggestion(body, blank, own, { adding: true })
  const errors = read.ok ? [] : [...read.errors]

  const status = text(body.statusAt)
  const kept = status ? statusAt(status) : null
  if (kept === undefined) errors.push('Status isn’t a web address or an email address.')
  const map = text(body.map)
  const mapUrl = map ? normalizeUrl(map) : null
  if (mapUrl && !isHttpUrl(mapUrl)) errors.push('Map isn’t a web address.')

  if (errors.length > 0 || !read.ok) return { ok: false, errors }
  return { ok: true, suggestion: { ...read.suggestion, eruvId: id, name, statusAt: kept ?? null, map: mapUrl } }
}
