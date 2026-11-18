import type { AdminApi } from '@/lib/adminApi'
import { JOB_READS, type JobKey } from '@/lib/watchJobReads'

/** fetchJobs for unit tests: each job read from its own route, as the
 *  server's combined route does, so a test answers the routes it means
 *  (`/api/admin/watches/runs`) whatever it mocks: fetchJson or fetch. */
export async function fetchJobs(api: AdminApi, keys: readonly JobKey[]): Promise<Partial<Record<JobKey, unknown>>> {
  const answers = await Promise.all(
    keys.map(async (key) => [key, await api.get<unknown>(JOB_READS[key], '').catch(() => null)] as const),
  )
  return Object.fromEntries(answers)
}
