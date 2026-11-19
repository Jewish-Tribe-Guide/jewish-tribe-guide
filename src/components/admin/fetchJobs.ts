import type { AdminApi } from '@/lib/adminApi'
import type { JobKey } from '@/lib/watchJobReads'

/** Every job asked for, in one request: what each one's route answered, or
 *  null/missing when it failed. All of them when `keys` is every job.
 *  (Unit tests answer this from each job's own route: vitest.setup.ts.) */
export async function fetchJobs(api: AdminApi, keys: readonly JobKey[], all: boolean): Promise<Partial<Record<JobKey, unknown>>> {
  const only = all ? '' : `?only=${keys.join(',')}`
  return api.get<{ jobs?: Partial<Record<JobKey, unknown>> }>(`/api/admin/watches/jobs${only}`, '')
    .then((d) => d.jobs ?? {})
    .catch(() => ({}))
}
