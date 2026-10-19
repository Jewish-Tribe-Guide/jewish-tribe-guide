import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { contentVersion } from '@/lib/contentVersion'

// GET /api/content-version — the fingerprint of a community's content
// (contentVersion). An open tab asks on coming back and re-renders only when
// it differs from the one it loaded with (RefreshContentOnReturn). Never
// cached on the way: the point is the server's current answer.
export async function GET(request: Request) {
  try {
    const community = await resolveCommunity(communitySlugFromRequest(request))
    return Response.json({ ok: true, version: await contentVersion(community.slug) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[content-version] GET failed:', err)
    return Response.json({ ok: false }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
