import { listTags } from '@/lib/tagStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// GET /api/tags?group=kosher_product — the tag vocabulary for a group. Public.
export async function GET(request: Request) {
  const group = new URL(request.url).searchParams.get('group')
  if (!group) {
    return Response.json({ ok: false, errors: ['Missing group.'] }, { status: 400 })
  }
  try {
    const community = await resolveCommunity(communitySlugFromRequest(request))
    const tags = await listTags(community.slug, group)
    return Response.json({ ok: true, tags })
  } catch (err) {
    console.error('[tags] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load tags.'] }, { status: 502 })
  }
}
