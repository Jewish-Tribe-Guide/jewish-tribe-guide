import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { listJobRuns } from '@/lib/jobRunStore'
import { NIGHTLY_JOBS } from '@/lib/jobRuns'

// GET /api/admin/watches/runs — the Watches tab's Nightly runs (Oct 24):
//     each nightly job, how it works, and its latest runs, newest first
//     (jobRunStore.ts). The jobs run for the whole site, so every
//     community's admin sees the same runs. `available` is false before
//     migration 086.

export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })
  try {
    const { available, runs } = await listJobRuns()
    return Response.json({ ok: true, available, jobs: NIGHTLY_JOBS.map((j) => ({ ...j, runs: runs[j.id] })) })
  } catch (err) {
    console.error('[admin/watches/runs] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the nightly runs.'] }, { status: 502 })
  }
}
