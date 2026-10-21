import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { getAdminClient } from '@/lib/supabase/admin'
import { listWatches } from '@/lib/watchStore'
import type { Watch } from '@/lib/watches'
import { KEYSTONE_LIST_URL, KEYSTONE_WATCH_NAME, baseName, submissionKey as keystoneSubmissionKey } from '@/lib/keystoneWatch'
import { listCategories } from '@/lib/categoryStore'
import { jobFindings } from '@/lib/watchFindingStore'
import type { Finding } from '@/lib/watchFindings'
import { MEKOR_LIST_URL, MEKOR_WATCH_NAME, isMekorList, submissionKey as mekorSubmissionKey, type GuideListing } from '@/lib/mekorWatch'
import { readKeystoneList } from '@/lib/keystoneRun'
import { CATEGORIES, readMekorList } from '@/lib/mekorRun'
import { kosherCounts, kosherPlaces, type Filed, type KosherList } from '@/lib/kosherJob'
import { listingSlug } from '@/lib/listingSlug'
import { routes } from '@/lib/routes'

// GET /api/admin/watches/kosher — the Watches tab's Kosher certification
//     page (step 5, Oct 21): Keystone-K's and Mekor Habracha's lists, read
//     now, and every food place in the guide with what each list says about
//     it next to what the listing says (kosherJob.ts). What each difference
//     became comes from the suggestions those lists' daily reads filed: in
//     here to compare, decided before, or to be filed by tomorrow morning's
//     read; what's filed comes with each place, as `findings`
//     (watchFindings.ts), and `others` holds any that no longer match one.
//     A list with no watch is offered to start; a paused one isn't read.
//     Reads only. Admin only.

export const maxDuration = 60

type Submission = { operation: string; target_id: string | null; payload: Record<string, unknown>; note: string | null; status: string }

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
    const supabase = getAdminClient()
    // What each list's read filed before, whatever became of it.
    const filedBy = async (name: string): Promise<Submission[]> => {
      const { data, error } = await supabase
        .from('submission')
        .select('operation,target_id,payload,note,status')
        .eq('community_id', slug)
        .eq('submitted_by->>name', name)
      if (error) throw new Error(error.message)
      return (data ?? []) as Submission[]
    }
    const [{ watches, available }, listingRows, keystoneFiled, mekorFiled, { findings, decided }] = await Promise.all([
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
      listCategories(slug).then((categories) => jobFindings(slug, 'kosher', categories)),
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
    const withFindings = places.map((p) => {
      const own = take((f) => f.targetId === p.id)
      return { ...p, href: routes.listing(slug, p.category, listingSlug(p)), findings: own, waiting: own.length, decided: decided.get(p.id) ?? null }
    })
    const newWithFindings = newPlaces.map((n) => ({ ...n, findings: take((f) => f.operation === 'create' && baseName(f.name) === baseName(n.name)) }))
    const others = findings.filter((f) => !placed.has(f.id))
    const counts = kosherCounts(withFindings, newPlaces, lists.filter((l) => l.error).length)

    return Response.json({
      ok: true,
      available,
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
