import type { NextRequest } from 'next/server'
import { adminWrite, unchanged } from '@/lib/adminRoute'
import { updateFormResponse, deleteFormResponse } from '@/lib/formResponseStore'
import type { ContactHospitalData } from '@/types'

type PatchBody = {
  contact?: ContactHospitalData
  data?: Record<string, unknown>
  /** Done in To do. */
  status?: 'handled'
}

// Mirrors GET's own scope (see this file's GET and formResponseStore.ts's
// listFormResponses doc comment): Feedback plus any custom admin-created form.
// Support/Volunteer/Volunteer-changes rows are /inbox's domain, not admin's —
// out of scope here even by id, same as they're never fetched by GET.
function adminResponseScope(community: string) {
  return { requestTypes: ['Feedback'], anyFormId: true, community }
}

// PATCH /api/admin/responses/:id — correct a response's contact info and/or
// submitted data. Admin only. Mirrors /api/inbox/:id exactly, gated by the
// admin allowlist instead of the inbox one.
export const PATCH = adminWrite(async (request: NextRequest, { community }, ctx: RouteContext<'/api/admin/responses/[id]'>) => {
  const { id } = await ctx.params

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }

  if (body.status !== undefined && body.status !== 'handled') {
    return Response.json({ ok: false, errors: ['Invalid status.'] }, { status: 400 })
  }

  try {
    const response = await updateFormResponse(id, body, adminResponseScope(community.slug))
    if (!response) return Response.json({ ok: false, errors: ['Request not found.'] }, { status: 404 })
    // The public site caches this content; the wrapper drops it so the edit
    // shows up. Marking it done changes nothing a visitor sees.
    const res = Response.json({ ok: true, response })
    return body.contact !== undefined || body.data !== undefined ? res : unchanged(res)
  } catch (err) {
    console.error('[admin/responses/:id] PATCH failed:', err)
    return Response.json({ ok: false, errors: ['Could not update the request.'] }, { status: 502 })
  }
})

// DELETE /api/admin/responses/:id — permanently remove a response. Admin only.
export const DELETE = adminWrite(async (_request: NextRequest, { community }, ctx: RouteContext<'/api/admin/responses/[id]'>) => {
  const { id } = await ctx.params
  try {
    const deleted = await deleteFormResponse(id, adminResponseScope(community.slug))
    if (!deleted) return Response.json({ ok: false, errors: ['Request not found.'] }, { status: 404 })
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[admin/responses/:id] DELETE failed:', err)
    return Response.json({ ok: false, errors: ['Could not delete the request.'] }, { status: 502 })
  }
})
