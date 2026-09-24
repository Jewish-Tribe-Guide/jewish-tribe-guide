import { selectValues, type CategoryField, type FieldType } from './categories'
import { DAY_KEYS, dayLabel, fmt12, formatHoursSummary, isStructuredHours, type DayKey, type DayHours } from './hours'
import type { DirectoryResource, ResourceSubmission } from '@/types'

type Proposed = Pick<ResourceSubmission, 'name' | 'address' | 'phone' | 'details'>

// Trim/stringify normalization shared in spirit with submissionStore.ts's own
// normalizeForCompare (used there for Google-sync field ownership) — kept as
// a separate copy since that one lives in a server-only module and this
// needs to run client-side too.
function normalize(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return stableStringify(value)
  return String(value).trim()
}

/** JSON with object keys sorted, so two values built in a different key
 *  order (a minyan edited field by field) still compare equal. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')

/** A URL as the place it points to: scheme, "www." and a trailing slash are
 *  how it was typed, not where it goes ("example.com" and
 *  "https://www.example.com/" are the same link). */
function urlKey(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
}

const ADDRESS_WORDS: Record<string, string> = {
  street: 'st', avenue: 'ave', road: 'rd', boulevard: 'blvd', drive: 'dr', lane: 'ln',
  place: 'pl', court: 'ct', parkway: 'pkwy', highway: 'hwy', suite: 'ste', north: 'n',
  south: 's', east: 'e', west: 'w',
}

/** An address as a place: case, punctuation, the country suffix and the
 *  usual street-word abbreviations are formatting, not location — the
 *  address picker returns "…Street, …, USA" for a place stored as "…St, …". */
function addressKey(v: unknown): string {
  return String(v ?? '')
    .toLowerCase()
    .replace(/,?\s*(usa|united states( of america)?)\s*$/, '')
    .replace(/[.,#]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ADDRESS_WORDS[w] ?? w)
    .join(' ')
}

/** Hours as what they mean: a day with no entry is closed, the same as an
 *  explicit null; a legacy free-text value compares as its trimmed text. */
function canonicalHours(v: unknown): string {
  if (v === undefined || v === null || v === '') return ''
  if (typeof v === 'string') return `text:${v.trim()}`
  if (!isStructuredHours(v)) return normalize(v)
  const h = v as Record<string, DayHours | undefined>
  return DAY_KEYS.map((k) => {
    const d = h[k]
    return d ? `${d.open}-${d.close}` : 'closed'
  }).join('|')
}

/** The days whose hours differ, in week order — for "1 day changed · Monday"
 *  on a collapsed hours line. Empty unless both sides are structured. */
export function changedHoursDays(before: unknown, after: unknown): DayKey[] {
  if (!isStructuredHours(before) || !isStructuredHours(after)) return []
  const b = before as Record<string, DayHours | undefined>
  const a = after as Record<string, DayHours | undefined>
  return DAY_KEYS.filter((k) => {
    const x = b[k] ?? null
    const y = a[k] ?? null
    if (x === null || y === null) return x !== y
    return x.open !== y.open || x.close !== y.close
  })
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? (v as unknown[]).map((x) => String(x).trim()).filter(Boolean) : [])
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000')

/**
 * Whether two values of one field mean the same thing — the rule behind
 * both "No changes yet" and every "changed" mark in the editor. Formatting
 * never counts as a change: typing a value and then deleting back to it,
 * re-picking the same address, a phone number with different punctuation,
 * tags in a different order, an unset yes/no versus "No".
 */
export function sameFieldValue(type: FieldType | 'name' | 'address' | 'phone', a: unknown, b: unknown): boolean {
  switch (type) {
    case 'address':
      return addressKey(a) === addressKey(b)
    case 'phone':
    case 'tel':
      return digits(a) === digits(b)
    case 'url':
      return urlKey(a) === urlKey(b)
    case 'boolean':
      return !!a === !!b
    case 'select':
      return sameSet(selectValues(a), selectValues(b))
    case 'tags':
      return sameSet(asList(a), asList(b))
    case 'hours':
      return canonicalHours(a) === canonicalHours(b)
    case 'number':
      return normalize(a) === normalize(b) || (normalize(a) !== '' && Number(a) === Number(b))
    default:
      return normalize(a) === normalize(b)
  }
}

export type ListingChange = {
  /** 'name' | 'address' | 'phone', or the detail field's own key. */
  key: string
  label: string
  before: unknown
  after: unknown
  /** One line for the summary above Send, e.g. "Parve → Dairy". */
  summary: string
}

function optionLabel(field: CategoryField, v: string): string {
  return field.options?.find((o) => o.value === v)?.label ?? v
}

function describe(field: CategoryField, v: unknown): string {
  switch (field.type) {
    case 'boolean':
      return (field.invertDisplay ? !v : !!v) ? 'Yes' : 'No'
    case 'select': {
      const vals = selectValues(v)
      return vals.length ? vals.map((x) => optionLabel(field, x)).join(', ') : 'None'
    }
    case 'hours':
      return formatHoursSummary(v)
    default:
      return normalize(v) || '—'
  }
}

function tagsSummary(before: unknown, after: unknown): string {
  const b = asList(before)
  const a = asList(after)
  const added = a.filter((t) => !b.includes(t))
  const removed = b.filter((t) => !a.includes(t))
  return [added.length ? `+ ${added.join(', ')}` : '', removed.length ? `− ${removed.join(', ')}` : '']
    .filter(Boolean)
    .join(' · ')
}

function hoursSummary(before: unknown, after: unknown): string {
  const days = changedHoursDays(before, after)
  if (days.length === 0) return formatHoursSummary(after)
  const a = after as Record<string, DayHours | undefined>
  return days
    .map((k) => {
      const d = a[k] ?? null
      return `${dayLabel(k)} → ${d ? `${fmt12(d.open)} – ${fmt12(d.close)}` : 'Closed'}`
    })
    .join(' · ')
}

/**
 * Every field an edit actually changes, versus `existing`, in the listing's
 * own order: name, address, phone, then the category's detail fields. A
 * tags field's "sometimes" list is part of that field's change, not one of
 * its own. Submitter contact info is never part of `proposed`, so filling in
 * an email alone changes nothing.
 *
 * `existing` missing (a brand-new listing, or a stale/failed fetch on
 * update) has nothing to compare against; it's reported as no changes here,
 * and hasListingChanged below treats it as a change.
 */
export function listingChanges(existing: DirectoryResource | null | undefined, proposed: Proposed, fields: CategoryField[]): ListingChange[] {
  if (!existing) return []
  const changes: ListingChange[] = []
  const core: Array<['name' | 'address' | 'phone', string]> = [
    ['name', 'Name'],
    ['address', 'Address'],
    ['phone', 'Phone'],
  ]
  for (const [key, label] of core) {
    const before = existing[key]
    const after = proposed[key]
    if (!sameFieldValue(key, before, after)) {
      changes.push({ key, label, before, after, summary: `${normalize(before) || '—'} → ${normalize(after) || '—'}` })
    }
  }
  for (const field of fields) {
    const before = existing[field.key]
    const after = proposed.details?.[field.key]
    if (field.type === 'tags') {
      const sk = `${field.key}_sometimes`
      const beforeS = existing[sk]
      const afterS = proposed.details?.[sk]
      const mainSame = sameFieldValue('tags', before, after)
      const sometimesSame = sameFieldValue('tags', beforeS, afterS)
      if (mainSame && sometimesSame) continue
      const parts = [mainSame ? '' : tagsSummary(before, after), sometimesSame ? '' : tagsSummary(beforeS, afterS).replace(/(\+|−) /g, '$1 ~')]
      changes.push({ key: field.key, label: field.label, before, after, summary: parts.filter(Boolean).join(' · ') })
      continue
    }
    if (sameFieldValue(field.type, before, after)) continue
    const summary =
      field.type === 'hours'
        ? hoursSummary(before, after)
        : field.type === 'image'
          ? after
            ? before
              ? 'New photo'
              : 'Photo added'
            : 'Photo removed'
          : `${describe(field, before)} → ${describe(field, after)}`
    changes.push({ key: field.key, label: field.label, before, after, summary })
  }
  return changes
}

/**
 * Whether an edit submission actually proposes any real change to the
 * listing, versus `existing` — see listingChanges for what counts. A field
 * edited and then edited right back to its original value compares equal,
 * since this checks final values against what's stored, not whether a field
 * was touched along the way.
 *
 * `existing` missing always counts as a change — there's nothing to compare
 * against, and refusing to submit in that case would be a confusing false
 * block, not a safeguard.
 */
export function hasListingChanged(
  existing: DirectoryResource | null | undefined,
  proposed: Proposed,
  fields: CategoryField[],
): boolean {
  if (!existing) return true
  return listingChanges(existing, proposed, fields).length > 0
}
