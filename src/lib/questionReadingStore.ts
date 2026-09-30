import { getAdminClient } from './supabase/admin'
import type { Reading } from './questionReader'

// The question reader's memory (question_reading, migration 062): a question
// read once is answered from here after, instantly and at no cost. Missing
// table (the migration not run yet) is not an error: the reader just reads
// afresh, as it did before this existed.
//
// And the admin's "Read questions" tab: every reading, most asked first,
// each approvable as a rule (used with no AI at all) or forgotten (read
// afresh next time). Uncached, like the missed searches: an admin screen.

let warned = false
function tableMissing(message: string | undefined): boolean {
  const missing = !!message && /question_reading/.test(message) && /(does not exist|schema cache)/.test(message)
  if (missing && !warned) {
    warned = true
    console.warn('[question-reader] no question_reading table (migration 062): reading every question afresh')
  }
  return missing
}

/** A remembered reading, and whether a person approved it. */
export async function findReading(community: string, key: string): Promise<{ reading: Reading; approved: boolean } | null> {
  const { data, error } = await getAdminClient()
    .from('question_reading')
    .select('reading, hits, approved_at')
    .eq('community_id', community)
    .eq('key', key)
    .maybeSingle()
  if (error) {
    if (!tableMissing(error.message)) console.error('[question-reader] lookup failed:', error.message)
    return null
  }
  if (!data) return null
  // Counted, for the admin's list of what people ask most. Not awaited.
  void getAdminClient()
    .from('question_reading')
    .update({ hits: (data.hits as number) + 1, last_used_at: new Date().toISOString() })
    .eq('community_id', community)
    .eq('key', key)
    .then(({ error: e }) => e && console.error('[question-reader] hit count failed:', e.message))
  return { reading: data.reading as Reading, approved: !!data.approved_at }
}

export async function saveReading(community: string, key: string, question: string, reading: Reading, model: string): Promise<void> {
  const { error } = await getAdminClient()
    .from('question_reading')
    .upsert({ community_id: community, key, question, reading, model }, { onConflict: 'community_id,key' })
  if (error && !tableMissing(error.message)) console.error('[question-reader] save failed:', error.message)
}

export type StoredReading = {
  key: string
  question: string
  reading: Reading
  model: string
  hits: number
  createdAt: string
  lastUsedAt: string
  approvedAt: string | null
  approvedBy: string | null
}

/** The most asked first, at most `limit`. `available` is false without
 *  migration 062: the tab then says so instead of failing. */
export async function listReadings(community: string, limit = 300): Promise<{ readings: StoredReading[]; available: boolean }> {
  const { data, error } = await getAdminClient()
    .from('question_reading')
    .select('key, question, reading, model, hits, created_at, last_used_at, approved_at, approved_by')
    .eq('community_id', community)
    .order('hits', { ascending: false })
    .order('last_used_at', { ascending: false })
    .limit(limit)
  if (error) {
    if (!tableMissing(error.message)) throw new Error(`Failed to load read questions: ${error.message}`)
    return { readings: [], available: false }
  }
  return {
    available: true,
    readings: (data as Record<string, unknown>[]).map((r) => ({
      key: r.key as string,
      question: r.question as string,
      reading: r.reading as Reading,
      model: r.model as string,
      hits: r.hits as number,
      createdAt: r.created_at as string,
      lastUsedAt: r.last_used_at as string,
      approvedAt: (r.approved_at as string | null) ?? null,
      approvedBy: (r.approved_by as string | null) ?? null,
    })),
  }
}

/** Approve a reading as a rule, by whom, or take the approval back. */
export async function setReadingApproved(community: string, key: string, approvedBy: string | null): Promise<void> {
  const { error } = await getAdminClient()
    .from('question_reading')
    .update(approvedBy ? { approved_at: new Date().toISOString(), approved_by: approvedBy } : { approved_at: null, approved_by: null })
    .eq('community_id', community)
    .eq('key', key)
  if (error) throw new Error(error.message)
}

/** Forget a reading: the question is read afresh the next time it's asked. */
export async function forgetReading(community: string, key: string): Promise<void> {
  const { error } = await getAdminClient().from('question_reading').delete().eq('community_id', community).eq('key', key)
  if (error) throw new Error(error.message)
}
