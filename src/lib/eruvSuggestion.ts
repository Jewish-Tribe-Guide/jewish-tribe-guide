import { formatPhone, isHttpUrl, normalizeUrl } from './validation'
import { selectValues, type CategoryField } from './categories'
import type { Eruv } from './eruv'
import { readEruvDetails } from './eruvFields'

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
export type EruvSuggestion = { eruvId: string; name: string } & Record<EruvSuggestionField, string | null> & {
  /** The page's own fields it changes (Nov 9, eruvFields.ts), each to its
   *  new value, or null to empty it. A field it doesn't name is left as it
   *  is. With them, the fields as the page had them, to word them in the
   *  queue and the email however the page changes after. */
  details?: Record<string, OwnValue | null>
  detailFields?: OwnField[]
}

type OwnValue = string | boolean | string[]
/** What's kept of one of the page's own fields: enough to word its value. */
export type OwnField = Pick<CategoryField, 'key' | 'label' | 'type'> & Partial<Pick<CategoryField, 'options' | 'filterLabel'>>

/** A value of one of the page's own fields, as words: empty when it holds
 *  nothing. */
export function ownWords(f: OwnField, v: unknown): string {
  if (f.type === 'boolean') return v === true ? 'Yes' : ''
  if (f.type === 'select') return selectValues(v).map((x) => f.options?.find((o) => o.value === x)?.label ?? x).join(', ')
  if (Array.isArray(v)) return v.join(', ')
  if (f.type === 'tel') return typeof v === 'string' && v.trim() ? formatPhone(v) : ''
  return typeof v === 'string' ? v.trim() : ''
}

const keptOf = (f: CategoryField): OwnField => ({ key: f.key, label: f.label, type: f.type, ...(f.options && { options: f.options }), ...(f.filterLabel && { filterLabel: f.filterLabel }) })

const MAX = { covers: 600, website: 300, hotline: 120, alertsUrl: 300 } satisfies Record<EruvSuggestionField, number>

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ') : null)

/** A suggestion as sent, read against the eruv as it is: tidied (a website
 *  typed without https:// gets it), checked, and refused when it changes
 *  nothing. */
export function readEruvSuggestion(raw: unknown, current: Eruv, own: readonly CategoryField[] = []): { ok: true; suggestion: EruvSuggestion } | { ok: false; errors: string[] } {
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
  // The page's own fields: each one sent, read as an eruv keeps it, and
  // kept only when it differs from what the eruv has.
  const sent = body.details && typeof body.details === 'object' && !Array.isArray(body.details) ? (body.details as Record<string, unknown>) : null
  if (sent) {
    const details: Record<string, OwnValue | null> = {}
    const fields: OwnField[] = []
    for (const f of own) {
      if (!(f.key in sent)) continue
      let value: OwnValue | null = readEruvDetails({ [f.key]: sent[f.key] })?.[f.key] ?? null
      if (typeof value === 'string' && f.type === 'url') {
        value = normalizeUrl(value)
        if (!isHttpUrl(value)) errors.push(`${f.label} isn’t a web address.`)
      }
      if (ownWords(f, current.details?.[f.key]) === ownWords(f, value)) continue
      details[f.key] = value
      fields.push(keptOf(f))
    }
    if (fields.length > 0) Object.assign(suggestion, { details, detailFields: fields })
  }
  if (errors.length > 0) return { ok: false, errors }
  if (eruvChanges(current, suggestion).length === 0) return { ok: false, errors: ['Nothing was changed.'] }
  return { ok: true, suggestion }
}

/** The rows a suggestion changes, each before and after: what the queue
 *  and the admin's email show. */
export function eruvChanges(
  current: (Pick<Eruv, EruvSuggestionField> & Pick<Eruv, 'details'>) | null,
  suggestion: Partial<Record<EruvSuggestionField, string | null>> & Pick<EruvSuggestion, 'details' | 'detailFields'>,
): { key: string; label: string; before: string | null; after: string | null }[] {
  const columns = ERUV_SUGGESTION_FIELDS.flatMap((f) => {
    const before = current?.[f.key] ?? null
    const after = suggestion[f.key] ?? null
    // Spacing alone isn't a change: what's sent is tidied (text above).
    return text(before) === text(after) ? [] : [{ key: f.key, label: f.label, before, after }]
  })
  const own = (suggestion.detailFields ?? []).flatMap((f) => {
    if (!suggestion.details || !(f.key in suggestion.details)) return []
    const before = ownWords(f, current?.details?.[f.key]) || null
    const after = ownWords(f, suggestion.details[f.key]) || null
    return text(before) === text(after) ? [] : [{ key: f.key, label: f.label, before, after }]
  })
  return [...columns, ...own]
}

/** A suggestion as an admin approves it from Eruv status: with `only`, the
 *  rows Use this takes, the rest as the eruv has them now (so a row edited
 *  since it was read isn't put back); with `edited`, the admin's own copy
 *  from Edit, read as a visitor's is. */
export function eruvAsDecided(
  sent: EruvSuggestion,
  current: Eruv,
  { edited, only, own = [] }: { edited?: unknown; only?: readonly string[]; own?: readonly CategoryField[] },
): { ok: true; suggestion: EruvSuggestion } | { ok: false; errors: string[] } {
  // An Edit that leaves the page's own fields out keeps what was sent for
  // them.
  if (edited !== undefined) {
    const copy = edited && typeof edited === 'object' ? (edited as Record<string, unknown>) : {}
    return readEruvSuggestion('details' in copy || !sent.details ? copy : { ...copy, details: sent.details }, current, own)
  }
  const keep = new Set(only ?? [])
  const suggestion: EruvSuggestion = { eruvId: current.id, name: current.name, covers: null, website: null, hotline: null, alertsUrl: null }
  for (const f of ERUV_SUGGESTION_FIELDS) suggestion[f.key] = keep.has(f.key) ? sent[f.key] ?? null : current[f.key] ?? null
  const fields = (sent.detailFields ?? []).filter((f) => keep.has(f.key) && sent.details && f.key in sent.details)
  if (fields.length > 0) Object.assign(suggestion, { details: Object.fromEntries(fields.map((f) => [f.key, sent.details![f.key]])), detailFields: fields })
  return { ok: true, suggestion }
}
