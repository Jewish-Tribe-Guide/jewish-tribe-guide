import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { getAdminClient } from '@/lib/supabase/admin'
import { addWatch, listWatches, removeWatch, updateWatch } from '@/lib/watchStore'
import { runAndRecord } from '@/lib/watchRunner'
import { normalizeWatchUrl, watchHealth, type Watch } from '@/lib/watches'
import { UUID } from '@/lib/itemMarkRoutes'
import { LISTING_PAGE_WATCH_CREATOR, LISTING_PAGE_WATCH_NAME, isListingPageWatch, listingPageLabel, pageReadsFor } from '@/lib/listingPageWatch'
import { HOURS_FOUND_CREATOR, HOURS_OFF_CREATOR, foundPageLabel, hoursJobName, hoursOffUrl, isHoursOff, samePage, sourceLine } from '@/lib/hoursJob'
import { SEARCH_DEADLINE_MS, hoursJobPlaces, searchHoursPages, websiteOf } from '@/lib/hoursJobRun'
import { listingSlug } from '@/lib/listingSlug'
import { routes } from '@/lib/routes'
import { enforceRateLimit } from '@/lib/rateLimit'
import type { DirectoryResource } from '@/types'

// GET  /api/admin/watches/hours — the Watches tab's hours job page (the
//      user, Oct 21): every place with named weekly hours (a mikvah's), the
//      pages it's read from and where each came from (found from its
//      website, or added by hand), what each one's last read found (its
//      watch's `lastCheck`), and how many of their suggestions wait in the
//      moderation queue. A place with no page says why: its website is
//      searched again now (fetches only, no AI). Admin only.
//      `?counts` (the Watches tab's row): the same, but no search, so the
//      tab isn't kept waiting on a slow website; its reasons are null.
// POST body: { action: 'give', resourceId, url }
//      "Give its hours page": read from this page too, from now on, given
//      by hand, so the morning's search never takes it away. A "No hours
//      online" goes. Read straight away.
// POST body: { action: 'off', resourceId }
//      "No hours online" / "Turn off this place": kept, so the search leaves
//      it alone, and its pages stay, not read.
// POST body: { action: 'on', resourceId }
//      "Turn back on": its pages are read again straight away; with none,
//      its website is searched now.

export const maxDuration = 60

const CHECK_LIMIT = { limit: 20, windowSec: 600 }

/** The watches the page reads for one place: its pages, and its Off. */
function placeWatches(watches: readonly Watch[], id: string) {
  return {
    pages: watches.filter((w) => w.resourceId === id && isListingPageWatch(w)),
    marker: watches.find((w) => w.resourceId === id && isHoursOff(w)) ?? null,
  }
}

/** Why a place has nothing read, in a line: its pages' trouble, or what
 *  searching its website finds now. Null when something was read. */
async function reasonFor(place: DirectoryResource, pages: readonly Watch[], now: number, search: boolean): Promise<string | null> {
  const live = pages.filter((w) => w.active)
  if (live.length) {
    const loading = live.filter((w) => !['failing', 'stale'].includes(watchHealth(w, now).state))
    if (!loading.length) return `Its ${live.length === 1 ? 'page' : 'pages'} didn’t load${live[0].lastError ? `: ${live[0].lastError}` : ''}.`
    if (loading.every((w) => w.lastCheck && (w.lastCheck.result === 'nothing' || w.lastCheck.result === 'unreadable'))) {
      return `Read its ${loading.length === 1 ? 'page' : 'pages'}: no weekly hours on ${loading.length === 1 ? 'it' : 'them'}.`
    }
    return null
  }
  if (pages.length || !search) return null
  const website = websiteOf(place)
  if (!website) return 'No website on Google.'
  const got = await Promise.race([searchHoursPages(website).catch(() => null), new Promise<null>((done) => setTimeout(() => done(null), SEARCH_DEADLINE_MS))])
  if (!got) return 'Its website took too long to read.'
  if ('error' in got) return `Its website wouldn’t open: ${got.error}.`
  if (!got.found.length) return 'Read its website: no weekly hours on it.'
  return 'Its hours pages are found, and read tomorrow morning.'
}

export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const now = Date.now()
    const search = !new URL(request.url).searchParams.has('counts')
    const [{ watches, available }, { categories, places }] = await Promise.all([listWatches(community.slug), hoursJobPlaces(community.slug)])

    // Their websites' suggestions waiting in the queue, by place.
    const pending = new Map<string, number>()
    if (places.length) {
      const { data, error } = await getAdminClient()
        .from('submission')
        .select('target_id')
        .eq('community_id', community.slug)
        .eq('status', 'pending')
        .eq('submitted_by->>name', LISTING_PAGE_WATCH_NAME)
        .in(
          'target_id',
          places.map((p) => p.id),
        )
      if (error) throw new Error(error.message)
      for (const s of (data ?? []) as { target_id: string }[]) pending.set(s.target_id, (pending.get(s.target_id) ?? 0) + 1)
    }

    const rows = await Promise.all(
      places.map(async (p) => {
        const { pages, marker } = placeWatches(watches, p.id)
        const category = categories.find((c) => c.id === p.category)!
        return {
          id: p.id,
          name: p.name,
          href: routes.listing(community.slug, p.category, listingSlug(p)),
          website: websiteOf(p),
          pages: pages.map((w) => ({ watch: w, source: sourceLine(w) })),
          off: !!marker,
          offSince: marker?.createdAt ?? null,
          reason: marker ? null : await reasonFor(p, pages, now, search),
          pending: pending.get(p.id) ?? 0,
          fields: category.detailFields.filter((f) => f.type === 'hours' && f.key !== 'hours').map((f) => f.label),
        }
      }),
    )
    return Response.json({ ok: true, available, name: hoursJobName(categories), places: rows })
  } catch (err) {
    console.error('[admin/watches/hours] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the places.'] }, { status: 502 })
  }
}

export async function POST(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const action = body?.action
  const resourceId = typeof body?.resourceId === 'string' ? body.resourceId : ''
  if (!['give', 'off', 'on'].includes(String(action)) || !UUID.test(resourceId)) {
    return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })
  }
  if (action !== 'off') {
    const limited = await enforceRateLimit(request, 'admin-watch-check', CHECK_LIMIT)
    if (limited) return limited
  }

  try {
    const slug = community.slug
    const { categories, places } = await hoursJobPlaces(slug)
    const place = places.find((p) => p.id === resourceId)
    if (!place) return Response.json({ ok: false, errors: ['That place isn’t one whose hours are read.'] }, { status: 400 })
    const { watches, available } = await listWatches(slug)
    if (!available) return Response.json({ ok: false, errors: ['This needs database migration 070.'] }, { status: 400 })
    const { pages, marker } = placeWatches(watches, resourceId)
    const read = async (ws: Watch[]) => Promise.all(ws.map(async (w) => (await runAndRecord(w, undefined, undefined, { full: true })).watch))

    if (action === 'give') {
      const url = normalizeWatchUrl(typeof body?.url === 'string' ? body.url : '')
      if (!url) return Response.json({ ok: false, errors: ['That isn’t a web address.'] }, { status: 400 })
      const watched = watches.find((w) => samePage(w.url, url))
      if (watched) {
        const other = places.find((p) => p.id === watched.resourceId)
        return Response.json({ ok: false, errors: [other?.id === resourceId ? 'That page is read for it already.' : `That page is read for ${other?.name ?? 'another listing'} already.`] }, { status: 409 })
      }
      const reads = pageReadsFor(categories.find((c) => c.id === place.category)!)!
      if (marker) await removeWatch(slug, marker.id)
      const added = await addWatch(slug, { kind: 'website', url, resourceId, label: listingPageLabel(place.name, reads), createdBy: LISTING_PAGE_WATCH_CREATOR })
      if (!added) return Response.json({ ok: false, errors: ['Could not save that page.'] }, { status: 409 })
      const [given] = await read([added])
      return Response.json({ ok: true, pages: [...pages, given].map((w) => ({ watch: w, source: sourceLine(w) })), off: false })
    }

    if (action === 'off') {
      for (const w of pages) if (w.active) await updateWatch(slug, w.id, { active: false })
      if (!marker) await addWatch(slug, { kind: 'website', url: hoursOffUrl(resourceId), resourceId, label: `${place.name}: hours not read`, createdBy: HOURS_OFF_CREATOR, active: false })
      return Response.json({ ok: true, pages: pages.map((w) => ({ watch: { ...w, active: false }, source: sourceLine(w) })), off: true })
    }

    // On again.
    if (marker) await removeWatch(slug, marker.id)
    let on = pages
    for (const w of on) if (!w.active) await updateWatch(slug, w.id, { active: true })
    on = on.map((w) => ({ ...w, active: true }))
    const website = websiteOf(place)
    if (!on.length && website) {
      // Searched now, as the morning's run would.
      const got = await searchHoursPages(website)
      if ('error' in got) return Response.json({ ok: true, pages: [], off: false, reason: `Its website wouldn’t open: ${got.error}.` })
      for (const p of got.found) {
        if (watches.some((w) => samePage(w.url, p.url))) continue
        const added = await addWatch(slug, { kind: 'website', url: p.url, resourceId, label: foundPageLabel(place.name, p.link), createdBy: HOURS_FOUND_CREATOR })
        if (added) on.push(added)
      }
    }
    const done = await read(on)
    return Response.json({ ok: true, pages: done.map((w) => ({ watch: w, source: sourceLine(w) })), off: false })
  } catch (err) {
    console.error('[admin/watches/hours] POST failed:', err)
    return Response.json({ ok: false, errors: ['Could not save that.'] }, { status: 502 })
  }
}
