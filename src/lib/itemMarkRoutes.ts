import { getAdminClient } from './supabase/admin'

// What the item routes share (/api/resource/:id/item and its /gone):
// reading a tap off an untrusted request body, and the shape mark_item
// (migration 064) hands back.

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A repeat "Still here" within this changes nothing (Mark as current's). */
export const ITEM_COOLDOWN_SECONDS = 600

export type MarkRow = {
  out_community: string
  /** The item as the listing stores it. */
  out_label: string
  out_at: string
  out_previous: string | null
  out_cleared_gone: string | null
  out_changed: boolean
}

export function isIso(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v))
}

/** `{ field, item }`: a detail key ("m", "m_sometimes") and an item's name.
 *  Whether the listing has them is the database's to say; this only keeps
 *  out what can't be either. */
export function parseItemTap(body: unknown): { field: string; item: string } | null {
  if (!body || typeof body !== 'object') return null
  const { field, item } = body as Record<string, unknown>
  if (typeof field !== 'string' || !/^[A-Za-z0-9_]{1,64}$/.test(field)) return null
  if (typeof item !== 'string' || !item.trim() || item.length > 120) return null
  return { field, item: item.trim() }
}

/** How long a visitor can take back their own "Not anymore" or "Add an
 *  item": the removal or addition leaves the queue. */
export const UNDO_WITHIN_MS = 60 * 60 * 1000

/** Takes this browser's own suggestion back out of the moderation queue:
 *  only that one, only while pending, only an edit to this listing, only
 *  within the hour. The id is a random UUID only the visitor was given.
 *  True when it was withdrawn, false when an admin has already decided (or
 *  it's too late); throws when the database can't be reached. */
export async function withdrawPending(submissionId: string, listingId: string): Promise<boolean> {
  const { data, error } = await getAdminClient()
    .from('submission')
    .delete()
    .eq('id', submissionId)
    .eq('target_id', listingId)
    .eq('status', 'pending')
    .eq('operation', 'update')
    .gte('created_at', new Date(Date.now() - UNDO_WITHIN_MS).toISOString())
    .select('id')
  if (error) throw new Error(error.message)
  return (data ?? []).length > 0
}
