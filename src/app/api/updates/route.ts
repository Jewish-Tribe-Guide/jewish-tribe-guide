import { reportServerError } from '@/lib/serverError'
import { enforceRateLimit } from '@/lib/rateLimit'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { UUID } from '@/lib/itemMarkRoutes'
import { getSentMessages } from '@/lib/sentMessageStore'
import { listApprovedResources } from '@/lib/resourceStore'
import { listingSlug } from '@/lib/listingSlug'
import { routes } from '@/lib/routes'
import { getSubmissionStates, messageStatus, submissionStatus, type SubmissionState } from '@/lib/yourUpdatesStatus'
import { KEEP_MAX, type UpdateStatus } from '@/lib/yourUpdates'

// POST /api/updates   { submissions: string[], messages: string[] }
// "Your updates" on You (Nov 27, board S4c): where each update this phone
// sent stands, by the ids it kept (yourUpdates.ts). Live (with where),
// waiting, or not changed; a rejection is never said louder than that.
// No account: whoever holds an id can ask after it, and learns only that.
// Never cached: it's this phone's own list.

const ids = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string' && UUID.test(v)).slice(0, KEEP_MAX) : [])

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'your-updates', { limit: 30, windowSec: 60 })
  if (limited) return limited
  const body = (await request.json().catch(() => null)) as { submissions?: unknown; messages?: unknown } | null
  if (!body) return Response.json({ ok: false, error: 'Invalid request.' }, { status: 400 })
  try {
    const community = await resolveCommunity(communitySlugFromRequest(request))
    const messages = await getSentMessages(community.slug, ids(body.messages))
    const subIds = [...new Set([...ids(body.submissions), ...messages.flatMap((m) => m.submissionIds)])]
    const states = await getSubmissionStates(community.slug, subIds)
    const live = states.some((s) => s.status === 'approved') ? await listApprovedResources(community.slug) : []
    const byId = new Map(live.map((l) => [l.id, l]))
    const hrefOf = (s: SubmissionState): string | null => {
      if (!s.target_id) return null
      if (s.target_type === 'eruv') return routes.eruv(community.slug, s.target_id)
      const l = s.target_type === 'listing' ? byId.get(s.target_id) : undefined
      return l ? routes.listing(community.slug, l.category, listingSlug(l)) : null
    }
    const filed = new Map<string, UpdateStatus>(states.map((s) => [s.id, submissionStatus(s, hrefOf)]))
    const statuses: Record<string, UpdateStatus> = {}
    for (const id of ids(body.submissions)) {
      const s = filed.get(id)
      if (s) statuses[id] = s
    }
    for (const m of messages) statuses[m.id] = messageStatus(m, filed)
    return Response.json({ ok: true, statuses }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    reportServerError('[updates] POST failed:', err)
    return Response.json({ ok: false, error: 'Could not load your updates.' }, { status: 502 })
  }
}
