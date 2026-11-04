import type { Watch } from './watches'
import { isMekorList } from './mekorWatch'
import { isKclList } from './kclWatch'

/** A certifier's list: Keystone-K's, Mekor Habracha's or KCL's. One test
 *  for every place that sorts the watches, since three copies of it named
 *  only the first two, and KCL's list (added Nov 4) went under "Other" on
 *  Watches and was counted with the plain websites (the user, Nov 4). */
export function isKosherListWatch(w: Pick<Watch, 'kind' | 'url'>): boolean {
  return w.kind === 'keystone_list' || isMekorList(w.url) || isKclList(w.url)
}
