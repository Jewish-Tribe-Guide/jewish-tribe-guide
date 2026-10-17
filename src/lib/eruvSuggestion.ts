import { isHttpUrl, normalizeUrl } from './validation'
import type { Eruv } from './eruv'

// ── An eruv's details, as a visitor suggests them (Oct 13) ──────────────────
// Its listing's own rows: where it goes, its site, its hotline, its email
// alerts. Anyone can suggest a fix ("wrong website or number"), sent to the
// moderation queue like a listing's edit, and live only once an admin
// approves it. Its name, status page and map stay the admin's (the Eruvim
// tab): they decide what the guide reads, not what the listing says.

export type EruvSuggestionField = 'covers' | 'website' | 'hotline' | 'alertsUrl'

export const ERUV_SUGGESTION_FIELDS: { key: EruvSuggestionField; label: string; url?: boolean; long?: boolean }[] = [
  { key: 'covers', label: 'Where it goes', long: true },
  { key: 'website', label: 'Website', url: true },
  { key: 'hotline', label: 'Hotline' },
  { key: 'alertsUrl', label: 'Email alerts', url: true },
]

/** What's kept on the submission: the four rows as suggested, the eruv's
 *  name to title it in the queue and the emails, and its id (here, not in
 *  the submission's target_id, which holds a listing's uuid). */
export type EruvSuggestion = { eruvId: string; name: string } & Record<EruvSuggestionField, string | null>

const MAX = { covers: 600, website: 300, hotline: 120, alertsUrl: 300 } satisfies Record<EruvSuggestionField, number>

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ') : null)

/** A suggestion as sent, read against the eruv as it is: tidied (a website
 *  typed without https:// gets it), checked, and refused when it changes
 *  nothing. */
export function readEruvSuggestion(raw: unknown, current: Eruv): { ok: true; suggestion: EruvSuggestion } | { ok: false; errors: string[] } {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const errors: string[] = []
  const suggestion: EruvSuggestion = { eruvId: current.id, name: current.name, covers: null, website: null, hotline: null, alertsUrl: null }
  for (const f of ERUV_SUGGESTION_FIELDS) {
    let value = text(body[f.key])
    if (value && f.url) {
      value = normalizeUrl(value)
      if (!isHttpUrl(value)) errors.push(`${f.label} isn’t a web address.`)
    }
    if (value && value.length > MAX[f.key]) errors.push(`${f.label} is too long.`)
    suggestion[f.key] = value
  }
  if (errors.length > 0) return { ok: false, errors }
  if (eruvChanges(current, suggestion).length === 0) return { ok: false, errors: ['Nothing was changed.'] }
  return { ok: true, suggestion }
}

/** The rows a suggestion changes, each before and after: what the queue
 *  and the admin's email show. */
export function eruvChanges(current: Pick<Eruv, EruvSuggestionField> | null, suggestion: Partial<Record<EruvSuggestionField, string | null>>): { key: EruvSuggestionField; label: string; before: string | null; after: string | null }[] {
  return ERUV_SUGGESTION_FIELDS.flatMap((f) => {
    const before = current?.[f.key] ?? null
    const after = suggestion[f.key] ?? null
    // Spacing alone isn't a change: what's sent is tidied (text above).
    return text(before) === text(after) ? [] : [{ key: f.key, label: f.label, before, after }]
  })
}
