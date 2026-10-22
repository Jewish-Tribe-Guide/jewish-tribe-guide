import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { listApprovedResources } from '@/lib/resourceStore'
import { jobFindings } from '@/lib/watchFindingStore'
import { listCategories } from '@/lib/categoryStore'
import { contactBoxes } from '@/lib/hospitalBoxes'
import type { CategoryConfig } from '@/lib/categories'
import { addWatch, listWatches, removeWatch, updateWatch } from '@/lib/watchStore'
import { runAndRecord } from '@/lib/watchRunner'
import { normalizeWatchUrl, type Watch } from '@/lib/watches'
import { UUID } from '@/lib/itemMarkRoutes'
import { refuahHospitalId } from '@/lib/refuahWatch'
import { readRefuahNear } from '@/lib/refuahRun'
import {
  HOSPITAL_CATEGORY,
  REFUAH_MATCH_CREATOR,
  REFUAH_NOT_LISTED_CREATOR,
  REFUAH_STOPPED_CREATOR,
  givenLine,
  isNotOnRefuah,
  isStoppedRefuah,
  matchLine,
  matchRefuah,
  nearestRefuah,
  notOnRefuahUrl,
  refuahPageUrl,
  refuahWatchLabel,
  streetOf,
  wantedRefuahWatches,
  type RefuahListed,
  type RefuahMatch,
} from '@/lib/refuahMatch'
import { haversineMiles } from '@/lib/geo'
import { listingSlug } from '@/lib/listingSlug'
import { routes } from '@/lib/routes'
import { enforceRateLimit } from '@/lib/rateLimit'
import type { DirectoryResource } from '@/types'

// GET  /api/admin/watches/hospitals — the Watches tab's Hospitals page (the
//      user, Oct 21): every hospital in the guide, with the Refuah page it's
//      read from and where that came from (matched by map position, or given
//      by hand), what the last read found (its watch's `lastCheck`), what
//      Refuah has that the listing doesn't, waiting to compare
//      (watchFindings.ts), and when its last one was decided.
//      `nearby`: Refuah's hospitals nearest it, for "Choose a different
//      Refuah hospital". One request to Refuah per hospital (readRefuahNear).
//      `boxes`: its listing's boxes of contacts, with what each has now.
//      `?item=<id>`: one hospital's listing and category, for a box's Edit.
//      Admin only.
// POST body: { action: 'choose', resourceId, url }
//      "Give its Refuah page" / "Choose a different Refuah hospital": the
//      hospital is read from this page from now on, given by hand, so the
//      daily match leaves it alone. Its other Refuah page goes, and so does
//      a "Not on Refuah". Read straight away.
// POST body: { action: 'off', resourceId }
//      "Turn off" (its page stays, not read) or, with no page, "Not on
//      Refuah" (kept, so the daily match leaves it alone).
// POST body: { action: 'on', resourceId }
//      "Turn back on": its page is read again straight away; a "Not on
//      Refuah" goes, and the hospital is matched again now.
// POST body: { action: 'stop', resourceId }
//      Reads' ×: its Refuah page is no longer read, and kept so the daily
//      match doesn't add it again. Add a page reads one again.
// POST body: { action: 'none', resourceId }
//      Reads' "Not on Refuah": its page goes, and it's said not to be on
//      Refuah (Off).

export const maxDuration = 60

const CHECK_LIMIT = { limit: 20, windowSec: 600 }

type Refuah = { id: string; name: string; street: string | null; url: string }

function asRefuah(r: RefuahListed): Refuah {
  return { id: r._id, name: r.name, street: streetOf(r.formattedAddress), url: refuahPageUrl(r._id) }
}

/** The watches the page reads for one hospital: its Refuah page (one an
 *  admin gave first), one it stopped reading, and its "Not on Refuah". */
function hospitalWatches(watches: readonly Watch[], id: string) {
  const own = watches.filter((w) => w.resourceId === id && refuahHospitalId(w.url))
  const pages = own.filter((w) => !isStoppedRefuah(w))
  return {
    pages,
    stopped: own.filter(isStoppedRefuah),
    watch: pages.find((w) => w.createdBy !== REFUAH_MATCH_CREATOR) ?? pages[0] ?? null,
    marker: watches.find((w) => w.resourceId === id && isNotOnRefuah(w)) ?? null,
  }
}

/** Its listing's boxes of contacts, each with what the listing has in it
 *  now, for Hospitals to show a box at a time (hospitalBoxes.ts). */
function listedBoxes(h: DirectoryResource, category: CategoryConfig | undefined) {
  if (!category) return []
  const labelOf = (k: string) => category.detailFields.find((f) => f.key === k)?.label ?? k
  return contactBoxes(category, h as unknown as Record<string, unknown>).map((b) => ({ ...b, labels: b.keys.map(labelOf), now: Object.fromEntries(b.keys.map((k) => [k, h[k] ?? null])) }))
}

/** Where its Refuah page came from, or why it has none. */
function lineFor(h: DirectoryResource, watch: Watch | null, record: RefuahListed | null, match: RefuahMatch | undefined, names: ReadonlyMap<string, string>): string {
  if (!watch) return matchLine(match, names)
  if (watch.createdBy !== REFUAH_MATCH_CREATOR) return givenLine(record, h.geo)
  // The page it was matched to, which a later match may not be.
  if (record && h.geo) return matchLine({ state: 'matched', refuah: record, miles: haversineMiles(h.geo, { lat: record.latitude, lng: record.longitude }) })
  return 'Matched to Refuah by map position.'
}

async function hospitalsIn(community: string): Promise<DirectoryResource[]> {
  return (await listApprovedResources(community)).filter((l) => l.category === HOSPITAL_CATEGORY)
}

export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const itemId = new URL(request.url).searchParams.get('item')
    if (itemId !== null) {
      if (!UUID.test(itemId)) return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })
      const item = (await hospitalsIn(community.slug)).find((h) => h.id === itemId)
      const category = item && (await listCategories(community.slug)).find((c) => c.id === HOSPITAL_CATEGORY)
      if (!item || !category) return Response.json({ ok: false, errors: ['That hospital isn’t in this guide.'] }, { status: 404 })
      return Response.json({ ok: true, item, category })
    }
    const [{ watches, available }, hospitals] = await Promise.all([listWatches(community.slug), hospitalsIn(community.slug)])
    // The Watches tab asks for these every time it opens: no hospitals, no request.
    const list = await readRefuahNear(hospitals.flatMap((h) => (h.geo ? [h.geo] : [])))
    const refuah = 'error' in list ? [] : list
    const byId = new Map(refuah.map((r) => [r._id, r]))
    const matches = matchRefuah(hospitals, refuah)
    const names = new Map(hospitals.map((h) => [h.id, h.name]))

    // What Refuah has that a listing doesn't, waiting here to compare, and
    // when each hospital's last one was decided (watchFindings.ts).
    const categories = hospitals.length ? await listCategories(community.slug) : []
    const category = categories.find((c) => c.id === HOSPITAL_CATEGORY)
    const { findings, decided } = hospitals.length ? await jobFindings(community.slug, 'hospitals', categories) : { findings: [], decided: new Map() }

    return Response.json({
      ok: true,
      available,
      refuahError: 'error' in list ? list.error : null,
      hospitals: hospitals
        .map((h) => {
          const { watch, marker } = hospitalWatches(watches, h.id)
          const record = watch ? (byId.get(refuahHospitalId(watch.url)!) ?? null) : null
          const auto = watch?.createdBy === REFUAH_MATCH_CREATOR
          return {
            id: h.id,
            name: h.name,
            href: routes.listing(community.slug, h.category, listingSlug(h)),
            watch,
            notOnRefuah: !!marker,
            source: watch ? (auto ? 'match' : 'hand') : null,
            line: lineFor(h, watch, record, matches.get(h.id), names),
            refuah: record ? asRefuah(record) : null,
            nearby: nearestRefuah(h.geo, refuah).map((r) => ({ ...asRefuah(r), miles: r.miles })),
            findings: findings.filter((f) => f.targetId === h.id),
            decided: decided.get(h.id) ?? null,
            boxes: listedBoxes(h, category),
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    })
  } catch (err) {
    console.error('[admin/watches/hospitals] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the hospitals.'] }, { status: 502 })
  }
}

export async function POST(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const action = body?.action
  const resourceId = typeof body?.resourceId === 'string' ? body.resourceId : ''
  if (!['choose', 'off', 'on', 'stop', 'none'].includes(String(action)) || !UUID.test(resourceId)) {
    return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })
  }
  if (action === 'choose' || action === 'on') {
    const limited = await enforceRateLimit(request, 'admin-watch-check', CHECK_LIMIT)
    if (limited) return limited
  }

  try {
    const slug = community.slug
    const hospital = (await hospitalsIn(slug)).find((h) => h.id === resourceId)
    if (!hospital) return Response.json({ ok: false, errors: ['That hospital isn’t in this guide.'] }, { status: 400 })
    const { watches, available } = await listWatches(slug)
    if (!available) return Response.json({ ok: false, errors: ['This needs database migration 070.'] }, { status: 400 })
    const { pages, stopped, watch, marker } = hospitalWatches(watches, resourceId)

    if (action === 'choose') {
      const url = normalizeWatchUrl(typeof body?.url === 'string' ? body.url : '')
      const id = url && refuahHospitalId(url)
      if (!id) return Response.json({ ok: false, errors: ['Use the hospital’s own page on Refuah (refuah.com/hospitals/…), not a search.'] }, { status: 400 })
      const page = refuahPageUrl(id)
      const elsewhere = watches.find((w) => w.url === page && w.resourceId !== resourceId)
      if (elsewhere) {
        const other = (await hospitalsIn(slug)).find((h) => h.id === elsewhere.resourceId)
        return Response.json({ ok: false, errors: [`That Refuah page is already read for ${other?.name ?? 'another hospital'}.`] }, { status: 409 })
      }
      for (const w of [...pages, ...stopped, ...(marker ? [marker] : [])]) await removeWatch(slug, w.id)
      const added = await addWatch(slug, { kind: 'website', url: page, resourceId, label: refuahWatchLabel(hospital.name), createdBy: admin.email })
      if (!added) return Response.json({ ok: false, errors: ['Could not save that page.'] }, { status: 409 })
      const { watch: read } = await runAndRecord(added, undefined, undefined, { full: true })
      return Response.json({ ok: true, watch: read, notOnRefuah: false })
    }

    if (action === 'stop') {
      for (const w of pages) await updateWatch(slug, w.id, { createdBy: REFUAH_STOPPED_CREATOR, active: false })
      return Response.json({ ok: true, watch: null, notOnRefuah: !!marker })
    }

    if (action === 'none') {
      for (const w of [...pages, ...stopped]) await removeWatch(slug, w.id)
      if (!marker) await addWatch(slug, { kind: 'website', url: notOnRefuahUrl(resourceId), resourceId, label: `${hospital.name}: not on Refuah`, createdBy: REFUAH_NOT_LISTED_CREATOR, active: false })
      return Response.json({ ok: true, watch: null, notOnRefuah: true })
    }

    if (action === 'off') {
      if (watch) {
        for (const w of pages) if (w.active) await updateWatch(slug, w.id, { active: false })
        return Response.json({ ok: true, watch: { ...watch, active: false }, notOnRefuah: false })
      }
      if (!marker) await addWatch(slug, { kind: 'website', url: notOnRefuahUrl(resourceId), resourceId, label: `${hospital.name}: not on Refuah`, createdBy: REFUAH_NOT_LISTED_CREATOR, active: false })
      return Response.json({ ok: true, watch: null, notOnRefuah: true })
    }

    // On again.
    if (marker) await removeWatch(slug, marker.id)
    let on: Watch | null = watch
    if (on) {
      await updateWatch(slug, on.id, { active: true })
      on = { ...on, active: true }
    } else {
      // Matched again now, as the morning's run would.
      const list = await readRefuahNear(hospital.geo ? [hospital.geo] : [])
      if ('error' in list) return Response.json({ ok: false, errors: [list.error] }, { status: 502 })
      const rest = watches.filter((w) => w.id !== marker?.id)
      const [wanted] = wantedRefuahWatches([hospital], matchRefuah([hospital], list), rest)
      if (wanted && !rest.some((w) => w.url === wanted.url)) {
        on = await addWatch(slug, { kind: 'website', url: wanted.url, resourceId, label: wanted.label, createdBy: REFUAH_MATCH_CREATOR })
      }
    }
    if (!on) return Response.json({ ok: true, watch: null, notOnRefuah: false })
    const { watch: read } = await runAndRecord(on, undefined, undefined, { full: true })
    return Response.json({ ok: true, watch: read, notOnRefuah: false })
  } catch (err) {
    console.error('[admin/watches/hospitals] POST failed:', err)
    return Response.json({ ok: false, errors: ['Could not save that.'] }, { status: 502 })
  }
}
