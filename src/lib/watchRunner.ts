import { KEYSTONE_LIST_URL } from './keystoneWatch'
import { runKeystoneWatch } from './keystoneRun'
import { readWebsite } from './websiteWatch'
import { updateWatch } from './watchStore'
import { afterRun, type Watch, type WatchOutcome } from './watches'

// Runs a watch and records how it went (watches.ts has the rules). Shared by
// the daily cron and the admin tab's "Check now". Server-only.

/** Philadelphia's Keystone-K watch ran from code alone before migration 070
 *  gave watches a table. Until that migration is run, the cron still runs
 *  it, with nothing recorded. */
export const BUILT_IN_WATCHES: Pick<Watch, 'communityId' | 'kind' | 'url'>[] = [
  { communityId: 'philly', kind: 'keystone_list', url: KEYSTONE_LIST_URL },
]

export async function runWatch(watch: Pick<Watch, 'communityId' | 'kind' | 'url'>): Promise<WatchOutcome> {
  try {
    if (watch.kind === 'keystone_list') {
      const run = await runKeystoneWatch(watch.communityId, watch.url)
      return run.ok ? { ok: true, filed: run.filed } : { ok: false, error: run.error }
    }
    return await readWebsite(watch.url)
  } catch (err) {
    // One broken watch must never stop the others, or go unrecorded.
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Runs it and saves the result. `alert` says whether this run broke a
 *  working watch or mended a broken one: the only times to email. */
export async function runAndRecord(watch: Watch, now = new Date().toISOString()) {
  const outcome = await runWatch(watch)
  const { update, alert } = afterRun(watch, outcome, now)
  await updateWatch(watch.communityId, watch.id, update)
  return { outcome, alert, watch: { ...watch, ...update } as Watch }
}
