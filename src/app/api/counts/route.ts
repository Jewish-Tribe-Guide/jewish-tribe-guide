import { getAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit } from '@/lib/rateLimit'
import { listCommunities } from '@/lib/communityStore'
import { dayInTimezone, normalizeSearchMiss } from '@/lib/activity'

// POST /api/counts   body: { community, kind: 'listing_view' | 'search_miss', key }
// Adds one to today's count: a listing opened, or a search that found
// nothing. Totals only: no token, no IP, nothing about who. Sent with
// navigator.sendBeacon from lib/countEvent.ts, so it never delays the page.
//
// Groundwork for the week-later "41 people have looked at Joy Cafe" email and
// the admin's list of searches that found nothing; nothing reads it yet.
// A made-up listing id or community is dropped by bump_daily_count itself.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'counts', { limit: 60, windowSec: 60 })
  if (limited) return limited

  let body: { community?: unknown; kind?: unknown; key?: unknown }
  try {
    body = JSON.parse(await request.text())
  } catch {
    return Response.json({ ok: false }, { status: 400 })
  }

  const kind = body.kind
  let key: string | null = null
  if (kind === 'listing_view') key = typeof body.key === 'string' && UUID.test(body.key) ? body.key.toLowerCase() : null
  else if (kind === 'search_miss') key = normalizeSearchMiss(body.key)
  if (!key) return Response.json({ ok: false }, { status: 400 })

  const community = (await listCommunities()).find((c) => c.slug === body.community)
  if (!community) return Response.json({ ok: false }, { status: 400 })

  const { error } = await getAdminClient().rpc('bump_daily_count', {
    p_community: community.slug,
    p_kind: kind,
    p_key: key,
    p_day: dayInTimezone(community.timezone, new Date()),
  })
  if (error) {
    console.error('[counts] bump failed:', error)
    return Response.json({ ok: false }, { status: 502 })
  }
  return new Response(null, { status: 204 })
}
