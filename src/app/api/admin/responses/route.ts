import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { listFormResponses } from '@/lib/formResponseStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// GET /api/admin/responses?formId=X — a custom form's responses, or
// GET /api/admin/responses?feedback=1 — Feedback submissions. Backs the
// /admin Responses tab (see ResponsesManager.tsx). Admin only (per-community
// admin_email) — a separate allowlist from /inbox's INBOX_EMAILS. Support/
// Volunteer/Volunteer changes never show up here — those are /inbox's
// domain, not admin's (see /api/inbox's explicit requestTypes allowlist).
export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const formId = searchParams.get('formId')
  const feedback = searchParams.get('feedback')

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
    console.error('[admin/responses] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load responses.'] }, { status: 502 })
  }
}
