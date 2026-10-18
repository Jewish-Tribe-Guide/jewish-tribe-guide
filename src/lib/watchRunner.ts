import { KEYSTONE_LIST_URL } from './keystoneWatch'
import { runKeystoneWatch } from './keystoneRun'
import { readWebsite } from './websiteWatch'
import { refuahHospitalId } from './refuahWatch'
import { runRefuahWatch } from './refuahRun'
import { runMenuWatch, type MenuReadBudget } from './menuWatchRun'
import { updateWatch } from './watchStore'
import { afterRun, MENU_WATCH_CREATOR, type Watch, type WatchOutcome } from './watches'

// Runs a watch and records how it went (watches.ts has the rules). Shared by
// the daily cron and the admin tab's "Check now". Server-only.

/** Philadelphia's Keystone-K watch ran from code alone before migration 070
 *  gave watches a table. Until that migration is run, the cron still runs
 *  it, with nothing recorded. */
export const BUILT_IN_WATCHES: Pick<Watch, 'communityId' | 'kind' | 'url'>[] = [
  { communityId: 'philly', kind: 'keystone_list', url: KEYSTONE_LIST_URL },
]

export async function runWatch(
  watch: Pick<Watch, 'communityId' | 'kind' | 'url'> & Partial<Pick<Watch, 'resourceId' | 'createdBy' | 'pageHash'>>,
  budget?: MenuReadBudget,
): Promise<WatchOutcome> {
  try {
    if (watch.kind === 'keystone_list') {
      const run = await runKeystoneWatch(watch.communityId, watch.url)
      return run.ok ? { ok: true, filed: run.filed } : { ok: false, error: run.error }
    }
    // A hospital's page on Refuah builds itself in the browser, so it's read
    // from the data it's built from, and compared with the hospital's
    // listing (refuahWatch.ts).
    if (refuahHospitalId(watch.url)) return await runRefuahWatch(watch.communityId, watch.url, watch.resourceId ?? null)
    // A food place's menu, read by the AI only when it changed (menuWatch.ts).
    if (watch.createdBy === MENU_WATCH_CREATOR) {
      return await runMenuWatch({ communityId: watch.communityId, url: watch.url, resourceId: watch.resourceId ?? null, pageHash: watch.pageHash ?? null }, budget)
    }
    return await readWebsite(watch.url)
  } catch (err) {
    // One broken watch must never stop the others, or go unrecorded.
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Runs it and saves the result. `alert` says whether this run broke a
 *  working watch or mended a broken one: the only times to email. */
export async function runAndRecord(watch: Watch, now = new Date().toISOString(), budget?: MenuReadBudget) {
  const outcome = await runWatch(watch, budget)
  const { update, alert } = afterRun(watch, outcome, now)
  await updateWatch(watch.communityId, watch.id, update)
  return { outcome, alert, watch: { ...watch, ...update } as Watch }
}
