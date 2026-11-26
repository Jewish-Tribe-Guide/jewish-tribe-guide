import { reportServerError } from '@/lib/serverError'
import { revalidatePublicContent } from '@/lib/revalidateContent'
import { getAllowedAdminEmails } from '@/lib/adminAuth'
import { siteAdminRead } from '@/lib/adminRoute'
import {
  createCommunity,
  readCommunities,
  listCommunityAdminEmails,
  listCommunityNotifyPreferenceLists,
  listCommunityPlaceCounts,
  listCommunityPreviewTokens,
  removeUnfinishedCommunity,
} from '@/lib/communityStore'
import tzLookup from 'tz-lookup'
import { addMissingSiteScreens } from '@/lib/communityCloning'
import { copyStarterPack } from '@/lib/starterPack'

// GET /api/admin/communities — the same data as the public GET
// /api/communities, but superadmin-gated (getAdminUser — the global
// SUPERADMIN_EMAILS list, not any one community's admin_email; see adminAuth.ts's
// own note on what that list means now). CommunityManager.tsx calls THIS
// instead of the public route specifically so a regular per-community admin
// gets a 401 here and the "manage every community" UI (the list of every
// community plus "New community") never renders for them at all — that's
// the actual point: creating and browsing every community is a superadmin
// action, not something scoped to whichever one community an admin
// administers.
export const GET = siteAdminRead(async () => {
  try {
    const [communities, adminEmails, notifyPreferenceLists, previewTokens] = await Promise.all([
      readCommunities(),
      listCommunityAdminEmails(),
      listCommunityNotifyPreferenceLists(),
      listCommunityPreviewTokens(),
    ])
    // adminEmails/notifyMutedEmails/notifyReviewEmails/previewToken ride
    // along here (superadmin-only route) but never on Community/
    // listCommunities() itself — that object is also served by the public
    // GET /api/communities, which has no business exposing any of them.
    const placeCounts = await listCommunityPlaceCounts(communities.map((c) => c.slug))
    const withExtras = communities.map((c) => ({
      ...c,
      adminEmails: adminEmails[c.slug] ?? [],
      notifyMutedEmails: notifyPreferenceLists[c.slug]?.notifyMutedEmails ?? [],
      notifyReviewEmails: notifyPreferenceLists[c.slug]?.notifyReviewEmails ?? [],
      previewToken: previewTokens[c.slug] ?? null,
      placeCount: placeCounts[c.slug] ?? 0,
    }))
    return Response.json({ ok: true, communities: withExtras })
  } catch (err) {
    reportServerError('[admin/communities] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load communities.'] }, { status: 502 })
  }
})

type CreateBody = {
  slug?: string
  name?: string
  /** The city picked (GET /api/admin/cities): its name, state and centre.
   *  The region, time zone, map and mission follow from it. */
  city?: { city?: string; area?: string; lat?: number; lng?: number }
  adminEmails?: string[]
  /** The Starter pack switch (board 2f): a few of the default community's
   *  pages, its home and tabs, no places. Off: it starts empty. */
  starterPack?: boolean
}

const THEME_COLOR = '#1d4ed8'
const BACKGROUND_COLOR = '#f8fafc'

// POST /api/admin/communities — New community (Nov 25, boards 1, 2f and 3):
// a city, a name, who runs it and the Starter pack switch. Everything else
// the old form asked for (mission, region, time zone, coordinates, colours)
// follows from the city or starts at the site's own; each is editable in
// the community's admin afterwards. Superadmin only (see GET above).
//
// siteAdminRead, not siteAdminWrite: it invalidates itself, with
// `newCommunity` (the list expired outright, and read until it has the new
// slug). The wrapper's plain pass after it would mark the list stale again.
export const POST = siteAdminRead(async (request: Request) => {
  let body: CreateBody
  try {
    body = (await request.json()) as CreateBody
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }

  const name = body.name?.trim()
  const slug = body.slug?.trim()
  const city = body.city?.city?.trim()
  const { lat, lng } = body.city ?? {}
  if (!city || typeof lat !== 'number' || typeof lng !== 'number') {
    return Response.json({ ok: false, errors: ['Pick the city from the list.'] }, { status: 400 })
  }
  if (!name) return Response.json({ ok: false, errors: ['Give it a name.'] }, { status: 400 })
  if (!slug) return Response.json({ ok: false, errors: ['Give it an address.'] }, { status: 400 })

  let timezone: string
  try {
    timezone = tzLookup(lat, lng)
  } catch {
    return Response.json({ ok: false, errors: ['That city has no usable location.'] }, { status: 400 })
  }
  const mission = `A guide to Jewish ${city} — community resources for residents and visitors.`

  try {
    // Every superadmin (SUPERADMIN_EMAILS) gets folded into the new
    // community's own admin_emails, on top of whatever was typed into the
    // form — otherwise a brand-new community's admin_emails starts non-empty
    // (see the "starting empty" case below) and isAllowedForCommunity stops
    // falling back to the superadmin list for it (adminAuth.ts's own doc on
    // why), which would silently lock every superadmin out of a community
    // console they just created.
    const submittedEmails = Array.isArray(body.adminEmails) ? body.adminEmails : []
    const adminEmails = Array.from(new Set([...submittedEmails, ...getAllowedAdminEmails()]))
    const community = await createCommunity({
      slug,
      name,
      mission,
      region: city,
      timezone,
      mapCenter: { lat, lng },
      themeColor: THEME_COLOR,
      backgroundColor: BACKGROUND_COLOR,
      adminEmails,
    })

    try {
      if (body.starterPack) {
        await copyStarterPack({ slug: community.slug, name, region: city, mission })
      }
      // On from the start, cloned or empty: without the Map's row a new
      // community has no Map tab, which read as a bug (the user, Oct 31).
      await addMissingSiteScreens(community.slug)
    } catch (err) {
      // Half made (Nov 21, the save survey): taken back out, so making it
      // again starts clean rather than "already in use".
      try {
        await removeUnfinishedCommunity(community.slug)
      } catch (backErr) {
        reportServerError(`[admin/communities] ${community.slug} was made only in part, and couldn’t be taken back out: delete it before making it again`, backErr)
      }
      throw err
    }

    // The new community's directory (and, for everyone else, the updated
    // communities list) is public content — drop the cache so it shows up
    // immediately instead of waiting out cacheLife('days'). Its own address
    // must work on the first load, so the list isn't served stale.
    await revalidatePublicContent({ newCommunity: community.slug })

    return Response.json({ ok: true, community })
  } catch (err) {
    reportServerError('[admin/communities] POST failed:', err)
    const message = err instanceof Error ? err.message : 'Could not create community.'
    return Response.json({ ok: false, errors: [message] }, { status: 502 })
  }
})
