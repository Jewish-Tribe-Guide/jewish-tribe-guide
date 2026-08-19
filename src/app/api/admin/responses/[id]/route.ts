import { revalidatePublicContent } from '@/lib/revalidateContent'
import type { NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/adminAuth'
import { updateFormResponse, deleteFormResponse } from '@/lib/formResponseStore'
import type { ContactHospitalData } from '@/types'

type PatchBody = {
  contact?: ContactHospitalData
  data?: Record<string, unknown>
}

// Mirrors GET's own scope (see this file's GET and formResponseStore.ts's
// listFormResponses doc comment): Feedback plus any custom admin-created form.
// Support/Volunteer/Volunteer-changes rows are /inbox's domain, not admin's —
// out of scope here even by id, same as they're never fetched by GET.
const ADMIN_RESPONSE_SCOPE = { requestTypes: ['Feedback'], anyFormId: true }

// PATCH /api/admin/responses/:id — correct a response's contact info and/or
// submitted data. Admin only. Mirrors /api/inbox/:id exactly, gated by the
// admin allowlist instead of the inbox one.
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/admin/responses/[id]'>) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const { id } = await ctx.params

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }

  try {
    const response = await updateFormResponse(id, body, ADMIN_RESPONSE_SCOPE)
    if (!response) return Response.json({ ok: false, errors: ['Request not found.'] }, { status: 404 })
    // The public site caches this content; drop it so the edit shows up.
    await revalidatePublicContent()
    return Response.json({ ok: true, response })
  } catch (err) {
    console.error('[admin/responses/:id] PATCH failed:', err)
    return Response.json({ ok: false, errors: ['Could not update the request.'] }, { status: 502 })
  }
}

// DELETE /api/admin/responses/:id — permanently remove a response. Admin only.
export async function DELETE(request: NextRequest, ctx: RouteContext<'/api/admin/responses/[id]'>) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const { id } = await ctx.params
  try {
    const deleted = await deleteFormResponse(id, ADMIN_RESPONSE_SCOPE)
    if (!deleted) return Response.json({ ok: false, errors: ['Request not found.'] }, { status: 404 })
    // The public site caches this content; drop it so the edit shows up.
    await revalidatePublicContent()
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[admin/responses/:id] DELETE failed:', err)
    return Response.json({ ok: false, errors: ['Could not delete the request.'] }, { status: 502 })
  }
}
