import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { getAdminClient } from '@/lib/supabase/admin'
import { listWatches } from '@/lib/watchStore'
import type { Watch } from '@/lib/watches'
import { KEYSTONE_LIST_URL, KEYSTONE_WATCH_NAME, baseName, keystoneSlug, submissionKey as keystoneSubmissionKey } from '@/lib/keystoneWatch'
import { listCategories } from '@/lib/categoryStore'
import { jobFindings } from '@/lib/watchFindingStore'
import type { Finding } from '@/lib/watchFindings'
import { MEKOR_LIST_URL, MEKOR_WATCH_NAME, isMekorList, submissionKey as mekorSubmissionKey, type GuideListing } from '@/lib/mekorWatch'
import { readKeystoneList } from '@/lib/keystoneRun'
import { CATEGORIES, readMekorList } from '@/lib/mekorRun'
import { kosherCounts, kosherPlaces, type Filed, type KosherList } from '@/lib/kosherJob'
import { listingSlug } from '@/lib/listingSlug'
import { routes } from '@/lib/routes'
import { UUID } from '@/lib/itemMarkRoutes'
import { listApprovedResources } from '@/lib/resourceStore'
import { approveSubmission, rejectSubmission, submitListingDelete, submitListingUpdate } from '@/lib/submissionStore'
import { revalidatePublicContent } from '@/lib/revalidateContent'
import { kosherBoxKeys, renamedTo } from '@/lib/kosherBox'
import type { ResourceSubmission } from '@/types'

// GET /api/admin/watches/kosher — the Watches tab's Kosher certification
//     page (step 5, Oct 21): Keystone-K's and Mekor Habracha's lists, read
//     now, and every food place in the guide with what each list says about
//     it next to what the listing says (kosherJob.ts). What each difference
//     became comes from the suggestions those lists' daily reads filed: in
//     here to compare, decided before, or to be filed by tomorrow morning's
//     read; what's filed comes with each place, as `findings`
//     (watchFindings.ts), and `others` holds any that no longer match one.
//     A list with no watch is offered to start; a paused one isn't read.
//     Drawn as each place's Kosher box (kosherBox.ts, Oct 22): the food
//     categories come too, each place with its box's values now, each
//     finding with what it would make them (`values`), and a new place's
//     address and category.
//     `?item=<id>`: one place's listing and category, for its box's Edit.
//
// POST /api/admin/watches/kosher — what the page does to a listing beyond
//     a finding's Use this / Keep (Oct 22), each filed as the list's own
//     suggestion and approved at once, so the listing's history says so:
//     { action: 'renamed', id }  a "gone" finding whose list now has a
//         place by a near name: the listing takes that name and its page
//         on the list, keeps its hechsher, and the finding closes.
//     { action: 'archive', id }  a finding that leaves no hechsher: the
//         listing is archived, and the finding closes.
//     { action: 'edit', id, details }  Edit on a removal: the Kosher box
//         as the admin left it (only its fields), and the removal closes.
//     { action: 'page', resourceId, url }  Add a page: its page on
//         Keystone-K's list, as its certificate link.
//     Admin only.

export const maxDuration = 60

type Submission = { id?: string; operation: string; target_id: string | null; payload: Record<string, unknown>; note: string | null; status: string }

const pick = (d: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(keys.filter((k) => k in d).map((k) => [k, d[k]]))

function filedFrom(rows: readonly Submission[], key: (s: Submission) => string | null): Filed {
  const pending = new Set<string>()
  const settled = new Set<string>()
  for (const s of rows) {
    const k = key(s)
    if (k) (s.status === 'pending' ? pending : settled).add(k)
  }
  return { pending, settled }
}

const LISTS: { list: KosherList; url: string; is: (w: Watch) => boolean }[] = [
  { list: 'keystone', url: KEYSTONE_LIST_URL, is: (w) => w.kind === 'keystone_list' },
  { list: 'mekor', url: MEKOR_LIST_URL, is: (w) => isMekorList(w.url) },
]

export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const slug = community.slug
    const itemId = new URL(request.url).searchParams.get('item')
    if (itemId !== null) {
      if (!UUID.test(itemId)) return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })
      const item = (await listApprovedResources(slug)).find((l) => l.id === itemId && CATEGORIES.includes(l.category))
      const category = item && (await listCategories(slug)).find((c) => c.id === item.category)
      if (!item || !category) return Response.json({ ok: false, errors: ['That place isn’t in this guide.'] }, { status: 404 })
      return Response.json({ ok: true, item, category })
    }
    const supabase = getAdminClient()
    // What each list's read filed before, whatever became of it.
    const filedBy = async (name: string): Promise<Submission[]> => {
      const { data, error } = await supabase
        .from('submission')
        .select('id,operation,target_id,payload,note,status')
        .eq('community_id', slug)
        .eq('submitted_by->>name', name)
      if (error) throw new Error(error.message)
      return (data ?? []) as Submission[]
    }
    const [{ watches, available }, listingRows, keystoneFiled, mekorFiled, [categories, { findings, decided }]] = await Promise.all([
      listWatches(slug),
      supabase
        .from('resource')
        .select('id,category,name,address,phone,anchor_id,distance,details,status')
        .eq('community_id', slug)
        .in('status', ['approved', 'archived'])
        .in('category', CATEGORIES),
      filedBy(KEYSTONE_WATCH_NAME),
      filedBy(MEKOR_WATCH_NAME),
      // What they filed, waiting here to compare (watchFindings.ts).
      listCategories(slug).then(async (categories) => [categories, await jobFindings(slug, 'kosher', categories)] as const),
    ])
    if (listingRows.error) throw new Error(listingRows.error.message)

    const watchOf = (list: KosherList) => watches.find(LISTS.find((l) => l.list === list)!.is) ?? null
    const keystoneWatch = watchOf('keystone')
    const mekorWatch = watchOf('mekor')
    // Each list read now, as its daily read would; a paused one isn't.
    const [keystone, mekor] = await Promise.all([
      keystoneWatch?.active ? readKeystoneList(keystoneWatch.url) : null,
      mekorWatch?.active ? readMekorList(mekorWatch.url) : null,
    ])

    const { places, newPlaces } = kosherPlaces({
      listings: (listingRows.data ?? []) as GuideListing[],
      keystone: keystone && 'entries' in keystone ? keystone.entries : null,
      mekor: mekor && 'entries' in mekor ? mekor.entries : null,
      filed: {
        keystone: filedFrom(keystoneFiled, keystoneSubmissionKey),
        mekor: filedFrom(mekorFiled, mekorSubmissionKey),
      },
    })

    const lists = LISTS.map(({ list, url }) => {
      const watch = list === 'keystone' ? keystoneWatch : mekorWatch
      const read = list === 'keystone' ? keystone : mekor
      return {
        list,
        url: watch?.url ?? url,
        watch,
        error: read && 'error' in read ? read.error : null,
        entries: read && 'entries' in read ? read.entries.length : null,
        updated: read && 'updated' in read ? read.updated : null,
      }
    })

    // Each finding beside its place: a listing's by its id, a new place's
    // by its name. One that matches neither now (the list changed since)
    // still waits, on its own.
    const placed = new Set<string>()
    const take = (match: (f: Finding) => boolean) =>
      findings.filter((f) => {
        if (placed.has(f.id) || !match(f)) return false
        placed.add(f.id)
        return true
      })
    // Each Kosher box as the listing has it, and as each finding would make it.
    const food = categories.filter((c) => CATEGORIES.includes(c.id))
    const boxKeys = new Map(food.map((c) => [c.id, kosherBoxKeys(c)]))
    const details = new Map((listingRows.data ?? []).map((l) => [l.id as string, (l.details ?? {}) as Record<string, unknown>]))
    const sent = new Map([...keystoneFiled, ...mekorFiled].flatMap((s) => (s.id ? [[s.id, s.payload] as const] : [])))
    const withValues = (f: Finding): Finding & { address?: string; category?: string } => {
      const payload = sent.get(f.id)
      if (!payload || f.operation === 'delete') return f
      return {
        ...f,
        values: (payload.details ?? {}) as Record<string, unknown>,
        ...(f.operation === 'create' ? { address: String(payload.address ?? ''), category: String(payload.category ?? '') } : {}),
      }
    }
    const withFindings = places.map((p) => {
      const own = take((f) => f.targetId === p.id).map(withValues)
      return {
        ...p,
        href: routes.listing(slug, p.category, listingSlug(p)),
        box: pick(details.get(p.id) ?? {}, boxKeys.get(p.category) ?? []),
        findings: own,
        waiting: own.length,
        decided: decided.get(p.id) ?? null,
      }
    })
    const newWithFindings = newPlaces.map((n) => ({ ...n, findings: take((f) => f.operation === 'create' && baseName(f.name) === baseName(n.name)).map(withValues) }))
    const others = findings.filter((f) => !placed.has(f.id)).map(withValues)
    const counts = kosherCounts(withFindings, newPlaces, lists.filter((l) => l.error).length)

    return Response.json({
      ok: true,
      available,
      categories: food,
      lists,
      counts: { ...counts, toCheck: counts.toCheck + others.length },
      places: withFindings,
      newPlaces: newWithFindings,
      others,
    })
  } catch (err) {
    console.error('[admin/watches/kosher] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the kosher lists.'] }, { status: 502 })
  }
}

const LIST_NAMES = new Set([KEYSTONE_WATCH_NAME, MEKOR_WATCH_NAME])

type Row = { id: string; category: string; name: string; address: string | null; phone: string | null; anchor_id: string; distance: number | null; details: Record<string, unknown> | null; status: string }

/** The listing, as one of the lists suggests it now: filed under the
 *  list's name and approved at once, so its history says where it came from. */
async function saveAsTheList(slug: string, row: Row, by: string, change: { name?: string; details: Record<string, unknown> }, note: string, admin: string): Promise<void> {
  const payload: ResourceSubmission = {
    category: row.category,
    name: change.name ?? row.name,
    anchorId: row.anchor_id,
    distance: row.distance,
    address: row.address ?? '',
    phone: row.phone ?? '',
    details: change.details,
  } as ResourceSubmission
  const filed = await submitListingUpdate(slug, row.id, payload, note, { name: by })
  await approveSubmission(filed.id, slug, admin)
}

export async function POST(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const action = String(body?.action ?? '')
  const id = typeof body?.id === 'string' ? body.id : typeof body?.resourceId === 'string' ? body.resourceId : ''
  if (!['renamed', 'archive', 'edit', 'page'].includes(action) || !UUID.test(id)) return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })

  try {
    const slug = community.slug
    const supabase = getAdminClient()
    const listing = async (resourceId: string): Promise<Row | null> => {
      const { data, error } = await supabase.from('resource').select('*').eq('community_id', slug).eq('id', resourceId).eq('status', 'approved').maybeSingle()
      if (error) throw new Error(error.message)
      return data && CATEGORIES.includes((data as Row).category) ? (data as Row) : null
    }

    if (action === 'page') {
      const url = typeof body?.url === 'string' ? body.url.trim() : ''
      const page = keystoneSlug({ k: url })
      if (!page) return Response.json({ ok: false, errors: ['Use its page on Keystone-K’s list (keystone-k.org/kosher/…).'] }, { status: 400 })
      const row = await listing(id)
      if (!row) return Response.json({ ok: false, errors: ['That place isn’t in this guide.'] }, { status: 404 })
      const k = `https://keystone-k.org/kosher/${page}/`
      await saveAsTheList(slug, row, KEYSTONE_WATCH_NAME, { details: { ...row.details, k } }, `Its page on Keystone-K's list, given by an admin: ${k}`, admin.email)
      await revalidatePublicContent()
      return Response.json({ ok: true })
    }

    // A finding of one of the lists', still waiting.
    const { data: found, error } = await supabase.from('submission').select('id,operation,target_id,payload,note,status,submitted_by').eq('community_id', slug).eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    const by = (found?.submitted_by as { name?: string } | null)?.name ?? ''
    if (!found || found.status !== 'pending' || !found.target_id || !LIST_NAMES.has(by)) {
      return Response.json({ ok: false, errors: ['That suggestion isn’t waiting any more.'] }, { status: 409 })
    }
    const row = await listing(found.target_id)
    if (!row) return Response.json({ ok: false, errors: ['That place isn’t in this guide.'] }, { status: 404 })

    if (action === 'edit') {
      const edited = body?.details && typeof body.details === 'object' && !Array.isArray(body.details) ? (body.details as Record<string, unknown>) : null
      const category = (await listCategories(slug)).find((c) => c.id === row.category)
      const keys = category ? kosherBoxKeys(category) : []
      if (found.operation !== 'delete' || !edited || !keys.length) return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })
      await saveAsTheList(slug, row, by, { details: { ...row.details, ...pick(edited, keys) } }, `Its Kosher box, as an admin left it: ${found.note ?? ''}`.trim(), admin.email)
    } else if (action === 'renamed') {
      const to = found.operation === 'delete' ? renamedTo([found.note ?? '']) : null
      if (!to) return Response.json({ ok: false, errors: ['The list has no place by a near name.'] }, { status: 400 })
      await saveAsTheList(slug, row, by, { name: to.name, details: { ...row.details, k: to.url } }, `Renamed on Keystone-K's list: "${to.name}" (${to.url})`, admin.email)
    } else {
      // Archive: a finding that leaves it no hechsher. A removal already
      // proposes it; an edit's is filed as one.
      if (found.operation === 'update') {
        const filed = await submitListingDelete(slug, row.id, found.note, { name: by })
        await approveSubmission(filed.id, slug, admin.email)
      } else if (found.operation === 'delete') {
        await approveSubmission(found.id, slug, admin.email)
      } else {
        return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })
      }
    }
    if (!(action === 'archive' && found.operation === 'delete')) await rejectSubmission(found.id, slug, admin.email)
    await revalidatePublicContent()
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[admin/watches/kosher] POST failed:', err)
    return Response.json({ ok: false, errors: ['Could not save that.'] }, { status: 502 })
  }
}
