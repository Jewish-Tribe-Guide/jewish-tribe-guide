import { companionKeys, type CategoryField } from './categories'
import { listingChanges } from './listingDiff'
import { MENU_LINK_KEY } from './menuLink'
import type { DirectoryResource, ResourceRow, ResourceSubmission } from '@/types'

// An edit carries the whole listing as its sender saw it, so approving it
// used to write all of it: two people's edits to one place, approved one
// after the other, and the second put back what the first had changed (the
// user, Nov 2). Now an edit records, when it's filed, the fields it changes
// against the listing as it is then (`editedFields`), and approving it puts
// only those on the listing as it is now. The queue reads it the same way,
// so it shows what approving would change, not the listing's own changes
// since. A shul's times and a mikvah's hours, read a part or a section at a
// time, had this already (timesParts.ts, hoursSections.ts).
//
// An edit filed before this has no `editedFields` and is approved whole,
// as it always was.

const CORE = ['name', 'address', 'phone'] as const

/** The fields `proposed` changes on `existing`: name, address, phone, and
 *  the category's fields with what's stored beside them (a tags field's
 *  "sometimes", a shul's special schedules), and the menu link. */
export function editedFields(existing: DirectoryResource, proposed: Pick<ResourceSubmission, 'name' | 'address' | 'phone' | 'details'>, fields: readonly CategoryField[]): string[] {
  const keys = new Set<string>()
  for (const change of listingChanges(existing, proposed, [...fields])) {
    keys.add(change.key)
    // A tags field's change covers its "sometimes" list too (listingChanges).
    const field = fields.find((f) => f.key === change.key)
    if (field?.type === 'tags') for (const k of companionKeys(field)) keys.add(k)
  }
  return [...keys]
}

const isGeo = (v: unknown): v is { lat: number; lng: number } =>
  !!v && typeof v === 'object' && typeof (v as { lat?: unknown }).lat === 'number' && typeof (v as { lng?: unknown }).lng === 'number'

/** An edit as it goes on the listing now: the fields it changed (and any an
 *  admin changed in Edit) as sent, every other field as the listing has it.
 *  Anything that isn't a field (the source, Google's status) stays as sent. */
export function onListingNow(sent: ResourceSubmission, now: ResourceRow, fields: readonly CategoryField[]): ResourceSubmission {
  if (!Array.isArray(sent.editedFields)) return sent
  const byAdmin = (sent as { reviewEdit?: { fields?: string[] } }).reviewEdit?.fields ?? []
  const keep = new Set([...sent.editedFields, ...byAdmin])
  const out: ResourceSubmission = { ...sent, details: { ...sent.details } }
  for (const k of CORE) if (!keep.has(k)) out[k] = now[k] ?? ''
  const listed = now.details ?? {}
  for (const k of [...fields.flatMap((f) => [f.key, ...companionKeys(f)]), MENU_LINK_KEY]) {
    if (keep.has(k)) continue
    if (k in listed) out.details[k] = listed[k]
    else delete out.details[k]
  }
  // The coordinates go with the address.
  if (!keep.has('address')) {
    if (isGeo(listed.geo)) out.geo = { lat: listed.geo.lat, lng: listed.geo.lng }
    else delete out.geo
  }
  return out
}
