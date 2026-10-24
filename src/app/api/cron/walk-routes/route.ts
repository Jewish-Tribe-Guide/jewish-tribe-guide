// GET|POST /api/cron/walk-routes
//
// Works out the walks "Within a walk" along the streets, with
// OpenRouteService, and keeps them (walkRouteJob.ts). Meant to run nightly
// (vercel.json), for what an admin's save didn't get to: the first runs work
// out every walk, later ones usually nothing.
//
// Needs OPENROUTESERVICE_API_KEY (a free key from openrouteservice.org).
// Without it, or without the walk_route table
// (supabase/migrations/20240101000080_walk_route.sql), it does nothing and
// says why; the site shows its straight-line estimates either way.
//
// Each run is recorded for the Watches tab (jobRunStore.ts).
//
// Auth: as sync-hours (cronAuth.ts).

import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cronAuth'
import { runWalkRoutes } from '@/lib/walkRouteJob'
import { recordJobRun } from '@/lib/jobRunStore'
import { walkRoutesOutcome } from '@/lib/jobRuns'

export const maxDuration = 60

/** Requests one run makes at most, across communities: one a listing,
 *  inside the minute the other jobs here have, at one every 1.6 seconds.
 *  More than that is worked out over a few runs. */
const BUDGET = 20

async function runAll(): Promise<NextResponse> {
  return NextResponse.json(await recordJobRun('walk-routes', () => runWalkRoutes({ budget: BUDGET }), walkRoutesOutcome))
}

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  return runAll()
}

export async function POST(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  return runAll()
}
