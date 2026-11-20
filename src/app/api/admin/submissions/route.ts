import { adminRead } from '@/lib/adminRoute'
import { listSubmissionsByStatus } from '@/lib/submissionStore'
import type { SubmissionStatus } from '@/types'

/** How many decided changes History shows at a time (Nov 20). */
const HISTORY_PAGE = 50

const VALID_STATUSES: SubmissionStatus[] = ['pending', 'approved', 'rejected']

// GET /api/admin/submissions?status=pending|approved|rejected — changes in
// that status, most-recently-acted-on first. Defaults to 'pending' (the
// moderation queue's own call never passes one). Admin only.
//
// Approved and rejected come HISTORY_PAGE at a time, `more` saying whether
// there are older; `before=<reviewed_at>&beforeId=<id>` (the last one
// shown) asks for the next. Pending is the queue, always whole.
export const GET = adminRead(async (request: Request, { community }) => {
  const requested = new URL(request.url).searchParams.get('status') ?? 'pending'
  if (!VALID_STATUSES.includes(requested as SubmissionStatus)) {
    return Response.json(
      { ok: false, errors: ["status must be 'pending', 'approved', or 'rejected'."] },
      { status: 400 },
    )
  }

  const status = requested as SubmissionStatus
  const params = new URL(request.url).searchParams
  const at = params.get('before')
  const id = params.get('beforeId')
  // Both or neither, and only what a decided change's own could be: they
  // go into the query's filter.
  if ((at || id) && !(at && id && !Number.isNaN(Date.parse(at)) && /^[0-9a-f-]{36}$/i.test(id) && /^[0-9T:.+\-Z ]+$/.test(at))) {
    return Response.json({ ok: false, errors: ['before and beforeId must be a decided change’s time and id.'] }, { status: 400 })
  }

  try {
    if (status === 'pending') return Response.json({ ok: true, submissions: await listSubmissionsByStatus(community.slug, status) })
    const page = await listSubmissionsByStatus(community.slug, status, { limit: HISTORY_PAGE + 1, before: at && id ? { at, id } : undefined })
    return Response.json({ ok: true, submissions: page.slice(0, HISTORY_PAGE), more: page.length > HISTORY_PAGE })
  } catch (err) {
    console.error('[admin/submissions] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load submissions.'] }, { status: 502 })
  }
})
