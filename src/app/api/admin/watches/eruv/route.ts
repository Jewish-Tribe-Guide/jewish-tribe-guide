import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { listEruvimForAdmin } from '@/lib/eruvStore'
import { listWatches } from '@/lib/watchStore'
import { getAdminClient } from '@/lib/supabase/admin'
import { ERUV_WEBSITE_WATCH_NAME, isEruvWebsiteWatch } from '@/lib/eruvWebsite'
import type { EruvFinding, EruvJobLoaded } from '@/lib/eruvJob'
import type { EruvSuggestion } from '@/lib/eruvSuggestion'

// GET /api/admin/watches/eruv — the Watches tab's Eruv status page (Oct 22,
//     eruvJob.ts): every eruv, what its website says waiting for Use this
//     (eruvWebsiteRun.ts), and its website's watch. Admin only. What it
//     changes goes through the routes every page uses: the eruv's own
//     (/api/admin/eruvim), its watch's (/api/admin/watches), and Use this,
//     Edit and Keep the listing (/api/admin/submissions/:id).

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
