import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { getCategoryById } from '@/lib/categoryStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { readEruvPage } from '@/lib/eruvReader'
import { isMekorList } from '@/lib/mekorWatch'
import { kosherLookup, readEmailNow, readEruvEmailNow, readMenuNow, readPageNow, readRefuahNow, readSiteNow, type ReadNowDraft } from '@/lib/readNow'
import { enforceRateLimit } from '@/lib/rateLimit'
import { getListReads, listWatches } from '@/lib/watchStore'
import { normalizeWatchUrl } from '@/lib/watches'
import type { KeystoneEntry } from '@/lib/keystoneWatch'
import type { MekorEntry } from '@/lib/mekorWatch'

// POST /api/admin/read-now — a place being added, read while it's added (boards
// *13). Body: { category, slot, url?, draft }; slot is page, email, site, menu,
// refuah, eruv, eruv-email or kosher. Answers with what to fill in, and saves nothing (readNow.ts).

export const maxDuration = 60

/** As the job pages' Check now: each is pages and an AI read. */
const LIMIT = { limit: 20, windowSec: 600 }

function readDraft(raw: unknown): ReadNowDraft | null {
  const d = raw as Partial<ReadNowDraft> | null
  if (!d || typeof d.name !== 'string' || !d.details || typeof d.details !== 'object') return null
  const c = d.coords
  return {
    name: d.name,
    address: typeof d.address === 'string' ? d.address : '',
    phone: typeof d.phone === 'string' ? d.phone : '',
    details: d.details,
    coords: c && Number.isFinite(c.lat) && Number.isFinite(c.lng) ? { lat: c.lat, lng: c.lng } : null,
  }
}

export async function POST(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { category?: unknown; slot?: unknown; url?: unknown; draft?: unknown } | null
  if (body?.slot === 'eruv') {
    // An eruv's status page: it has no category or listing to fill in.
    const limited = await enforceRateLimit(request, 'admin-watch-check', LIMIT)
    if (limited) return limited
    const url = typeof body.url === 'string' ? normalizeWatchUrl(body.url) : null
    if (!url) return Response.json({ ok: false, errors: ['That isn’t a web address.'] }, { status: 400 })
    const read = await readEruvPage(url, new Date())
    return Response.json({ ok: true, ...(read.ok ? { state: 'done', status: read.status, words: read.words } : { state: 'failed' }) })
  }
  if (body?.slot === 'eruv-email') {
    const limited = await enforceRateLimit(request, 'admin-watch-check', LIMIT)
    if (limited) return limited
    if (typeof body.url !== 'string' || !body.url.includes('@')) return Response.json({ ok: false, errors: ['That isn’t an email address.'] }, { status: 400 })
    return Response.json({ ok: true, ...(await readEruvEmailNow(community.slug, body.url.trim(), community.timezone)) })
  }
  const draft = readDraft(body?.draft)
  const category = typeof body?.category === 'string' ? await getCategoryById(community.slug, body.category) : null
  if (!draft || !category) return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })
  const url = typeof body?.url === 'string' && body.url.trim() ? body.url.trim() : null
  try {
    if (body?.slot === 'kosher') {
      // Their last read: nothing outside is asked.
      const [{ watches }, reads] = await Promise.all([listWatches(community.slug), getListReads(community.slug)])
      const kept = (w: { id: string } | undefined) => (w ? (reads.get(w.id)?.entries ?? null) : null)
      const keystone = kept(watches.find((w) => w.active && w.kind === 'keystone_list')) as KeystoneEntry[] | null
      const mekor = kept(watches.find((w) => w.active && isMekorList(w.url))) as MekorEntry[] | null
      return Response.json({ ok: true, kosher: kosherLookup(category, draft, { keystone, mekor }) })
    }
    const limited = await enforceRateLimit(request, 'admin-watch-check', LIMIT)
    if (limited) return limited
    const apiKey = process.env.OPENAI_API_KEY
    const needsAi = body?.slot === 'page' || body?.slot === 'menu'
    if (needsAi && !apiKey) return Response.json({ ok: false, errors: ['The AI reader isn’t set up here (no OPENAI_API_KEY).'] }, { status: 503 })
    if (body?.slot === 'page') return Response.json({ ok: true, ...(await readPageNow(category, draft, url, { apiKey: apiKey!, communityName: community.name })) })
    if (body?.slot === 'menu') return Response.json({ ok: true, ...(await readMenuNow(category, draft, url, apiKey!)) })
    if (body?.slot === 'email') {
      if (!url?.includes('@')) return Response.json({ ok: false, errors: ['That isn’t an email address.'] }, { status: 400 })
      if (!apiKey) return Response.json({ ok: false, errors: ['The AI reader isn’t set up here (no OPENAI_API_KEY).'] }, { status: 503 })
      return Response.json({ ok: true, ...(await readEmailNow(community.slug, category, draft, url, { apiKey, communityName: community.name })) })
    }
    if (body?.slot === 'site') return Response.json({ ok: true, ...(await readSiteNow(category, draft)) })
    if (body?.slot === 'refuah') return Response.json({ ok: true, ...(await readRefuahNow(category, draft, url)) })
    return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })
  } catch (err) {
    console.error('[admin/read-now] failed:', err)
    return Response.json({ ok: true, state: 'failed' })
  }
}
