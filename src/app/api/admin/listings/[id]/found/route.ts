import type { NextRequest } from 'next/server'
import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { readOwnSiteNow } from '@/lib/hoursJobRun'
import { revalidatePublicContent } from '@/lib/revalidateContent'
import { approveSubmission, pendingForListing } from '@/lib/submissionStore'
import { sendStatusChangeDigest } from '@/lib/email'
import { loadSyncableListing, syncOneListing } from '@/lib/syncListing'

// What the first read of a place just added found (boards AddReading13,
// AddFound13), for the Add screen.
// GET  /api/admin/listings/:id/found   what's waiting for it, each with what it would set.
// POST { action: 'google' }            its Google read, as approving a listing
//                                      does; after its Stops are saved.
// POST { action: 'site' }              its own website read now, for a place
//                                      whose times and hours aren't read.
// POST { action: 'take' }              all of it on the listing, as approving
//                                      each on To do would, in the order filed.

export const maxDuration = 60

export async function GET(request: NextRequest, ctx: RouteContext<'/api/admin/listings/[id]/found'>) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })
  const { id } = await ctx.params
  try {
    return Response.json({ ok: true, found: await pendingForListing(community.slug, id) })
  } catch (err) {
    console.error('[admin/listings/found] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not see what it found.'] }, { status: 502 })
  }
}

export async function POST(request: NextRequest, ctx: RouteContext<'/api/admin/listings/[id]/found'>) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })
  const { id } = await ctx.params
  const body = (await request.json().catch(() => null)) as { action?: unknown } | null
  try {
    if (body?.action === 'google') {
      const row = await loadSyncableListing(id)
      if (!row) return Response.json({ ok: true, read: false })
      const result = await syncOneListing(row)
      if (result.outcome === 'synced' && result.statusChange) await sendStatusChangeDigest([result.statusChange]).catch(() => {})
      await revalidatePublicContent()
      return Response.json({ ok: true, read: result.outcome === 'synced' })
    }
    if (body?.action === 'site') return Response.json({ ok: true, read: await readOwnSiteNow(community.slug, id) })
    if (body?.action !== 'take') return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })
    const found = await pendingForListing(community.slug, id)
    for (const f of found) await approveSubmission(f.id, community.slug, admin.email)
    await revalidatePublicContent()
    return Response.json({ ok: true, taken: found.length })
  } catch (err) {
    console.error('[admin/listings/found] POST failed:', err)
    return Response.json({ ok: false, errors: ['Could not add that to the listing.'] }, { status: 502 })
  }
}
