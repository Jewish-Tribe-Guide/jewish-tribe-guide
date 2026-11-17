import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { JOB_READS, type JobKey } from '@/lib/watchJobReads'

/** fetchJobs for unit tests: each job read from its own route, as the
 *  server's combined route does, so a test answers the routes it means
 *  (`/api/admin/watches/runs`) whatever it mocks: fetchJson or fetch. */
export async function fetchJobs(token: string, community: string, keys: readonly JobKey[]): Promise<Partial<Record<JobKey, unknown>>> {
  const answers = await Promise.all(
    keys.map(async (key) => [key, await fetchJson<unknown>(withCommunity(JOB_READS[key], community), { headers: { Authorization: `Bearer ${token}` } }, '').catch(() => null)] as const),
  )
  return Object.fromEntries(answers)
}
