import { companionKeys, type CategoryField } from './categories'
import { isMinyanim, type Minyan } from './davening'
import { boxChangeCount, mergeMinyanimBox, minyanimForBox } from './minyanimBox'
import { schedulesKey } from './schedules'
import { diffListing } from './submissionDiff'
import type { ResourceRow, ResourceSubmission } from '@/types'

// A change opened from To do is decided a part at a time (the user, Nov 2,
// "one tap per place" boards): a shul's weekday times and its Shabbos times,
// or a phone and the hours, each answered on its own. A part is a field, or
// for a shul's usual times, a box of them. Approving one puts that part on
// the listing and leaves the rest waiting; leaving one takes it out of the
// change. The last part left is the change decided whole, as before.

export type ReviewPart = { id: string; label: string; key: string; box?: 'weekday' | 'shabbos' }

const BOXES = [
  { box: 'weekday', title: 'Usual weekday times' },
  { box: 'shabbos', title: 'Usual Shabbos times' },
] as const

const CORE = new Set(['name', 'address', 'phone'])

const minyanim = (v: unknown): Minyan[] => (isMinyanim(v) ? (v as Minyan[]) : [])

/** What `sent` changes on `current`, part by part, in the order the change
 *  shows them. */
export function reviewParts(current: Pick<ResourceRow, 'name' | 'address' | 'phone' | 'details'>, sent: ResourceSubmission, fields: readonly CategoryField[]): ReviewPart[] {
  const before = (current.details ?? {}) as Record<string, unknown>
  return diffListing(current as ResourceRow, sent, [...fields])
    .filter((r) => r.changed)
    .flatMap((r): ReviewPart[] => {
      const field = fields.find((f) => f.key === r.key)
      if (field?.type === 'minyanim') {
        const was = minyanim(before[r.key])
        const now = minyanim(sent.details[r.key])
        const boxes = BOXES.filter((b) => boxChangeCount(minyanimForBox(was, b.box), minyanimForBox(now, b.box)) > 0)
        if (boxes.length > 0) return boxes.map((b) => ({ id: `${r.key}:${b.box}`, label: b.title, key: r.key, box: b.box }))
      }
      if (fields.some((f) => f.type === 'minyanim' && schedulesKey(f.key) === r.key)) return [{ id: r.key, label: 'The schedule', key: r.key }]
      return [{ id: r.key, label: r.label, key: r.key }]
    })
}

/** The keys a part writes: a tags field's "sometimes" goes with it. */
export function partKeys(part: ReviewPart, fields: readonly CategoryField[]): string[] {
  const field = fields.find((f) => f.key === part.key)
  return field?.type === 'tags' ? [part.key, ...companionKeys(field)] : [part.key]
}

/** The change as approving only `part` puts it: that part as sent, the rest
 *  as the listing has it now (`editedFields` says which). */
export function approvingPart(sent: ResourceSubmission, current: Pick<ResourceRow, 'details'>, part: ReviewPart, fields: readonly CategoryField[]): ResourceSubmission {
  // Not what the admin changed in an earlier Edit: only this part goes on.
  const out = { ...sent, details: { ...sent.details }, editedFields: partKeys(part, fields) } as ResourceSubmission & { reviewEdit?: unknown }
  delete out.reviewEdit
  if (part.box) {
    out.details[part.key] = mergeMinyanimBox(minyanim(current.details?.[part.key]), part.box, minyanimForBox(minyanim(sent.details[part.key]), part.box))
  }
  return out
}

/** The change with `part` taken out of it: what it proposes there is the
 *  listing's own. `payload` is the change as stored. */
export function leavingPart(payload: ResourceSubmission, current: Pick<ResourceRow, 'name' | 'address' | 'phone' | 'details'>, part: ReviewPart, fields: readonly CategoryField[]): ResourceSubmission {
  const out: ResourceSubmission = { ...payload, details: { ...payload.details } }
  const listed = (current.details ?? {}) as Record<string, unknown>
  if (part.box) {
    out.details[part.key] = mergeMinyanimBox(minyanim(payload.details[part.key]), part.box, minyanimForBox(minyanim(listed[part.key]), part.box))
    return out
  }
  const keys = partKeys(part, fields)
  if (Array.isArray(out.editedFields)) {
    out.editedFields = out.editedFields.filter((k) => !keys.includes(k))
    return out
  }
  // Filed before edits recorded their fields: the listing's value in its place.
  for (const k of keys) {
    if (CORE.has(k)) out[k as 'name' | 'address' | 'phone'] = current[k as 'name' | 'address' | 'phone'] ?? ''
    else if (k in listed) out.details[k] = listed[k]
    else delete out.details[k]
  }
  return out
}
