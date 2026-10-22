import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { listEruvimForAdmin } from '@/lib/eruvStore'
import { addWatch, listWatches } from '@/lib/watchStore'
import { runAndRecord } from '@/lib/watchRunner'
import { getAdminClient } from '@/lib/supabase/admin'
import { ERUV_WEBSITE_CREATOR, ERUV_WEBSITE_WATCH_NAME, eruvWebsiteUrl, eruvWebsiteWatchChanges, isEruvWebsiteWatch } from '@/lib/eruvWebsite'
import type { EruvFinding, EruvJobLoaded } from '@/lib/eruvJob'
import type { EruvSuggestion } from '@/lib/eruvSuggestion'

// GET /api/admin/watches/eruv — the Watches tab's Eruv status page (Oct 22,
//     eruvJob.ts): every eruv, what its website says waiting for Use this
//     (eruvWebsiteRun.ts), and its website's watch. Admin only. What it
//     changes goes through the routes every page uses: the eruv's own
//     (/api/admin/eruvim), its watch's (/api/admin/watches), and Use this,
//     Edit and Keep the listing (/api/admin/submissions/:id).
//
// POST /api/admin/watches/eruv  body: { action: 'read', id }
//     Read them now: reads the eruv's website, giving it its watch first
//     when the daily run hasn't yet (syncEruvWebsiteWatches does the same).
//     A paused one isn't read.

export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  if (!(await getAdminUserForCommunity(request, community.slug))) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })
  try {
    const [{ eruvim, available }, { watches }, pending] = await Promise.all([
      listEruvimForAdmin(community.slug),
      listWatches(community.slug),
      getAdminClient()
        .from('submission')
        .select('id, created_at, payload')
        .eq('community_id', community.slug)
        .eq('status', 'pending')
        .eq('target_type', 'eruv')
        .eq('submitted_by->>name', ERUV_WEBSITE_WATCH_NAME),
    ])
    if (pending.error) throw new Error(pending.error.message)
    const findings: EruvFinding[] = ((pending.data ?? []) as { id: string; created_at: string; payload: Partial<EruvSuggestion> }[]).map((s) => ({
      id: s.id,
      eruvId: s.payload?.eruvId ?? '',
      at: s.created_at,
      hotline: s.payload?.hotline ?? null,
      alertsUrl: s.payload?.alertsUrl ?? null,
    }))
    const body: EruvJobLoaded = { available, timezone: community.timezone, eruvim, findings, watches: watches.filter(isEruvWebsiteWatch) }
    return Response.json({ ok: true, ...body })
  } catch (err) {
    console.error('[admin/watches/eruv] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the eruvim.'] }, { status: 502 })
  }
}

export async function POST(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  if (!(await getAdminUserForCommunity(request, community.slug))) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { action?: unknown; id?: unknown } | null
  const bad = (msg: string) => Response.json({ ok: false, errors: [msg] }, { status: 400 })
  if (body?.action !== 'read' || typeof body.id !== 'string') return bad('Unknown action.')
  try {
    const [{ eruvim }, { watches }] = await Promise.all([listEruvimForAdmin(community.slug), listWatches(community.slug)])
    const eruv = eruvim.find((e) => e.id === body.id)
    if (!eruv) return bad('No such eruv.')
    const url = eruvWebsiteUrl(eruv.website)
    if (!url) return bad('It has no website in the guide.')
    let watch = watches.find((w) => isEruvWebsiteWatch(w) && w.url === url) ?? null
    if (!watch) {
      const [add] = eruvWebsiteWatchChanges([eruv], watches).add
      if (!add) return bad('Another watch already reads its website.')
      watch = await addWatch(community.slug, { kind: 'website', url: add.url, resourceId: null, label: add.label, createdBy: ERUV_WEBSITE_CREATOR })
      if (!watch) throw new Error('The watch wasn’t added.')
    }
    if (!watch.active) return Response.json({ ok: true, watch })
    const { watch: read } = await runAndRecord(watch)
    return Response.json({ ok: true, watch: read })
  } catch (err) {
    console.error('[admin/watches/eruv] POST failed:', err)
    return Response.json({ ok: false, errors: ['Could not read its website.'] }, { status: 502 })
  }
}
