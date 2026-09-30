import { readerMessages, tidyReading, type Reading, type ReaderVocabulary } from './questionReader'

// ── The call to the AI that reads a question (see questionReader.ts) ─────────
// Server-side only: the key never reaches a browser. OpenAI's cheapest model
// by default (decided Sep 30, GPT-6 Luna), with the model a setting so
// another can be tried. Whatever comes back goes through tidyReading, so a
// reading can only ever hold what the site has.

export const DEFAULT_READER_MODEL = 'gpt-6-luna'
/** How much the model thinks first. "none" answers in about a second, where
 *  its default took two to three (measured Sep 30); see the comparison for
 *  what it costs in accuracy. */
export const DEFAULT_READER_EFFORT = 'none'

export type ReadResult = {
  reading: Reading
  /** What the model said, before tidying: for seeing what it got wrong. */
  raw: unknown
  ms: number
  usage: { input: number; cachedInput: number; output: number }
}

export async function readQuestion(
  question: string,
  vocab: ReaderVocabulary,
  {
    apiKey,
    model = DEFAULT_READER_MODEL,
    effort = DEFAULT_READER_EFFORT,
    fetchImpl = fetch,
  }: { apiKey: string; model?: string; effort?: string | null; fetchImpl?: typeof fetch },
): Promise<ReadResult> {
  const started = Date.now()
  const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: readerMessages(question, vocab),
      response_format: { type: 'json_object' },
      ...(effort ? { reasoning_effort: effort } : {}),
    }),
  })
  const body = (await res.json()) as {
    error?: { message?: string }
    choices?: { message?: { content?: string } }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } }
  }
  if (!res.ok) throw new Error(`Question reader: ${res.status} ${body.error?.message ?? ''}`.trim())
  let raw: unknown = null
  try {
    raw = JSON.parse(body.choices?.[0]?.message?.content ?? 'null')
  } catch {
    raw = null
  }
  return {
    reading: tidyReading(raw, vocab),
    raw,
    ms: Date.now() - started,
    usage: {
      input: body.usage?.prompt_tokens ?? 0,
      cachedInput: body.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      output: body.usage?.completion_tokens ?? 0,
    },
  }
}
