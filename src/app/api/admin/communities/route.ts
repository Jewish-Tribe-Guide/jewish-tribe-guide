import { revalidatePublicContent } from '@/lib/revalidateContent'
import { getAdminUser } from '@/lib/adminAuth'
import {
  createCommunity,
  listCommunities,
  listCommunityAdminEmails,
  listCommunityNotifyEmails,
  listCommunityPreviewTokens,
} from '@/lib/communityStore'
import { cloneCommunityContent } from '@/lib/communityCloning'

// GET /api/admin/communities — the same data as the public GET
// /api/communities, but superadmin-gated (getAdminUser — the global
// ADMIN_EMAILS list, not any one community's admin_email; see adminAuth.ts's
// own note on what that list means now). CommunityManager.tsx calls THIS
// instead of the public route specifically so a regular per-community admin
// gets a 401 here and the "manage every community" UI (the list of every
// community plus "+ New community") never renders for them at all — that's
// the actual point: creating and browsing every community is a superadmin
// action, not something scoped to whichever one community an admin
// administers.
export async function GET(request: Request) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const [communities, adminEmails, notifyEmails, previewTokens] = await Promise.all([
      listCommunities(),
      listCommunityAdminEmails(),
      listCommunityNotifyEmails(),
      listCommunityPreviewTokens(),
    ])
    // adminEmails/notifyEmails/previewToken ride along here (superadmin-only
    // route) but never on Community/listCommunities() itself — that object
    // is also served by the public GET /api/communities, which has no
    // business exposing any of them.
    const withExtras = communities.map((c) => ({
      ...c,
      adminEmails: adminEmails[c.slug] ?? [],
      notifyEmails: notifyEmails[c.slug] ?? [],
      previewToken: previewTokens[c.slug] ?? null,
    }))
    return Response.json({ ok: true, communities: withExtras })
  } catch (err) {
    console.error('[admin/communities] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load communities.'] }, { status: 502 })
  }
}

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
  adminEmails?: string[]
  /** An existing community's slug to clone categories/home sections from, or
   *  omitted/null to start empty. */
  cloneFrom?: string | null
}

// POST /api/admin/communities — the "New Community" flow: creates the
// community row, then optionally clones another community's categories and
// home sections into it. Superadmin only (see GET above).
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
      adminEmails: Array.isArray(body.adminEmails) ? body.adminEmails : [],
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
