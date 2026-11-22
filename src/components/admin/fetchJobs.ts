import { onAdminWrite, type AdminApi } from '@/lib/adminApi'
import type { JobKey } from '@/lib/watchJobReads'

// The same jobs asked for again while a read of them is under way share
// it: one Places load read every job twice, once for its list and once for
// the nav's To do count (item 74, Nov 22). A save in the community ends the
// sharing, so a read after it never gets an answer from before it.
const inFlight = new Map<string, Promise<Partial<Record<JobKey, unknown>>>>()
onAdminWrite((community) => {
  for (const key of inFlight.keys()) if (key.startsWith(`${community}|`)) inFlight.delete(key)
})

/** Every job asked for, in one request: what each one's route answered, or
 *  null/missing when it failed. All of them when `keys` is every job.
 *  (Unit tests answer this from each job's own route: vitest.setup.ts.) */
export function fetchJobs(api: AdminApi, keys: readonly JobKey[], all: boolean): Promise<Partial<Record<JobKey, unknown>>> {
  const only = all ? '' : `?only=${keys.join(',')}`
  const key = `${api.community}|${api.token}|${only}`
  const shared = inFlight.get(key)
  if (shared) return shared
  const read = api.get<{ jobs?: Partial<Record<JobKey, unknown>> }>(`/api/admin/watches/jobs${only}`, '')
    .then((d) => d.jobs ?? {})
    .catch(() => ({}))
    .finally(() => {
      if (inFlight.get(key) === read) inFlight.delete(key)
    })
  inFlight.set(key, read)
  return read
}
