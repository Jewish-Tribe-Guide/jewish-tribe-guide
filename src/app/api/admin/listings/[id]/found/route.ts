import type { NextRequest } from 'next/server'
import { adminRead, adminWrite, unchanged } from '@/lib/adminRoute'
import { latestEmailFrom } from '@/lib/gmailNow'
import { readOwnSiteNow } from '@/lib/hoursJobRun'
import { receiveNewsletter } from '@/lib/newsletterRun'
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
// POST { action: 'email', address }    its latest email, read and filed as if the
//                                      hourly run had found it; says if there's none.
// POST { action: 'take' }              all of it on the listing, as approving
//                                      each on To do would, in the order filed.

export const maxDuration = 60

export const GET = adminRead(async (_request: NextRequest, { community }, ctx: RouteContext<'/api/admin/listings/[id]/found'>) => {
  const { id } = await ctx.params
  try {
    return Response.json({ ok: true, found: await pendingForListing(community.slug, id) })
  } catch (err) {
    console.error('[admin/listings/found] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not see what it found.'] }, { status: 502 })
  }
})

// Google's read and take reach the site; the email and website reads only
// file findings for To do, so they leave the cache alone (unchanged).
export const POST = adminWrite(async (request: NextRequest, { community, admin }, ctx: RouteContext<'/api/admin/listings/[id]/found'>) => {
  const { id } = await ctx.params
  const body = (await request.json().catch(() => null)) as { action?: unknown; address?: unknown } | null
  try {
    if (body?.action === 'google') {
      const row = await loadSyncableListing(id)
      if (!row) return unchanged(Response.json({ ok: true, read: false }))
      const result = await syncOneListing(row)
      if (result.outcome === 'synced' && result.statusChange) await sendStatusChangeDigest([result.statusChange]).catch(() => {})
      return Response.json({ ok: true, read: result.outcome === 'synced' })
    }
    if (body?.action === 'email') {
      const apiKey = process.env.OPENAI_API_KEY
      if (typeof body.address !== 'string' || !apiKey) return unchanged(Response.json({ ok: true, state: 'no-answer' }))
      const look = await latestEmailFrom(community.slug, body.address)
      if (look.state === 'found') await receiveNewsletter(community.slug, look.email, { apiKey, communityName: community.name })
      return unchanged(Response.json({ ok: true, state: look.state, account: 'account' in look ? look.account : null }))
    }
    if (body?.action === 'site') return unchanged(Response.json({ ok: true, read: await readOwnSiteNow(community.slug, id) }))
    if (body?.action !== 'take') return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })
    const found = await pendingForListing(community.slug, id)
    for (const f of found) await approveSubmission(f.id, community.slug, admin.email)
    return Response.json({ ok: true, taken: found.length })
  } catch (err) {
    console.error('[admin/listings/found] POST failed:', err)
    return Response.json({ ok: false, errors: ['Could not add that to the listing.'] }, { status: 502 })
  }
})
