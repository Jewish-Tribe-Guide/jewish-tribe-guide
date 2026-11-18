import { adminWrite } from '@/lib/adminRoute'
import type { NextRequest } from 'next/server'
import { updateHomeSection, deleteHomeSection } from '@/lib/homeSectionStore'

type PatchBody = {
  title?: string
  cardIds?: string[]
  sortOrder?: number
  sharesRow?: boolean
}

// PATCH /api/admin/home-sections/:id — rename a section, change its card
// membership/order, or move it (sortOrder). Only the provided keys change.
// Admin only.
export const PATCH = adminWrite(async (request: NextRequest, { community }, ctx: RouteContext<'/api/admin/home-sections/[id]'>) => {
  const { id } = await ctx.params

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }

  if (body.title !== undefined && !body.title.trim()) {
    return Response.json({ ok: false, errors: ['Section title cannot be empty.'] }, { status: 400 })
  }
  if (body.sharesRow !== undefined && typeof body.sharesRow !== 'boolean') {
    return Response.json({ ok: false, errors: ['Invalid row.'] }, { status: 400 })
  }

  try {
    const section = await updateHomeSection(community.slug, id, body)
    if (!section) {
      return Response.json({ ok: false, errors: ['Section not found.'] }, { status: 404 })
    }
    return Response.json({ ok: true, section })
  } catch (err) {
    console.error('[admin/home-sections/:id] PATCH failed:', err)
    return Response.json({ ok: false, errors: ['Could not update section.'] }, { status: 502 })
  }
})

// DELETE /api/admin/home-sections/:id — permanently remove a section. The
// cards that were in it aren't deleted anywhere else — they just fall into
// the home page's trailing "More" section until reassigned. Admin only.
export const DELETE = adminWrite(async (request: NextRequest, { community }, ctx: RouteContext<'/api/admin/home-sections/[id]'>) => {
  const { id } = await ctx.params
  try {
    await deleteHomeSection(community.slug, id)
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[admin/home-sections/:id] DELETE failed:', err)
    return Response.json({ ok: false, errors: ['Could not delete section.'] }, { status: 502 })
  }
})
