import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { listApprovedResources } from '@/lib/resourceStore'
import { listCategories } from '@/lib/categoryStore'
import { addWatch, getWatch, listWatches, removeWatch, updateWatch } from '@/lib/watchStore'
import { runAndRecord } from '@/lib/watchRunner'
import { kindForUrl, normalizeWatchUrl } from '@/lib/watches'
import { UUID } from '@/lib/itemMarkRoutes'
import { refuahHospitalId } from '@/lib/refuahWatch'
import { LISTING_PAGE_WATCH_CREATOR, listingPageLabel, pageReadsFor } from '@/lib/listingPageWatch'
import { isIgnoredSender, isNewsletterWatch, NEWSLETTER_IGNORED_CREATOR, NEWSLETTER_WATCH_CREATOR, newsletterUrl, senderAddress } from '@/lib/newsletter'
import { isWatchPurpose, purposeInfo, sourceProblem } from '@/lib/watchPurposes'
import { enforceRateLimit } from '@/lib/rateLimit'
import { jobPageFor } from '@/lib/watchFindings'

// GET  /api/admin/watches — the "Watches" tab: every page this community's
//      guide reads on its own (watch, migration 070), and the listings a
//      page can be tied to, each with what its own page is read for
//      (`reads`: 'times', 'hours' or null). Admin only.
// POST /api/admin/watches  body: { action: 'add', purpose?, url, resourceId?, label?, forListing? }
//      `purpose` (watchPurposes.ts) is what the admin said it keeps
//      current: 'hours' is a listing's own page (as `forListing`),
//      'times' a shul's own page or calendar, or its newsletter's address,
//      'hospital' a Refuah page. An eruv's status is set on the eruv (/api/admin/eruvim).
//      Watches a new page and checks it once straight away, so the admin
//      sees at once whether the guide can read it. `forListing`: the page
//      is the listing's own (a shul's times, a mikvah's hours), read by the
//      AI for them whenever it changes (listingPageWatch.ts).
//      A shul's newsletter address ("office@shul.org") in place of a page,
//      with the shul it's from, watches that sender's emails (newsletter.ts).
// POST /api/admin/watches  body: { action: 'check' | 'pause' | 'resume' | 'remove', id }
//      'check' is the full check (the user, Oct 20): a shul's, mikvah's or
//      menu page is read by the AI whether or not it changed, what differs
//      is filed as the daily run would, and the watch keeps what it read
//      (`lastCheck`). Adding a watch checks it the same way. Both are
//      rate-limited: each can cost an AI read.
// POST /api/admin/watches  body: { action: 'link', id, resourceId }
//      Ties a newsletter sender to its shul and turns it on: its emails
//      waiting in the guide's inbox are read within the hour.
// POST /api/admin/watches  body: { action: 'ignore', id }
//      A sender that isn't a shul: its emails are skipped. Remove undoes it.

export const maxDuration = 60

/** Checks an admin can run in ten minutes. */
const CHECK_LIMIT = { limit: 20, windowSec: 600 }

export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const [{ watches, available }, listings, categories] = await Promise.all([
      listWatches(community.slug),
      listApprovedResources(community.slug),
      listCategories(community.slug),
    ])
    const categoryOf = new Map(categories.map((c) => [c.id, c]))
    return Response.json({
      ok: true,
      available,
      watches,
      listings: listings
        .map((l) => {
          const category = categoryOf.get(l.category)
          // Where what's read for it waits: its job page, or the queue.
          const job = category ? (jobPageFor(community.slug, category)?.name ?? null) : null
          return { id: l.id, name: l.name, categoryLabel: category?.label ?? l.category, reads: (category && pageReadsFor(category)?.kind) ?? null, job }
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    })
  } catch (err) {
    console.error('[admin/watches] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the watches.'] }, { status: 502 })
  }
}

export async function POST(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const action = body?.action
  // A check can have the AI read a page: a ceiling on how often.
  if (action === 'check' || action === 'add') {
    const limited = await enforceRateLimit(request, 'admin-watch-check', CHECK_LIMIT)
    if (limited) return limited
  }

  try {
    const listingIn = async (resourceId: unknown) =>
      typeof resourceId === 'string' && UUID.test(resourceId) && (await listApprovedResources(community.slug)).some((l) => l.id === resourceId)

    // What the admin said it's for: the source has to suit it.
    const purpose = action === 'add' && isWatchPurpose(body?.purpose) ? body.purpose : null
    if (body?.purpose !== undefined && action === 'add') {
      if (!purpose || purpose === 'eruv' || !purposeInfo(purpose).addable) return Response.json({ ok: false, errors: ['That can’t be added here.'] }, { status: 400 })
      const problem = sourceProblem(purpose, typeof body?.url === 'string' ? body.url : '')
      if (problem) return Response.json({ ok: false, errors: [problem] }, { status: 400 })
    }

    if (action === 'add' && typeof body?.url === 'string' && senderAddress(body.url) && !/^https?:/i.test(body.url.trim())) {
      if (!(await listingIn(body.resourceId))) return Response.json({ ok: false, errors: ['Pick the shul this newsletter is from.'] }, { status: 400 })
      const address = senderAddress(body.url)!
      const label = typeof body?.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 120) : address
      const added = await addWatch(community.slug, { kind: 'website', url: newsletterUrl(address), resourceId: body.resourceId as string, label, createdBy: NEWSLETTER_WATCH_CREATOR })
      if (!added) return Response.json({ ok: false, errors: ['The guide already has that newsletter.'] }, { status: 409 })
      return Response.json({ ok: true, watch: added })
    }

    if (action === 'add') {
      const url = normalizeWatchUrl(typeof body?.url === 'string' ? body.url : '')
      if (!url) return Response.json({ ok: false, errors: ['That isn’t a web address.'] }, { status: 400 })
      const resourceId = typeof body?.resourceId === 'string' && body.resourceId ? body.resourceId : null
      // Refuah's pages build themselves in the browser: only a hospital's
      // own page can be read (from its data), and only against a hospital
      // in the guide (refuahWatch.ts).
      if (/^https?:\/\/([\w-]+\.)?refuah\.(com|lrbcol\.org)\//i.test(url)) {
        if (!refuahHospitalId(url)) {
          return Response.json({ ok: false, errors: ['Use the hospital’s own page on Refuah (refuah.com/hospitals/…), not a search.'] }, { status: 400 })
        }
        if (!resourceId) return Response.json({ ok: false, errors: ['Pick the hospital in the guide this Refuah page is for.'] }, { status: 400 })
      }
      if (resourceId) {
        const listings = await listApprovedResources(community.slug)
        if (!UUID.test(resourceId) || !listings.some((l) => l.id === resourceId)) {
          return Response.json({ ok: false, errors: ['That listing isn’t in this guide.'] }, { status: 400 })
        }
      }
      if (purpose === 'hospital' && !refuahHospitalId(url)) {
        return Response.json({ ok: false, errors: ['Use the hospital’s own page on Refuah (refuah.com/hospitals/…).'] }, { status: 400 })
      }
      let label = typeof body?.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 120) : null
      let createdBy = admin.email
      if (body?.forListing === true || purpose === 'times' || purpose === 'hours') {
        const listing = resourceId ? (await listApprovedResources(community.slug)).find((l) => l.id === resourceId) : undefined
        if (!listing) return Response.json({ ok: false, errors: ['Pick the shul or mikvah this page is for.'] }, { status: 400 })
        const category = (await listCategories(community.slug)).find((c) => c.id === listing.category)
        const reads = category && pageReadsFor(category)
        if (!reads) return Response.json({ ok: false, errors: ['That listing has no davening times or hours for its page to keep current.'] }, { status: 400 })
        if (purpose === 'times' && reads.kind !== 'times') return Response.json({ ok: false, errors: [`${listing.name} has no davening times to keep current.`] }, { status: 400 })
        if (purpose === 'hours' && reads.kind !== 'hours') return Response.json({ ok: false, errors: [`${listing.name} has no hours to keep current.`] }, { status: 400 })
        label ??= listingPageLabel(listing.name, reads)
        createdBy = LISTING_PAGE_WATCH_CREATOR
      }
      const added = await addWatch(community.slug, { kind: kindForUrl(url), url, resourceId, label, createdBy })
      if (!added) return Response.json({ ok: false, errors: ['The guide already watches that page.'] }, { status: 409 })
      const { watch } = await runAndRecord(added, undefined, undefined, { full: true })
      return Response.json({ ok: true, watch })
    }

    const id = typeof body?.id === 'string' ? body.id : ''
    if (!UUID.test(id) || !['check', 'pause', 'resume', 'remove', 'link', 'ignore'].includes(String(action))) {
      return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })
    }
    const existing = await getWatch(community.slug, id)
    if (!existing) return Response.json({ ok: false, errors: ['No such watch.'] }, { status: 404 })

    if (action === 'link') {
      if (!isNewsletterWatch(existing)) return Response.json({ ok: false, errors: ['Only a newsletter is linked to a shul here.'] }, { status: 400 })
      if (!(await listingIn(body?.resourceId))) return Response.json({ ok: false, errors: ['Pick the shul this newsletter is from.'] }, { status: 400 })
      const patch = { resourceId: body!.resourceId as string, active: true }
      await updateWatch(community.slug, id, patch)
      return Response.json({ ok: true, watch: { ...existing, ...patch } })
    }
    if (action === 'ignore') {
      if (!isNewsletterWatch(existing) && !isIgnoredSender(existing)) {
        return Response.json({ ok: false, errors: ['Only a newsletter sender is skipped here.'] }, { status: 400 })
      }
      const patch = { createdBy: NEWSLETTER_IGNORED_CREATOR, resourceId: null, active: false }
      await updateWatch(community.slug, id, patch)
      return Response.json({ ok: true, watch: { ...existing, ...patch } })
    }
    if (action === 'remove') {
      await removeWatch(community.slug, id)
      return Response.json({ ok: true })
    }
    if (action === 'pause' || action === 'resume') {
      await updateWatch(community.slug, id, { active: action === 'resume' })
      return Response.json({ ok: true, watch: { ...existing, active: action === 'resume' } })
    }
    const { watch } = await runAndRecord(existing, undefined, undefined, { full: true })
    return Response.json({ ok: true, watch })
  } catch (err) {
    console.error('[admin/watches] POST failed:', err)
    return Response.json({ ok: false, errors: ['Could not save that.'] }, { status: 502 })
  }
}
