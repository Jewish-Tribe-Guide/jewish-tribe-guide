import { reportServerError } from '@/lib/serverError'
import { enforceRateLimit } from '@/lib/rateLimit'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { attachSubmitterEmail } from '@/lib/submissionStore'
import { attachMessageEmail } from '@/lib/sentMessageStore'
import { normalizeEmail } from '@/lib/activity'
import { UUID } from '@/lib/itemMarkRoutes'

// POST /api/message/email   { ids?, messageIds?, email }
// The "+ Add" box asks for an email once, on its thank-you screen, after
// everything is sent (agreed Oct 5), so it's added to what the box filed:
// the ids /api/message/send handed back. attachSubmitterEmail touches only
// suggestions read by AI, still waiting, with no email yet, from the last
// hour.
// `messageIds`: posts sent to be read after Send (/api/message/queue, Nov
// 27). The email is kept with each for its read to file with, and added to
// whatever a read already filed.

const MAX_IDS = 20

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'submissions', { limit: 10, windowSec: 60 })
  if (limited) return limited
  const body = (await request.json().catch(() => null)) as { ids?: unknown; messageIds?: unknown; email?: unknown } | null
  const email = normalizeEmail(body?.email)
  const uuids = (v: unknown) => (Array.isArray(v) ? v : []).filter((id): id is string => typeof id === 'string' && UUID.test(id)).slice(0, MAX_IDS)
  const ids = uuids(body?.ids)
  const messageIds = uuids(body?.messageIds)
  if (!email || ids.length + messageIds.length === 0) return Response.json({ ok: false, error: 'An email and what it’s for, please.' }, { status: 400 })
  const community = await resolveCommunity(communitySlugFromRequest(request))
  try {
    const messages = await attachMessageEmail(community.slug, messageIds, email)
    const filed = [...ids, ...messages.flatMap((m) => m.submissionIds)]
    const updated = filed.length ? await attachSubmitterEmail(community.slug, filed, email) : 0
    return Response.json({ ok: true, updated: updated + messages.length })
  } catch (err) {
    reportServerError('[message/email] failed:', err instanceof Error ? err.message : err)
    return Response.json({ ok: false, error: 'That didn’t save. Please try again.' }, { status: 502 })
  }
}
