import { toggleVote, getVotedResourceIds } from '@/lib/voteStore'
import { enforceRateLimit } from '@/lib/rateLimit'

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
    // Deliberately does NOT call revalidatePublicContent() — a vote IS
    // different from every other write path here, in the one way that
    // matters: frequency. Every admin write revalidates every content tag
    // for every community (see that function's own comment on why that's an
    // acceptable blunt instrument), which is fine because admin writes are
    // rare. Votes aren't — a handful of visitors idly upvoting could
    // trigger that same site-wide, every-community invalidation dozens of
    // times a minute, defeating the point of caching listing pages at all.
    // A vote count a little behind reality is harmless (nobody chooses a
    // hospital by upvote count); a listing showing the wrong open/closed
    // status is not — that distinction is why this path is the one
    // exception. cacheLife('hours') on listApprovedResources() still
    // catches counts up on its own, no invalidation call needed. The
    // voter's OWN count looking momentarily behind is handled separately,
    // client-side — see UpvoteButton.tsx's remembered-count comment.
    return Response.json({ ok: true, ...result })
  } catch (err) {
    console.error('[votes] toggle failed:', err)
    return Response.json({ ok: false, error: 'Could not record your vote.' }, { status: 502 })
  }
}
