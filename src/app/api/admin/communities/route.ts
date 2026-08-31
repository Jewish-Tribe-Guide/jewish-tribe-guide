import { revalidatePublicContent } from '@/lib/revalidateContent'
import { getAdminUser } from '@/lib/adminAuth'
import { createCommunity } from '@/lib/communityStore'
import { cloneCommunityContent } from '@/lib/communityCloning'

type CreateBody = {
  slug?: string
  name?: string
  tagline?: string
  mission?: string
  region?: string
  timezone?: string
  mapCenter?: { lat: number; lng: number }
  themeColor?: string
  backgroundColor?: string
  adminEmail?: string
  /** An existing community's slug to clone categories/home sections from, or
   *  omitted/null to start empty. */
  cloneFrom?: string | null
}

// POST /api/admin/communities — the "New Community" flow: creates the
// community row, then optionally clones another community's categories and
// home sections into it. No GET here — the public GET /api/communities
// already lists everything the admin UI needs. Admin only.
export async function POST(request: Request) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  let body: CreateBody
  try {
    body = (await request.json()) as CreateBody
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }

  const required: (keyof CreateBody)[] = [
    'slug',
    'name',
    'tagline',
    'mission',
    'region',
    'timezone',
    'mapCenter',
    'themeColor',
    'backgroundColor',
  ]
  const missing = required.filter((key) => !body[key])
  if (missing.length) {
    return Response.json({ ok: false, errors: [`Missing required field(s): ${missing.join(', ')}.`] }, { status: 400 })
  }

  try {
    const community = await createCommunity({
      slug: body.slug!,
      name: body.name!,
      tagline: body.tagline!,
      mission: body.mission!,
      region: body.region!,
      timezone: body.timezone!,
      mapCenter: body.mapCenter!,
      themeColor: body.themeColor!,
      backgroundColor: body.backgroundColor!,
      adminEmail: body.adminEmail,
    })

    if (body.cloneFrom) {
      await cloneCommunityContent(community.slug, body.cloneFrom)
    }

    // The new community's directory (and, for everyone else, the updated
    // communities list) is public content — drop the cache so it shows up
    // immediately instead of waiting out cacheLife('days').
    await revalidatePublicContent()

    return Response.json({ ok: true, community })
  } catch (err) {
    console.error('[admin/communities] POST failed:', err)
    const message = err instanceof Error ? err.message : 'Could not create community.'
    return Response.json({ ok: false, errors: [message] }, { status: 502 })
  }
}
