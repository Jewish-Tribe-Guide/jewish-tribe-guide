import { getAdminClient } from './supabase/admin'
import { schemaMissing } from './supabase/schemaMissing'

// How long each "+ Add" box read took (message_read_time, migration 117).
// Only the time and what the model was asked: no post text, no photo, no
// visitor. Written after the answer has gone (the read route's after()),
// so keeping it never adds to the wait. A missing table (the migration not
// run yet) is said once (schemaMissing) and otherwise ignored.

export type MessageReadTime = {
  community: string
  ms: number
  modelMs: number | null
  model: string | null
  effort: string | null
  photos: number
  proposals: number
  followUps: number
  usage: { input: number; cachedInput: number; output: number } | null
}

/** The row as stored. */
export function messageReadTimeRow(t: MessageReadTime) {
  const n = (v: number) => Math.max(0, Math.round(v))
  return {
    community_id: t.community,
    ms: n(t.ms),
    model_ms: t.modelMs == null ? null : n(t.modelMs),
    model: t.model,
    effort: t.effort,
    photos: n(t.photos),
    proposals: n(t.proposals),
    follow_ups: n(t.followUps),
    input_tokens: t.usage ? n(t.usage.input) : null,
    cached_tokens: t.usage ? n(t.usage.cachedInput) : null,
    output_tokens: t.usage ? n(t.usage.output) : null,
  }
}

export async function saveMessageReadTime(t: MessageReadTime): Promise<void> {
  const { error } = await getAdminClient().from('message_read_time').insert(messageReadTimeRow(t))
  if (error && !schemaMissing('message_read_time', error.message)) console.error('[message/read] time not kept:', error.message)
}
