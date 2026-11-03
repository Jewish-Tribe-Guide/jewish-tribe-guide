import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { enforceRateLimit } from '@/lib/rateLimit'
import { revalidatePublicContent } from '@/lib/revalidateContent'
import { listJobRuns } from '@/lib/jobRunStore'
import { listEruvimForAdmin, saveStatusRead, updateEruv } from '@/lib/eruvStore'
import { readEruvPage } from '@/lib/eruvReader'
import { GoogleJobError, notThisPlace, pickGooglePlace } from '@/lib/googleJobRun'
import { loadLookAgain, tryLook } from '@/lib/lookAgainRun'
import { answerFound, saveStopped } from '@/lib/lookAgainStore'
import { isFoundPage, type LookKind } from '@/lib/lookAgain'

// GET /api/admin/watches/look-again — Look again's page (lookAgain.ts): all
//     it tries or has stopped trying, with its last runs. `available` is
//     false before migration 092. Admin only.
//
// POST /api/admin/watches/look-again  body: { action, kind, id }
//     'try'     Read it now: tried at once, as a night would.
//     'stop'    Stop trying; 'resume' starts it again.
//     'use'     Use this page / Use this place: what it found becomes the
//               eruv's status page (read at once) or the listing's Google
//               match (compared at once, as Find it on Google's pick is).
//     'not'     Not this page / Not this place: never offered again.

export const maxDuration = 300

const KINDS: readonly LookKind[] = ['eruv', 'menu', 'google']
const ACTIONS = ['try', 'stop', 'resume', 'use', 'not'] as const
type Action = (typeof ACTIONS)[number]

/** Tries an admin can start in ten minutes: each may be a Google search or
 *  an AI read. */
const TRY_LIMIT = { limit: 20, windowSec: 600 }

export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  if (!(await getAdminUserForCommunity(request, community.slug))) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })
  try {
    const [loaded, { runs }] = await Promise.all([loadLookAgain(community.slug), listJobRuns()])
    return Response.json({ ok: true, ...loaded, runs: runs['look-again'] ?? [] })
  } catch (err) {
    console.error('[admin/watches/look-again] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load Look again.'] }, { status: 502 })
  }
}

export async function POST(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  if (!(await getAdminUserForCommunity(request, community.slug))) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { action?: unknown; kind?: unknown; id?: unknown } | null
  const action = body?.action as Action
  const kind = body?.kind as LookKind
  const id = typeof body?.id === 'string' ? body.id : ''
  const bad = (msg: string, status = 400) => Response.json({ ok: false, errors: [msg] }, { status })
  if (!ACTIONS.includes(action) || !KINDS.includes(kind) || !id || id.length > 100) return bad('Invalid request.')
  if (action === 'try') {
    const limited = await enforceRateLimit(request, 'admin-look-again', TRY_LIMIT)
    if (limited) return limited
  }
  const slug = community.slug
  try {
    const { available, items } = await loadLookAgain(slug)
    if (!available) return bad('Look again isn’t set up on this site yet.', 503)
    const item = items.find((i) => i.kind === kind && i.id === id)
    if (!item) return bad('Look again isn’t trying that one.', 404)
    if (action === 'try') return Response.json({ ok: true, ...(await tryLook(slug, item, process.env.OPENAI_API_KEY)) })
    if (action === 'stop' || action === 'resume') {
      await saveStopped(slug, kind, id, action === 'stop' ? new Date().toISOString() : null)
      return Response.json({ ok: true })
    }
    const found = item.found
    if (!found) return bad('It found nothing to answer.')
    if (action === 'not') {
      if (isFoundPage(found)) await answerFound(slug, kind, id, found.url)
      else {
        await notThisPlace(slug, id, found.placeId)
        await answerFound(slug, kind, id, null)
      }
      return Response.json({ ok: true })
    }
    if (isFoundPage(found)) {
      const eruv = (await listEruvimForAdmin(slug)).eruvim.find((e) => e.id === id)
      if (!eruv) return bad('That eruv isn’t in the guide any more.', 404)
      await updateEruv(slug, id, { statusUrl: found.url }, eruv)
      await saveStatusRead(slug, id, await readEruvPage(found.url, new Date()))
    } else await pickGooglePlace(slug, id, found.placeId)
    await answerFound(slug, kind, id, null)
    await revalidatePublicContent()
    return Response.json({ ok: true })
  } catch (err) {
    if (err instanceof GoogleJobError) return bad(err.message, err.status)
    console.error('[admin/watches/look-again] POST failed:', err)
    return bad('Could not do that.', 502)
  }
}
