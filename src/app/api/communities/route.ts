import { listCommunities } from '@/lib/communityStore'

// GET /api/communities — every community this site hosts, in display order.
// Public: the header's switcher needs it on first paint to decide whether to
// render at all (it stays hidden while there's only one).
//
// No `dynamic = 'force-dynamic'`: Cache Components rejects the route segment
// configs, and it wasn't doing anything anyway — a handler that queries the
// database is dynamic on its own.

export async function GET() {
  try {
    const communities = await listCommunities()
    return Response.json({ ok: true, communities })
  } catch (err) {
    console.error('[communities] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load communities.'] }, { status: 502 })
  }
}
