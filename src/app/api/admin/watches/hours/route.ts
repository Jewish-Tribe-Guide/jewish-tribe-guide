import { GUIDE_PAGE_ERROR, isGuidePage } from '@/lib/guidePage'
import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { jobFindings } from '@/lib/watchFindingStore'
import { addWatch, listWatches, removeWatch, updateWatch } from '@/lib/watchStore'
import { runAndRecord } from '@/lib/watchRunner'
import { normalizeWatchUrl, watchHealth, type Watch } from '@/lib/watches'
import { UUID } from '@/lib/itemMarkRoutes'
import { hoursSections, offeredSections, sectionKeys } from '@/lib/hoursSections'
import { LISTING_PAGE_WATCH_CREATOR, isListingPageWatch, listingPageLabel, pageReadsFor } from '@/lib/listingPageWatch'
import { HOURS_FOUND_CREATOR, HOURS_OFF_CREATOR, PAGE_STOPPED_CREATOR, foundPageLabel, hoursJobName, hoursOffUrl, isHoursOff, isStoppedPage, jobWords, samePage, sourceLine, type PageJob } from '@/lib/hoursJob'
import { SEARCH_DEADLINE_MS, hoursJobPlaces, searchHoursPages, websiteOf } from '@/lib/hoursJobRun'
import { listingSlug } from '@/lib/listingSlug'
import { listedContact } from '@/lib/contactRead'
import { routes } from '@/lib/routes'
import { enforceRateLimit } from '@/lib/rateLimit'
import { readSchedules, regularMinyanim, schedulesKey } from '@/lib/schedules'
import type { CategoryConfig } from '@/lib/categories'
import type { DirectoryResource } from '@/types'

// GET  /api/admin/watches/hours — the Watches tab's hours job page (the
//      user, Oct 21): every place with named weekly hours (a mikvah's), the
//      pages it's read from and where each came from (found from its
//      website, or added by hand), what each one's last read found (its
//      watch's `lastCheck`), what they found that differs from the listing,
//      waiting to compare (watchFindings.ts), and when the place's last
//      one was decided. A place with no page says why: its website is
//      searched again now (fetches only, no AI), and the pages it finds
//      added. Admin only.
//      `?counts` (the Watches tab's row): the same, but no search, so the
//      tab isn't kept waiting on a slow website; its reasons are null.
//      `?job=times`: the Shul times page (Oct 21), every place with davening
//      times, the same way, and each one's times as the listing has them
//      (`times`), for the boxes that are the same as its website. Every POST
//      takes it too.
//      `?item=<id>`: one place's listing and category, for Edit (the
//      listing's own box editor, BoxEditSheet).
// POST body: { action: 'check', resourceId }
//      "Check now", on every row: its pages read straight away; with none,
//      its website searched now and what it finds added and read.
// POST body: { action: 'give', resourceId, url, replaces? }
//      "Add a page": read from this page too, from now on, given by hand,
//      so the morning's search never takes it away. A "No hours online"
//      goes. Read straight away. `replaces`, "Use a different page": that
//      page of its own is stopped.
// POST body: { action: 'off', resourceId }
//      "No hours online" / "Turn off this place": kept, so the search leaves
//      it alone, and its pages stay, not read.
// POST body: { action: 'on', resourceId }
//      "Turn back on": its pages are read again straight away; with none,
//      its website is searched now.
// POST body: { action: 'stop', resourceId, id }
//      "Stop reading this page", found or given: kept, never read, so the
//      morning's search never adds it again (the user, Oct 21: an admin
//      "can remove or replace them"; replacing is this and Give).
// POST body: { action: 'again', resourceId, id }
//      "Read it again": a stopped page, read from now on as one given by
//      hand, and straight away.

export const maxDuration = 60

const CHECK_LIMIT = { limit: 20, windowSec: 600 }

/** The watches the page reads for one place: its pages, the ones an admin
 *  stopped, and its Off. */
function placeWatches(watches: readonly Watch[], id: string) {
  return {
    pages: watches.filter((w) => w.resourceId === id && isListingPageWatch(w)),
    stopped: watches.filter((w) => w.resourceId === id && isStoppedPage(w)),
    marker: watches.find((w) => w.resourceId === id && isHoursOff(w)) ?? null,
  }
}

/** A shul's times as its listing has them. */
function listedTimes(p: DirectoryResource, category: CategoryConfig) {
  const field = category.detailFields.find((f) => f.type === 'minyanim')
  return field ? { key: field.key, minyanim: regularMinyanim(p[field.key]), schedules: readSchedules(p[schedulesKey(field.key)]) } : null
}

/** A mikvah's sections as its listing has them: the ones it ticks, each
 *  with its hours and notes (hoursSections.ts). */
function listedSections(p: DirectoryResource, category: CategoryConfig) {
  const reads = pageReadsFor(category)
  if (reads?.kind !== 'hours') return []
  const labelOf = (k: string) => category.detailFields.find((f) => f.key === k)?.label ?? k
  // `labels`: its fields' names, which start the lines a page's read gave.
  return offeredSections(hoursSections(category, reads.keys), p).map((s) => ({ ...s, labels: sectionKeys(s).map(labelOf), now: Object.fromEntries(sectionKeys(s).map((k) => [k, p[k] ?? null])) }))
}

const jobOf = (request: Request): PageJob => (new URL(request.url).searchParams.get('job') === 'times' ? 'times' : 'hours')
const shown = (ws: readonly Watch[]) => ws.map((w) => ({ watch: w, source: sourceLine(w) }))

/** Why a place has nothing read, in a line: its pages' trouble. Null when
 *  something was read, or when it has no page (searchFor says why). */
function reasonFor(pages: readonly Watch[], now: number, job: PageJob): string | null {
  const words = jobWords(job)
  const live = pages.filter((w) => w.active)
  if (!live.length) return null
  const loading = live.filter((w) => !['failing', 'stale'].includes(watchHealth(w, now).state))
  if (!loading.length) return `Its ${live.length === 1 ? 'page' : 'pages'} didn’t load${live[0].lastError ? `: ${live[0].lastError}` : ''}.`
  if (loading.every((w) => w.lastCheck && (w.lastCheck.result === 'nothing' || w.lastCheck.result === 'unreadable'))) {
    return `Read its ${loading.length === 1 ? 'page' : 'pages'}: ${words.none} on ${loading.length === 1 ? 'it' : 'them'}.`
  }
  return null
}

/** A place with no page: its website searched now (fetches only, no AI),
 *  and what it finds added, as the morning's run would add them (the user,
 *  Oct 21: "all the ones in not read yet can't be checked"). So every row
 *  on the page has a page to Check now, and the Watches tab, which
 *  searches nothing, counts them as the page does. */
async function searchFor(slug: string, place: DirectoryResource, watches: readonly Watch[], job: PageJob, deadline: number | null): Promise<{ added: Watch[]; reason: string | null }> {
  const words = jobWords(job)
  const website = websiteOf(place)
  if (!website) return { added: [], reason: 'No website on Google.' }
  const search = searchHoursPages(website, undefined, job).catch(() => null)
  const got = deadline === null ? await search : await Promise.race([search, new Promise<null>((done) => setTimeout(() => done(null), deadline))])
  if (!got) return { added: [], reason: 'Its website took too long to read.' }
  if ('error' in got) return { added: [], reason: `Its website wouldn’t open: ${got.error}.` }
  const added: Watch[] = []
  for (const p of got.found) {
    if (watches.some((w) => samePage(w.url, p.url))) continue
    const w = await addWatch(slug, { kind: 'website', url: p.url, resourceId: place.id, label: foundPageLabel(place.name, p.link), createdBy: HOURS_FOUND_CREATOR })
    if (w) added.push(w)
  }
  return { added, reason: added.length ? null : `Read its website: ${words.none} on it.` }
}

export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const now = Date.now()
    const search = !new URL(request.url).searchParams.has('counts')
    const job = jobOf(request)
    const itemId = new URL(request.url).searchParams.get('item')
    if (itemId !== null) {
      if (!UUID.test(itemId)) return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })
      const { categories, places } = await hoursJobPlaces(community.slug, job)
      const item = places.find((p) => p.id === itemId)
      const category = item && categories.find((c) => c.id === item.category)
      if (!item || !category) return Response.json({ ok: false, errors: [`That place isn’t one whose ${jobWords(job).what} are read.`] }, { status: 404 })
      return Response.json({ ok: true, item, category })
    }
    const [{ watches, available }, { categories, places }] = await Promise.all([listWatches(community.slug), hoursJobPlaces(community.slug, job)])

    // What their pages (and a shul's newsletter) found, waiting here to
    // compare, and when each place's last one was decided (watchFindings.ts).
    const { findings, decided } = await jobFindings(community.slug, job, categories)

    const rows = await Promise.all(
      places.map(async (p) => {
        const { pages: had, stopped, marker } = placeWatches(watches, p.id)
        const category = categories.find((c) => c.id === p.category)!
        const searched = !marker && !had.length && search && available ? await searchFor(community.slug, p, watches, job, SEARCH_DEADLINE_MS) : null
        const pages = [...had, ...(searched?.added ?? [])]
        const reason = marker ? null : (searched?.reason ?? reasonFor(pages, now, job))
        return {
          id: p.id,
          name: p.name,
          href: routes.listing(community.slug, p.category, listingSlug(p)),
          website: websiteOf(p),
          pages: shown(pages),
          stopped: shown(stopped),
          off: !!marker,
          offSince: marker?.createdAt ?? null,
          reason,
          findings: findings.filter((f) => f.targetId === p.id),
          decided: decided.get(p.id) ?? null,
          fields: category.detailFields.filter((f) => (job === 'times' ? f.type === 'minyanim' : f.type === 'hours' && f.key !== 'hours')).map((f) => f.label),
          ...(job === 'times' ? { times: listedTimes(p, category) } : { sections: listedSections(p, category) }),
          // Its phone and email as listed, for the Phone or Contact box.
          contact: listedContact(category, p as unknown as Record<string, unknown>),
        }
      }),
    )
    return Response.json({ ok: true, available, name: hoursJobName(categories, job), places: rows })
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
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!['give', 'off', 'on', 'stop', 'again', 'check'].includes(String(action)) || !UUID.test(resourceId) || ((action === 'stop' || action === 'again') && !id)) {
    return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })
  }
  if (action !== 'off' && action !== 'stop') {
    const limited = await enforceRateLimit(request, 'admin-watch-check', CHECK_LIMIT)
    if (limited) return limited
  }

  try {
    const slug = community.slug
    const job = jobOf(request)
    const words = jobWords(job)
    const { categories, places } = await hoursJobPlaces(slug, job)
    const place = places.find((p) => p.id === resourceId)
    if (!place) return Response.json({ ok: false, errors: [`That place isn’t one whose ${words.what} are read.`] }, { status: 400 })
    const { watches, available } = await listWatches(slug)
    if (!available) return Response.json({ ok: false, errors: ['This needs database migration 070.'] }, { status: 400 })
    const { pages, stopped, marker } = placeWatches(watches, resourceId)
    // One page after another: each read sees what the one before it
    // filed, so a shul's three pages can't each file the same part of its
    // times at once (Sons of Israel, Oct 21).
    const read = async (ws: Watch[]) => {
      const done: Watch[] = []
      for (const w of ws) done.push((await runAndRecord(w, undefined, undefined, { full: true })).watch)
      return done
    }
    const reply = (ps: readonly Watch[], st: readonly Watch[], rest: Record<string, unknown> = {}) => Response.json({ ok: true, pages: shown(ps), stopped: shown(st), off: false, ...rest })
    const again = async (w: Watch) => {
      await updateWatch(slug, w.id, { createdBy: LISTING_PAGE_WATCH_CREATOR, active: true })
      const [done] = await read([{ ...w, createdBy: LISTING_PAGE_WATCH_CREATOR, active: true }])
      return reply([...pages, done], stopped.filter((x) => x.id !== w.id))
    }

    if (action === 'stop') {
      const page = pages.find((w) => w.id === id)
      if (!page) return Response.json({ ok: false, errors: ['That page isn’t read for it.'] }, { status: 400 })
      await updateWatch(slug, page.id, { createdBy: PAGE_STOPPED_CREATOR, active: false })
      return reply(
        pages.filter((w) => w.id !== id),
        [...stopped, { ...page, createdBy: PAGE_STOPPED_CREATOR, active: false }],
        { off: !!marker },
      )
    }

    if (action === 'again') {
      const page = stopped.find((w) => w.id === id)
      if (!page) return Response.json({ ok: false, errors: ['That page isn’t one you stopped.'] }, { status: 400 })
      return await again(page)
    }

    if (action === 'give') {
      const url = normalizeWatchUrl(typeof body?.url === 'string' ? body.url : '')
      if (!url) return Response.json({ ok: false, errors: ['That isn’t a web address.'] }, { status: 400 })
      if (isGuidePage(url)) return Response.json({ ok: false, errors: [GUIDE_PAGE_ERROR] }, { status: 400 })
      const watched = watches.find((w) => samePage(w.url, url))
      // Given again after it was stopped: read again.
      if (watched && watched.resourceId === resourceId && isStoppedPage(watched)) {
        if (marker) await removeWatch(slug, marker.id)
        return await again(watched)
      }
      if (watched) {
        const other = places.find((p) => p.id === watched.resourceId)
        return Response.json({ ok: false, errors: [other?.id === resourceId ? 'That page is read for it already.' : `That page is read for ${other?.name ?? 'another listing'} already.`] }, { status: 409 })
      }
      const reads = pageReadsFor(categories.find((c) => c.id === place.category)!)!
      if (marker) await removeWatch(slug, marker.id)
      const added = await addWatch(slug, { kind: 'website', url, resourceId, label: listingPageLabel(place.name, reads), createdBy: LISTING_PAGE_WATCH_CREATOR })
      if (!added) return Response.json({ ok: false, errors: ['Could not save that page.'] }, { status: 409 })
      const [given] = await read([added])
      // "Use a different page": the old one stopped, so the search never adds it again.
      const replaced = typeof body?.replaces === 'string' ? pages.find((w) => w.id === body.replaces) : undefined
      if (replaced) await updateWatch(slug, replaced.id, { createdBy: PAGE_STOPPED_CREATOR, active: false })
      return reply([...pages.filter((w) => w !== replaced), given], replaced ? [...stopped, { ...replaced, createdBy: PAGE_STOPPED_CREATOR, active: false }] : stopped)
    }

    if (action === 'off') {
      for (const w of pages) if (w.active) await updateWatch(slug, w.id, { active: false })
      if (!marker) await addWatch(slug, { kind: 'website', url: hoursOffUrl(resourceId), resourceId, label: `${place.name}: ${words.what} not read`, createdBy: HOURS_OFF_CREATOR, active: false })
      return reply(
        pages.map((w) => ({ ...w, active: false })),
        stopped,
        { off: true },
      )
    }

    if (action === 'check') {
      if (marker || (pages.length && !pages.some((w) => w.active))) return Response.json({ ok: false, errors: ['It’s turned off. Turn it back on to read it.'] }, { status: 400 })
      if (!pages.length) {
        const { added, reason } = await searchFor(slug, place, watches, job, null)
        return reply(await read(added), stopped, { reason })
      }
      return reply(await read(pages.filter((w) => w.active)), stopped)
    }

    // On again.
    if (marker) await removeWatch(slug, marker.id)
    for (const w of pages) if (!w.active) await updateWatch(slug, w.id, { active: true })
    const on = pages.map((w) => ({ ...w, active: true }))
    if (!on.length) {
      // Searched now, as the morning's run would.
      const { added, reason } = await searchFor(slug, place, watches, job, null)
      return reply(await read(added), stopped, { reason })
    }
    return reply(await read(on), stopped)
  } catch (err) {
    console.error('[admin/watches/hours] POST failed:', err)
    return Response.json({ ok: false, errors: ['Could not save that.'] }, { status: 502 })
  }
}
