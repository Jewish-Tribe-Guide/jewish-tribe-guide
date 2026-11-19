import { getAdminClient } from '@/lib/supabase/admin'
import { clientIp, enforceRateLimit } from '@/lib/rateLimit'
import { isHoneypotTripped } from '@/lib/honeypot'
import { verifyTurnstile } from '@/lib/turnstile'
import { contributionsFor } from '@/lib/uiConfig'
import { resolveCapabilities, type CategoryConfig } from '@/lib/categories'
import { getResourceById } from '@/lib/resourceStore'
import { getCategoryById } from '@/lib/categoryStore'
import { resolveCommunity, type Community } from '@/lib/communityStore'
import { UUID } from '@/lib/itemMarkRoutes'
import type { DirectoryResource } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// What the four routes a visitor changes a shul or a listing's items through
// share: /api/resource/:id/times, /schedule, /item/add and /item/gone. They
// were four copies of the same 25 lines, and the copies had drifted: the
// schedule route took a photo only from the schedule reader's folder, the
// times route from the "+ Add" box's too (Nov 18, review item 44).
//
// Each files an edit suggestion, so each is held to what /api/submissions
// holds edits to: the rate limit, the bot trap and check, and the listing's
// community and page both taking edits. The community is the listing's own,
// from its row, so its own switch and its own clock apply (item 33).
// ─────────────────────────────────────────────────────────────────────────────

export type ListingWriteBody = Record<string, unknown>

const refuse = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  Response.json({ ok: false, error, ...extra }, { status })

/** The start: the rate limit, a real id, the body. A tripped bot trap is
 *  answered with `trapped` (accepted and ignored, so a bot can't tell). A
 *  body that isn't JSON comes back as null, for the route's own "couldn't
 *  read that". */
export async function openListingWrite(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
  trapped: Record<string, unknown> = { ok: true },
): Promise<{ id: string; body: ListingWriteBody | null } | Response> {
  const limited = await enforceRateLimit(request, 'submissions', { limit: 10, windowSec: 60 })
  if (limited) return limited
  const { id } = await ctx.params
  if (!UUID.test(id)) return refuse(404, 'Not found.')
  const body = (await request.json().catch(() => null)) as ListingWriteBody | null
  if (body && isHoneypotTripped(body)) return Response.json(trapped)
  return { id, body }
}

/** The bot check, once the route has read what was sent. */
export async function failsBotCheck(request: Request, body: ListingWriteBody): Promise<Response | null> {
  const token = typeof body.turnstileToken === 'string' ? body.turnstileToken : undefined
  if (await verifyTurnstile(token, clientIp(request))) return null
  return refuse(403, 'Verification failed. Please try again.', { code: 'turnstile' })
}

/** The community of a live listing, if it takes edits. */
export async function editableCommunity(id: string): Promise<Community | Response> {
  const { data: row } = await getAdminClient()
    .from('resource')
    .select('community_id')
    .eq('id', id)
    .eq('status', 'approved')
    .maybeSingle<{ community_id: string }>()
  if (!row) return refuse(404, 'Not found.')
  const community = await resolveCommunity(row.community_id)
  if (!contributionsFor(community.ui).edit) return refuse(403, 'This action is not available.')
  return community
}

/** A live listing whose community and page take edits, its page, and the
 *  field the route changes (`pick`; none means Not found). */
export async function editableListing<F>(
  id: string,
  pick: (category: CategoryConfig) => F | null | undefined,
): Promise<{ community: Community; listing: DirectoryResource; category: CategoryConfig; field: F } | Response> {
  const community = await editableCommunity(id)
  if (community instanceof Response) return community
  const listing = await getResourceById(id, community.slug)
  const category = listing ? await getCategoryById(community.slug, listing.category) : null
  const field = category ? pick(category) : null
  if (!listing || !category || !field) return refuse(404, 'Not found.')
  if (!resolveCapabilities(category.capabilities).edit) return refuse(403, 'This action is not available for this category.')
  return { community, listing, category, field }
}

/** A photo or PDF the times were read from: only one a reader kept, in the
 *  guide's own storage (/api/schedule/read, or the "+ Add" box's
 *  /api/message/read), never any other address. */
export function keptSourceUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const assets = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/site-assets/`
  const folder = ['schedule-source/', 'message-source/'].map((d) => assets + d).find((p) => raw.startsWith(p))
  return folder && /^[\w.-]+$/.test(raw.slice(folder.length)) ? raw : null
}

/** What it was read from, when pasted: kept in the queue's note so the admin
 *  checks the times against it. */
export function pastedSource(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, 4000) : ''
}
