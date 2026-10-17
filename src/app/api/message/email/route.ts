import { enforceRateLimit } from '@/lib/rateLimit'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { attachSubmitterEmail } from '@/lib/submissionStore'
import { normalizeEmail } from '@/lib/activity'
import { UUID } from '@/lib/itemMarkRoutes'

// POST /api/message/email   { ids, email }
// The "+ Add" box asks for an email once, on its thank-you screen, after
// everything is sent (agreed Oct 5), so it's added to what the box filed:
// the ids /api/message/send handed back. attachSubmitterEmail touches only
// suggestions read by AI, still waiting, with no email yet, from the last
// hour.

const MAX_IDS = 20

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'submissions', { limit: 10, windowSec: 60 })
  if (limited) return limited
  const body = (await request.json().catch(() => null)) as { ids?: unknown; email?: unknown } | null
  const email = normalizeEmail(body?.email)
  const ids = (Array.isArray(body?.ids) ? body.ids : []).filter((id): id is string => typeof id === 'string' && UUID.test(id)).slice(0, MAX_IDS)
  if (!email || ids.length === 0) return Response.json({ ok: false, error: 'An email and what it’s for, please.' }, { status: 400 })
  const community = await resolveCommunity(communitySlugFromRequest(request))
  try {
    return Response.json({ ok: true, updated: await attachSubmitterEmail(community.slug, ids, email) })
  } catch (err) {
    console.error('[message/email] failed:', err instanceof Error ? err.message : err)
    return Response.json({ ok: false, error: 'That didn’t save. Please try again.' }, { status: 502 })
  }
}
