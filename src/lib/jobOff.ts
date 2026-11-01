import type { NightKindId } from './jobRuns'
import type { Watch } from './watches'

// A job turned off for one community (the user, Oct 31): kept as a watch
// that's never read, as "No hours online" is (hoursJob.ts), so it needs no
// new column. Turning it back on removes the row. Each run leaves out what
// a community turned off, so off means nothing is read and nothing is paid.

export const JOB_OFF_CREATOR = 'job off'

export const jobOffUrl = (kind: NightKindId) => `https://guide.invalid/job-off/${kind}`
export const isJobOff = (w: Pick<Watch, 'createdBy'>) => w.createdBy === JOB_OFF_CREATOR

const kindOf = (w: Pick<Watch, 'url'>) => w.url.split('/').pop() as NightKindId

/** What this community's watches turn off. */
export function jobsOff(watches: readonly Pick<Watch, 'createdBy' | 'url'>[]): NightKindId[] {
  return watches.filter(isJobOff).map(kindOf)
}

/** Across communities, for a nightly run. */
export function jobsOffByCommunity(watches: readonly Pick<Watch, 'createdBy' | 'url' | 'communityId'>[]): Map<string, Set<NightKindId>> {
  const off = new Map<string, Set<NightKindId>>()
  for (const w of watches) {
    if (!isJobOff(w)) continue
    off.set(w.communityId, (off.get(w.communityId) ?? new Set()).add(kindOf(w)))
  }
  return off
}
