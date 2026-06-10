import { toggleVote } from '@/lib/voteStore'

// POST /api/votes  body: { resourceId, token }
// Toggles the browser token's upvote on a listing. Instant (not moderated).
export async function POST(request: Request) {
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
    return Response.json({ ok: true, ...result })
  } catch (err) {
    console.error('[votes] toggle failed:', err)
    return Response.json({ ok: false, error: 'Could not record your vote.' }, { status: 502 })
  }
}
