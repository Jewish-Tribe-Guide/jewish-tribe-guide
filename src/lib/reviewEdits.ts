import type { ResourceSubmission } from '@/types'
import { companionKeys, type CategoryField } from './categories'

// An admin fixing a suggestion before approving it (agreed Oct 5, canvas
// QOpen): a typo gets fixed instead of the suggestion being rejected and
// redone. Only what a listing's form can edit comes from the admin's copy:
// the name, address, phone and the category's own fields. Everything else
// (the category, Google's place, the source) stays as it was sent, so an
// edit can't move a listing to another category or graft on a place id.
//
// What the admin changed is recorded with it, with the values as sent, so
// the history says whose words went live.

export type ReviewEdit = {
  by: string
  at: string
  /** The keys changed: 'name', 'address', 'phone', or a detail field's key. */
  fields: string[]
  /** What the suggestion said for each of those, before the admin's fix. */
  asSent: Record<string, unknown>
}

const CORE = ['name', 'address', 'phone'] as const

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

function isGeo(v: unknown): v is { lat: number; lng: number } {
  if (!v || typeof v !== 'object') return false
  const g = v as Record<string, unknown>
  return typeof g.lat === 'number' && typeof g.lng === 'number' && Number.isFinite(g.lat) && Number.isFinite(g.lng)
}

/** The suggestion as it will be approved: as sent, with the admin's fixes
 *  to its editable fields. `null` when the admin's copy isn't a listing. */
export function withReviewEdits(
  sent: ResourceSubmission,
  edited: unknown,
  fields: CategoryField[],
  by: string,
  at: string,
): ResourceSubmission | null {
  if (!edited || typeof edited !== 'object' || Array.isArray(edited)) return null
  const e = edited as Record<string, unknown>
  const eDetails = e.details && typeof e.details === 'object' && !Array.isArray(e.details) ? (e.details as Record<string, unknown>) : null
  if (!eDetails) return null

  const out: ResourceSubmission = { ...sent, details: { ...sent.details } }
  const changed: string[] = []
  const asSent: Record<string, unknown> = {}

  for (const k of CORE) {
    if (!(k in e)) continue
    if (typeof e[k] !== 'string') return null
    const v = e[k] as string
    if (same(v, sent[k])) continue
    out[k] = v
    changed.push(k)
    asSent[k] = sent[k]
  }

  const editable = fields.flatMap((f) => [f.key, ...companionKeys(f)])
  for (const k of editable) {
    if (!(k in eDetails)) continue
    if (same(eDetails[k], sent.details[k])) continue
    out.details[k] = eDetails[k]
    changed.push(k)
    asSent[k] = sent.details[k] ?? null
  }

  if (changed.length === 0) return sent
  // A moved address needs new coordinates: the admin's, picked from the
  // address lookup, or none, so approval looks them up again. The copy
  // still carrying the old ones means nothing was picked.
  if (changed.includes('address')) out.geo = isGeo(e.geo) && !same(e.geo, sent.geo) ? { lat: e.geo.lat, lng: e.geo.lng } : null
  return Object.assign(out, { reviewEdit: { by, at, fields: changed, asSent } satisfies ReviewEdit })
}
