import { KEYSTONE_LIST_URL } from './keystoneWatch'
import { runKeystoneWatch } from './keystoneRun'
import { isMekorList } from './mekorWatch'
import { runMekorWatch } from './mekorRun'
import { readWebsite } from './websiteWatch'
import { refuahHospitalId } from './refuahWatch'
import { runRefuahWatch } from './refuahRun'
import { runMenuWatch, type MenuReadBudget } from './menuWatchRun'
import { isListingPageWatch } from './listingPageWatch'
import { runListingPageWatch } from './listingPageRun'
import { updateWatch } from './watchStore'
import { afterRun, listCheck, MENU_WATCH_CREATOR, withoutListRead, type Watch, type WatchOutcome } from './watches'
import { isNewsletterWatch, quietError } from './newsletter'
import { isEruvWebsiteWatch } from './eruvWebsite'
import { runEruvWebsiteWatch } from './eruvWebsiteRun'

// Runs a watch and records how it went (watches.ts has the rules). Shared by
// the daily cron and the admin tab's "Check now". Server-only.

/** Philadelphia's Keystone-K watch ran from code alone before migration 070
 *  gave watches a table. Until that migration is run, the cron still runs
 *  it, with nothing recorded. */
export const BUILT_IN_WATCHES: Pick<Watch, 'communityId' | 'kind' | 'url'>[] = [
  { communityId: 'philly', kind: 'keystone_list', url: KEYSTONE_LIST_URL },
]

export async function runWatch(
  watch: Pick<Watch, 'communityId' | 'kind' | 'url'> & Partial<Pick<Watch, 'resourceId' | 'createdBy' | 'pageHash' | 'pageChangedAt' | 'createdAt' | 'lastFiled' | 'lastCheck'>>,
  budget?: MenuReadBudget,
  now = Date.now(),
  { full = false }: { full?: boolean } = {},
): Promise<WatchOutcome> {
  try {
    // A shul's newsletter comes to the guide (newsletter.ts): nothing to
    // fetch, only whether it has gone quiet. What the last one filed stays.
    if (isNewsletterWatch({ createdBy: watch.createdBy ?? null, url: watch.url })) {
      const error = quietError(watch.pageChangedAt ?? null, watch.createdAt ?? new Date(now).toISOString(), now)
      return error ? { ok: false, error } : { ok: true, filed: watch.lastFiled ?? 0 }
    }
    if (watch.kind === 'keystone_list') {
      const run = await runKeystoneWatch(watch.communityId, watch.url)
      return run.ok ? { ok: true, filed: run.filed, check: { ...listCheck(run), listRead: run.listRead } } : { ok: false, error: run.error }
    }
    // Mekor Habracha's kosher list, read place by place like Keystone-K's
    // (mekorWatch.ts). A website watch: no migration gave it a kind.
    if (isMekorList(watch.url)) {
      const run = await runMekorWatch(watch.communityId, watch.url)
      return run.ok ? { ok: true, filed: run.filed, check: { ...listCheck(run), listRead: run.listRead } } : { ok: false, error: run.error }
    }
    // A hospital's page on Refuah builds itself in the browser, so it's read
    // from the data it's built from, and compared with the hospital's
    // listing (refuahWatch.ts).
    if (refuahHospitalId(watch.url)) return await runRefuahWatch(watch.communityId, watch.url, watch.resourceId ?? null, watch.lastCheck)
    // An eruv's website, for its hotline and email alerts (eruvWebsite.ts).
    if (isEruvWebsiteWatch({ createdBy: watch.createdBy ?? null })) return await runEruvWebsiteWatch(watch.communityId, watch.url)
    // A food place's menu, read by the AI only when it changed (menuWatch.ts).
    if (watch.createdBy === MENU_WATCH_CREATOR) {
      return await runMenuWatch({ communityId: watch.communityId, url: watch.url, resourceId: watch.resourceId ?? null, pageHash: watch.pageHash ?? null }, budget, { full })
    }
    // A shul's or mikvah's own page, read by the AI for its times or hours
    // only when it changed (listingPageWatch.ts). Shares the run's AI reads.
    if (isListingPageWatch({ createdBy: watch.createdBy ?? null })) {
      return await runListingPageWatch({ communityId: watch.communityId, url: watch.url, resourceId: watch.resourceId ?? null, pageHash: watch.pageHash ?? null, createdBy: watch.createdBy ?? null, lastCheck: watch.lastCheck ?? null }, budget, { full })
    }
    return await readWebsite(watch.url)
  } catch (err) {
    // One broken watch must never stop the others, or go unrecorded.
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Runs it and saves the result. `alert` says whether this run broke a
 *  working watch or mended a broken one: the only times to email. `full`
 *  is the admin's "Check now": a page or menu is read by the AI whether or
 *  not it changed, and what it read is kept on the watch. */
export async function runAndRecord(watch: Watch, now = new Date().toISOString(), budget?: MenuReadBudget, { full = false }: { full?: boolean } = {}) {
  const outcome = await runWatch(watch, budget, undefined, { full })
  const { update, alert } = afterRun(watch, outcome, now)
  await updateWatch(watch.communityId, watch.id, update)
  const recorded = { ...watch, ...update } as Watch
  return { outcome, alert, watch: { ...recorded, lastCheck: withoutListRead(recorded.lastCheck) } }
}
