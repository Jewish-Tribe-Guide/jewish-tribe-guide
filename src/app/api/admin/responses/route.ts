import { reportServerError } from '@/lib/serverError'
import { adminRead } from '@/lib/adminRoute'
import { listFormResponses, listNewAdminResponses } from '@/lib/formResponseStore'
import { listFormsForAdmin } from '@/lib/formStore'
import { responseSummary } from '@/lib/todo'

// GET /api/admin/responses?formId=X — a custom form's responses, or
// GET /api/admin/responses?feedback=1 — Feedback submissions. Backs the
// /admin Responses tab (see ResponsesManager.tsx). Admin only (per-community
// admin_email) — a separate allowlist from /inbox's INBOX_EMAILS. Support/
// Volunteer/Volunteer changes never show up here — those are /inbox's
// domain, not admin's (see /api/inbox's explicit requestTypes allowlist).
// GET /api/admin/responses?new=1 — those not yet handled, as To do lists
// them: the form's title, their first words, and when.
export const GET = adminRead(async (request: Request, { community }) => {
  const { searchParams } = new URL(request.url)
  const formId = searchParams.get('formId')
  const feedback = searchParams.get('feedback')

  if (searchParams.get('new')) {
    try {
      const [responses, forms] = await Promise.all([listNewAdminResponses(community.slug), listFormsForAdmin(community.slug)])
      const titles = new Map(forms.map((f) => [f.id, f.title]))
      return Response.json({ ok: true, responses: responses.map((r) => responseSummary(r, titles)) })
    } catch (err) {
      reportServerError('[admin/responses] GET new failed:', err)
      return Response.json({ ok: false, errors: ['Could not load responses.'] }, { status: 502 })
    }
  }

  if (!formId && !feedback) {
    return Response.json({ ok: false, errors: ['formId or feedback is required.'] }, { status: 400 })
  }

  try {
    const responses = await listFormResponses(
      feedback ? { requestTypes: ['Feedback'] } : { formId: formId! },
      community.slug,
    )
    return Response.json({ ok: true, responses })
  } catch (err) {
    reportServerError('[admin/responses] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load responses.'] }, { status: 502 })
  }
})
