// GET|POST /api/cron/walk-routes
//
// Works out the walks "Within a walk" along the streets, with
// OpenRouteService (walkRouteRun.ts), and keeps them (migration 080). Meant
// to run nightly (vercel.json): the first runs work out every walk, later
// ones only those to a new listing or one that moved, usually none.
//
// Needs OPENROUTESERVICE_API_KEY (a free key from openrouteservice.org).
// Without it, or without migration 080, it does nothing and says why; the
// site shows its straight-line estimates either way.
//
// Auth: as sync-hours (cronAuth.ts).

import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cronAuth'
import { listCommunities } from '@/lib/communityStore'
import { listCategories } from '@/lib/categoryStore'
import { listApprovedResources } from '@/lib/resourceStore'
import { saveWalkRoutes, walkRoutesOf } from '@/lib/walkRouteStore'
import { askOpenRouteService, workOutWalks, type WalkRouteResult } from '@/lib/walkRouteRun'

export const maxDuration = 60

/** Requests one run makes at most, across communities: one a listing,
 *  inside the minute the other jobs here have, at one every 1.6 seconds.
 *  A community with more hotels and hospitals than that is worked out over
 *  a few nights; after that, a night asks only for what's new. */
const BUDGET = 20

async function runAll(): Promise<NextResponse> {
  const key = process.env.OPENROUTESERVICE_API_KEY
  if (!key) return NextResponse.json({ ok: true, skipped: 'OPENROUTESERVICE_API_KEY is not set' })

  let budget = BUDGET
  const results: Record<string, WalkRouteResult> = {}
  for (const community of await listCommunities()) {
    const { routes, available } = await walkRoutesOf(community.slug)
    if (!available) return NextResponse.json({ ok: true, skipped: 'migration 080 (walk_route) has not been run' })
    const result = await workOutWalks({
      categories: await listCategories(community.slug),
      listings: (category) => listApprovedResources(community.slug, { category }),
      stored: routes,
      save: (fromId, walks) => saveWalkRoutes(community.slug, fromId, walks),
      ask: (body) => askOpenRouteService(key, body),
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      budget,
    })
    budget -= result.asked
    results[community.slug] = result
  }
  return NextResponse.json({ ok: true, results })
}

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  return runAll()
}

export async function POST(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  return runAll()
}
