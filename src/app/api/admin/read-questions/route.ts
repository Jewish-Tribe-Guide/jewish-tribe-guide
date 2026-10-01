import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { listCategories } from '@/lib/categoryStore'
import { listApprovedResources } from '@/lib/resourceStore'
import { neighborhoodsFor } from '@/lib/places'
import { searchAsk } from '@/lib/askSearch'
import { askWordKey, askWordLabel, proposeWords, type TaughtWord } from '@/lib/askWords'
import { listTaughtWords, teachWord, unteachWord } from '@/lib/askWordStore'
import { revalidatePublicContent } from '@/lib/revalidateContent'
import { describeReading } from '@/lib/readingSearch'
import { forgetReading, listReadings, setReadingApproved } from '@/lib/questionReadingStore'

// GET  /api/admin/read-questions — the "Read questions" tab: every question
//      the AI reader has read (question_reading, migration 062), most asked
//      first, each with its reading in words. Admin only.
//      With each, the words it suggests teaching the search (askWords.ts),
//      and every word taught so far.
// POST /api/admin/read-questions   body: { key, action: 'approve' | 'unapprove' | 'forget' }
//      Approve a reading as a rule (used with no AI at all, see
//      /api/ask/read), take the approval back, or forget it so the question
//      is read afresh next time.
// POST /api/admin/read-questions   body: { action: 'teach', word: { word, categoryId, field?, value? }, question? }
//                                       { action: 'unteach', word: 'ikc' }
//      Teach the search a word (question_word, migration 063), or untaught
//      it. Both change what every search box reads, so the cached
//      categories they come with are thrown away.
//
// The questions are what visitors typed. Only the words, a count and when
// are kept, never who asked; the tab is for admins alone.

export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const [{ readings, available }, cached, listings, taught] = await Promise.all([
      listReadings(community.slug),
      listCategories(community.slug),
      listApprovedResources(community.slug),
      listTaughtWords(community.slug),
    ])
    // The words as they are this moment, not as the cached categories last
    // had them: a word just taught isn't proposed again.
    const categories = cached.map((c) => {
      const own = taught.words.filter((w) => w.categoryId === c.id).map(({ word, field, value }) => ({ word, field, value }))
      return { ...c, askWords: own }
    })
    const places = neighborhoodsFor(community.slug)
    // What our own search makes of each question now, taught words and
    // all: the words it still leaves over are what's worth teaching.
    const proposals = (question: string, reading: (typeof readings)[number]['reading']) => {
      const ours = searchAsk(listings, categories, question, { places })
      return proposeWords(ours.terms, reading, categories, ours.categoryIds)
    }
    return Response.json({
      ok: true,
      available,
      wordsAvailable: taught.available,
      words: taught.words.map((w) => ({ ...w, label: askWordLabel(w, categories) ?? 'something the guide no longer has' })),
      readings: readings.map((r) => ({
        key: r.key,
        question: r.question,
        labels: describeReading(r.reading, categories),
        proposals: taught.available ? proposals(r.question, r.reading) : [],
        hits: r.hits,
        model: r.model,
        lastUsedAt: r.lastUsedAt,
        approvedAt: r.approvedAt,
        approvedBy: r.approvedBy,
      })),
    })
  } catch (err) {
    console.error('[admin/read-questions] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load read questions.'] }, { status: 502 })
  }
}

const ACTIONS = ['approve', 'unapprove', 'forget'] as const

/** A word to teach, checked against the categories: one that exists, and
 *  a filter its page offers, with a pick it has. Null when it isn't. */
function wordToTeach(raw: unknown, categories: Awaited<ReturnType<typeof listCategories>>): TaughtWord | null {
  if (!raw || typeof raw !== 'object') return null
  const w = raw as Record<string, unknown>
  const word = typeof w.word === 'string' ? askWordKey(w.word) : ''
  if (!word || word.length > 60 || word.split(' ').length > 3) return null
  const category = categories.find((c) => c.id === w.categoryId)
  if (!category) return null
  if (w.field === undefined) return { word, categoryId: category.id }
  const field = category.detailFields.find((f) => f.key === w.field && f.filterable)
  if (field?.type === 'boolean' && w.value === undefined) return { word, categoryId: category.id, field: field.key }
  if (field?.type === 'select' && typeof w.value === 'string' && w.value && w.value.length <= 100) {
    return { word, categoryId: category.id, field: field.key, value: w.value }
  }
  return null
}

export async function POST(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  let body: { key?: unknown; action?: unknown; word?: unknown; question?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })
  }

  if (body.action === 'teach' || body.action === 'unteach') {
    try {
      if (body.action === 'teach') {
        const word = wordToTeach(body.word, await listCategories(community.slug))
        if (!word) return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })
        const question = typeof body.question === 'string' ? body.question.slice(0, 200) : null
        await teachWord(community.slug, word, admin.email, question)
      } else {
        const word = typeof body.word === 'string' ? askWordKey(body.word) : ''
        if (!word) return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })
        await unteachWord(community.slug, word)
      }
      await revalidatePublicContent()
      return Response.json({ ok: true })
    } catch (err) {
      console.error('[admin/read-questions] teach failed:', err)
      return Response.json({ ok: false, errors: ['Could not save. If this keeps happening, migration 063 may not be applied yet.'] }, { status: 502 })
    }
  }
  const key = typeof body.key === 'string' ? body.key.trim() : ''
  const action = ACTIONS.find((a) => a === body.action)
  if (!key || key.length > 200 || !action) return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })

  try {
    if (action === 'forget') await forgetReading(community.slug, key)
    else await setReadingApproved(community.slug, key, action === 'approve' ? admin.email : null)
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[admin/read-questions] POST failed:', err)
    return Response.json({ ok: false, errors: ['Could not save. If this keeps happening, migration 062 may not be applied yet.'] }, { status: 502 })
  }
}
