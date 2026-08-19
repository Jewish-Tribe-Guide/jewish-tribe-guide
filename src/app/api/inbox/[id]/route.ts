import type { NextRequest } from 'next/server'
import { getInboxViewer } from '@/lib/inboxAuth'
import { updateFormResponse, deleteFormResponse } from '@/lib/formResponseStore'
import { INBOX_TAB_REQUEST_TYPES } from '@/lib/inbox'
import type { ContactHospitalData } from '@/types'

type PatchBody = {
  contact?: ContactHospitalData
  data?: Record<string, unknown>
}

// Mirrors GET's own allowlist (see this route's GET, api/inbox/route.ts) —
// Feedback and any custom-form response are /admin's domain, not inbox's, out
// of scope here even by id.
const INBOX_RESPONSE_SCOPE = { requestTypes: Object.values(INBOX_TAB_REQUEST_TYPES).flat() }

// PATCH /api/inbox/:id — correct a response's contact info and/or submitted
// data. Inbox-viewer only (INBOX_EMAILS).
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/inbox/[id]'>) {
  const viewer = await getInboxViewer(request)
  if (!viewer) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const { id } = await ctx.params

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }

  try {
    const response = await updateFormResponse(id, body, INBOX_RESPONSE_SCOPE)
    if (!response) return Response.json({ ok: false, errors: ['Request not found.'] }, { status: 404 })
    return Response.json({ ok: true, response })
  } catch (err) {
    console.error('[inbox/:id] PATCH failed:', err)
    return Response.json({ ok: false, errors: ['Could not update the request.'] }, { status: 502 })
  }
}

// DELETE /api/inbox/:id — permanently remove a response. Inbox-viewer only.
export async function DELETE(request: NextRequest, ctx: RouteContext<'/api/inbox/[id]'>) {
  const viewer = await getInboxViewer(request)
  if (!viewer) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const { id } = await ctx.params
  try {
    const deleted = await deleteFormResponse(id, INBOX_RESPONSE_SCOPE)
    if (!deleted) return Response.json({ ok: false, errors: ['Request not found.'] }, { status: 404 })
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[inbox/:id] DELETE failed:', err)
    return Response.json({ ok: false, errors: ['Could not delete the request.'] }, { status: 502 })
  }
}
