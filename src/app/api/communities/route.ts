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
    // Invisible communities (still being built out — see the visibility
    // migration's own comment) aren't offered here, though their own pages
    // still work by direct URL. The admin-only GET (/api/admin/communities)
    // shows every community, visible or not, so a superadmin can find and
    // publish one.
    const communities = (await listCommunities()).filter((c) => c.visible)
    return Response.json({ ok: true, communities })
  } catch (err) {
    console.error('[communities] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load communities.'] }, { status: 502 })
  }
}
