import { toggleVote, getVotedResourceIds } from '@/lib/voteStore'
import { enforceRateLimit } from '@/lib/rateLimit'
import { revalidatePublicContent } from '@/lib/revalidateContent'

// GET /api/votes?token=…
// Every resource this browser token has voted on — lets a page correct its
// own "voted" display state against the real record instead of trusting a
// local cache that can outlive, or be outlived by, the token itself. Called
// once per page load, not per button, so the limit here is about how many
// PAGE LOADS a visitor can make per minute, not how many things they upvote.
export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, 'votes-check', { limit: 60, windowSec: 60 })
  if (limited) return limited

  const token = new URL(request.url).searchParams.get('token')
  if (!token) {
    return Response.json({ ok: false, error: 'Missing token.' }, { status: 400 })
  }

  try {
    const resourceIds = await getVotedResourceIds(token)
    return Response.json({ ok: true, resourceIds })
  } catch (err) {
    console.error('[votes] lookup failed:', err)
    return Response.json({ ok: false, error: 'Could not load your votes.' }, { status: 502 })
  }
}

// POST /api/votes  body: { resourceId, token }
// Toggles the browser token's upvote on a listing. Instant (not moderated).
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'votes', { limit: 30, windowSec: 60 })
  if (limited) return limited

  let body: { resourceId?: string; token?: string }
  try {
    body = (await request.json()) as { resourceId?: string; token?: string }
  } catch {
    return Response.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })
  }

  const { resourceId, token } = body
  if (!resourceId || !token) {
    return Response.json({ ok: false, error: 'Missing resourceId or token.' }, { status: 400 })
  }

  try {
    const result = await toggleVote(resourceId, token)
    // Counts are read through the same cached listApprovedResources() every
    // category page uses — without this, a fresh vote wouldn't show up for
    // other visitors until the cache's own lifetime elapsed (see AGENTS.md's
    // caching section). Same blunt-invalidate-everything call every other
    // write path in this app already makes; a vote is no different.
    await revalidatePublicContent()
    return Response.json({ ok: true, ...result })
  } catch (err) {
    console.error('[votes] toggle failed:', err)
    return Response.json({ ok: false, error: 'Could not record your vote.' }, { status: 502 })
  }
}
