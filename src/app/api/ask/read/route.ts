import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { listCategories } from '@/lib/categoryStore'
import { listApprovedResources } from '@/lib/resourceStore'
import { enforceRateLimit, sharedLimit } from '@/lib/rateLimit'
import { questionKey, readerPlaces, readerVocabulary } from '@/lib/questionReader'
import { findReading, saveReading } from '@/lib/questionReadingStore'
import { DEFAULT_READER_MODEL, readQuestion } from '@/lib/readQuestion'

// POST /api/ask/read { question } → { ok: true, reading } | { ok: false, reason }
//
// The question reader (questionReader.ts): an AI turns what someone typed
// into the site's own filters, and the site's search answers from them. A
// question already read is answered from memory (question_reading), free.
//
// Every way this can't read a question is an ordinary answer, not an error
// status: the page then answers with today's search alone, as it always has.
//   off    no OPENAI_API_KEY here (every e2e run, a preview without it)
//   busy   this visitor, or everyone together today, has asked enough
//   failed the AI didn't answer in time, or at all
//
// Limits, so the bill can't run away: 20 new readings per visitor per ten
// minutes, 1,500 a day for everyone (at about $0.04 per 1,000, well under a
// dollar), and the OpenAI account's own monthly cap on top.

const MAX_QUESTION = 200
const TIMEOUT_MS = 6000

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { question?: unknown } | null
  const question = typeof body?.question === 'string' ? body.question.trim() : ''
  if (question.length < 2 || question.length > MAX_QUESTION) {
    return Response.json({ ok: false, errors: ['A question between 2 and 200 characters.'] }, { status: 400 })
  }
  const apiKey = process.env.OPENAI_API_KEY
  // QUESTION_READER=off: every test server sets it (playwright configs), so
  // no test run spends on OpenAI or writes a reading.
  if (!apiKey || process.env.QUESTION_READER === 'off') return Response.json({ ok: false, reason: 'off' })

  try {
    const community = await resolveCommunity(communitySlugFromRequest(request))
    const key = questionKey(question)
    const remembered = await findReading(community.slug, key)
    if (remembered) return Response.json({ ok: true, reading: remembered, remembered: true })

    const limited = await enforceRateLimit(request, 'question-reader', { limit: 20, windowSec: 600 })
    if (limited) return Response.json({ ok: false, reason: 'busy' })
    const today = await sharedLimit('question-reader-day', { limit: 1500, windowSec: 86_400 })
    if (!today.ok) return Response.json({ ok: false, reason: 'busy' })

    const [categories, listings] = await Promise.all([listCategories(community.slug), listApprovedResources(community.slug)])
    const places = readerPlaces(listings, community.slug)
    const vocab = readerVocabulary(categories, listings, [...new Set([...places.keys()])])
    const model = process.env.READER_MODEL || DEFAULT_READER_MODEL
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const { reading } = await readQuestion(question, vocab, {
        apiKey,
        model,
        fetchImpl: (url, init) => fetch(url, { ...init, signal: controller.signal }),
      })
      await saveReading(community.slug, key, question, reading, model)
      return Response.json({ ok: true, reading, remembered: false })
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    console.error('[question-reader] failed:', err instanceof Error ? err.message : err)
    return Response.json({ ok: false, reason: 'failed' })
  }
}
