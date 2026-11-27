import { getAdminClient } from './supabase/admin'
import type { SentMessage } from './sentMessageStore'
import type { UpdateStatus } from './yourUpdates'

// Where each of a phone's sent updates stands, for "Your updates" on You
// (Nov 27, board S4c). Server side of yourUpdates.ts.

export type SubmissionState = {
  id: string
  status: 'pending' | 'approved' | 'rejected' | 'archived'
  reviewed_at: string | null
  target_type: string
  target_id: string | null
}

/** The suggestions themselves, only what the status needs: nothing a
 *  stranger holding an id could learn more from than "live or not". */
export async function getSubmissionStates(community: string, ids: string[]): Promise<SubmissionState[]> {
  if (ids.length === 0) return []
  const { data, error } = await getAdminClient().from('submission').select('id, status, reviewed_at, target_type, target_id').eq('community_id', community).in('id', ids)
  if (error) throw new Error(`Failed to load the updates: ${error.message}`)
  return (data ?? []) as SubmissionState[]
}

/** One suggestion: live once approved, waiting while pending, otherwise
 *  not changed. `hrefOf` says where a live one is, when it still is. */
export function submissionStatus(s: SubmissionState, hrefOf: (s: SubmissionState) => string | null): UpdateStatus {
  if (s.status === 'approved') return { state: 'live', href: hrefOf(s), at: s.reviewed_at ?? '' }
  if (s.status === 'pending') return { state: 'waiting' }
  return { state: 'not_changed' }
}

/** A post sent as it is: waiting until it's read and an admin has decided
 *  what it was read into; then live if any of that went on the site (the
 *  newest), otherwise not changed. */
export function messageStatus(m: Pick<SentMessage, 'status' | 'submissionIds'>, filed: ReadonlyMap<string, UpdateStatus>): UpdateStatus {
  if (m.status === 'reading') return { state: 'waiting' }
  const parts = m.submissionIds.map((id) => filed.get(id)).filter((x): x is UpdateStatus => !!x)
  const live = parts.filter((p): p is Extract<UpdateStatus, { state: 'live' }> => p.state === 'live').sort((a, b) => b.at.localeCompare(a.at))
  if (live.length) return live[0]
  // Still with an admin: a part waiting, or what the read left for them.
  if (parts.some((p) => p.state === 'waiting') || m.status === 'left') return { state: 'waiting' }
  return { state: 'not_changed' }
}
