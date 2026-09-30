import { getAdminClient } from './supabase/admin'
import type { Reading } from './questionReader'

// The question reader's memory (question_reading, migration 062): a question
// read once is answered from here after, instantly and at no cost. Missing
// table (the migration not run yet) is not an error: the reader just reads
// afresh, as it did before this existed.

let warned = false
function tableMissing(message: string | undefined): boolean {
  const missing = !!message && /question_reading/.test(message) && /(does not exist|schema cache)/.test(message)
  if (missing && !warned) {
    warned = true
    console.warn('[question-reader] no question_reading table (migration 062): reading every question afresh')
  }
  return missing
}

export async function findReading(community: string, key: string): Promise<Reading | null> {
  const { data, error } = await getAdminClient().from('question_reading').select('reading, hits').eq('community_id', community).eq('key', key).maybeSingle()
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
  return data.reading as Reading
}

export async function saveReading(community: string, key: string, question: string, reading: Reading, model: string): Promise<void> {
  const { error } = await getAdminClient()
    .from('question_reading')
    .upsert({ community_id: community, key, question, reading, model }, { onConflict: 'community_id,key' })
  if (error && !tableMissing(error.message)) console.error('[question-reader] save failed:', error.message)
}
