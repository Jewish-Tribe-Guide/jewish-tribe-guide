import type { NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/adminAuth'
import { saveDraft, deleteForm } from '@/lib/formStore'
import type { FormStep } from '@/lib/forms'

type PatchBody = {
  title?: string
  submitLabel?: string
  successTitle?: string
  successMessage?: string
  steps?: FormStep[]
}

// PATCH /api/admin/forms/:id — save a full draft copy of the form's title,
// wizard chrome text, and steps. Never touches the published content the live
// wizard reads — see /publish to promote a draft. Admin only.
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/admin/forms/[id]'>) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const { id } = await ctx.params

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }

  if (!body.title?.trim()) {
    return Response.json({ ok: false, errors: ['Form title cannot be empty.'] }, { status: 400 })
  }
  if (!Array.isArray(body.steps) || body.steps.length === 0) {
    return Response.json({ ok: false, errors: ['A form needs at least one step.'] }, { status: 400 })
  }

  try {
    const form = await saveDraft(id, {
      title: body.title,
      submitLabel: body.submitLabel || 'Submit',
      successTitle: body.successTitle || 'All set',
      successMessage: body.successMessage || '',
      steps: body.steps,
    })
    if (!form) return Response.json({ ok: false, errors: ['Form not found.'] }, { status: 404 })
    return Response.json({ ok: true, form })
  } catch (err) {
    console.error('[admin/forms/:id] PATCH failed:', err)
    return Response.json({ ok: false, errors: ['Could not save draft.'] }, { status: 502 })
  }
}

// DELETE /api/admin/forms/:id — permanently delete a form and every response
// to it. Blocked for 'support'/'volunteer' (see deleteForm — they're wired
// directly into the home screen and their own wizard components). Admin
// only. To discard a pending draft instead (leaving the form itself intact),
// see DELETE /api/admin/forms/:id/draft.
export async function DELETE(request: NextRequest, ctx: RouteContext<'/api/admin/forms/[id]'>) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const { id } = await ctx.params
  try {
    const { responses } = await deleteForm(id)
    return Response.json({ ok: true, responses })
  } catch (err) {
    console.error('[admin/forms/:id] DELETE failed:', err)
    const message = err instanceof Error ? err.message : 'Could not delete form.'
    return Response.json({ ok: false, errors: [message] }, { status: 502 })
  }
}
