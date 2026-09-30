import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { listCategories } from '@/lib/categoryStore'
import { describeReading } from '@/lib/readingSearch'
import { forgetReading, listReadings, setReadingApproved } from '@/lib/questionReadingStore'

// GET  /api/admin/read-questions — the "Read questions" tab: every question
//      the AI reader has read (question_reading, migration 062), most asked
//      first, each with its reading in words. Admin only.
// POST /api/admin/read-questions   body: { key, action: 'approve' | 'unapprove' | 'forget' }
//      Approve a reading as a rule (used with no AI at all, see
//      /api/ask/read), take the approval back, or forget it so the question
//      is read afresh next time.
//
// The questions are what visitors typed. Only the words, a count and when
// are kept, never who asked; the tab is for admins alone.

export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const [{ readings, available }, categories] = await Promise.all([listReadings(community.slug), listCategories(community.slug)])
    return Response.json({
      ok: true,
      available,
      readings: readings.map((r) => ({
        key: r.key,
        question: r.question,
        labels: describeReading(r.reading, categories),
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

export async function POST(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  let body: { key?: unknown; action?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })
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
