import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import type { JobKey } from '@/lib/watchJobReads'

/** Every job asked for, in one request: what each one's route answered, or
 *  null/missing when it failed. All of them when `keys` is every job.
 *  (Unit tests answer this from each job's own route: vitest.setup.ts.) */
export async function fetchJobs(token: string, community: string, keys: readonly JobKey[], all: boolean): Promise<Partial<Record<JobKey, unknown>>> {
  const only = all ? '' : `?only=${keys.join(',')}`
  return fetchJson<{ jobs?: Partial<Record<JobKey, unknown>> }>(withCommunity(`/api/admin/watches/jobs${only}`, community), { headers: { Authorization: `Bearer ${token}` } }, '')
    .then((d) => d.jobs ?? {})
    .catch(() => ({}))
}
