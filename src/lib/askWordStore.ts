import { getAdminClient } from './supabase/admin'
import type { CategoryConfig } from './categories'
import type { TaughtWord } from './askWords'

// The words an admin has taught the search (question_word, migration 063;
// see askWords.ts). Read with the categories (listCategories, cached under
// TAGS.askWords), and listed, taught and untaught on the admin's Read
// questions tab. Missing table (the migration not run yet) is not an
// error: the search just knows no taught words, as before.

let warned = false
function tableMissing(message: string | undefined): boolean {
  const missing = !!message && /question_word/.test(message) && /(does not exist|schema cache)/.test(message)
  if (missing && !warned) {
    warned = true
    console.warn('[ask-words] no question_word table (migration 063): no taught words')
  }
  return missing
}

export type StoredWord = TaughtWord & { fromQuestion: string | null; taughtBy: string; taughtAt: string }

type Row = {
  word: string
  category_id: string
  field_key: string | null
  value: string | null
  from_question: string | null
  taught_by: string
  taught_at: string
}

function toWord(r: Row): StoredWord {
  return {
    word: r.word,
    categoryId: r.category_id,
    ...(r.field_key ? { field: r.field_key } : {}),
    ...(r.field_key && r.value !== null ? { value: r.value } : {}),
    fromQuestion: r.from_question,
    taughtBy: r.taught_by,
    taughtAt: r.taught_at,
  }
}

/** Every taught word, newest first. `available` is false without
 *  migration 063: the tab then says so instead of failing. */
export async function listTaughtWords(community: string): Promise<{ words: StoredWord[]; available: boolean }> {
  const { data, error } = await getAdminClient()
    .from('question_word')
    .select('word, category_id, field_key, value, from_question, taught_by, taught_at')
    .eq('community_id', community)
    .order('taught_at', { ascending: false })
  if (error) {
    if (!tableMissing(error.message)) throw new Error(`Failed to load taught words: ${error.message}`)
    return { words: [], available: false }
  }
  return { words: (data as Row[]).map(toWord), available: true }
}

/** The categories with their taught words on them. A failed read leaves
 *  the categories as they are: the search then reads those words as text,
 *  as it did before any were taught, rather than not working. */
export async function withAskWords(community: string, categories: CategoryConfig[]): Promise<CategoryConfig[]> {
  let words: StoredWord[]
  try {
    words = (await listTaughtWords(community)).words
  } catch (err) {
    console.error('[ask-words]', err)
    return categories
  }
  if (words.length === 0) return categories
  return categories.map((c) => {
    const own = words.filter((w) => w.categoryId === c.id).map(({ word, field, value }) => ({ word, ...(field ? { field } : {}), ...(value !== undefined ? { value } : {}) }))
    return own.length ? { ...c, askWords: own } : c
  })
}

/** Teach a word, by whom, from which question. A word means one thing:
 *  teaching it again replaces what it meant. */
export async function teachWord(community: string, word: TaughtWord, taughtBy: string, fromQuestion: string | null): Promise<void> {
  const { error } = await getAdminClient()
    .from('question_word')
    .upsert(
      {
        community_id: community,
        word: word.word,
        category_id: word.categoryId,
        field_key: word.field ?? null,
        value: word.field ? (word.value ?? null) : null,
        from_question: fromQuestion,
        taught_by: taughtBy,
        taught_at: new Date().toISOString(),
      },
      { onConflict: 'community_id,word' },
    )
  if (error) throw new Error(error.message)
}

/** Untaught: the search reads the word as text again. */
export async function unteachWord(community: string, word: string): Promise<void> {
  const { error } = await getAdminClient().from('question_word').delete().eq('community_id', community).eq('word', word)
  if (error) throw new Error(error.message)
}
