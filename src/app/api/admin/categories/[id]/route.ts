import type { NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/adminAuth'
import { updateCategory, deleteCategory } from '@/lib/categoryStore'
import type { CategoryCapabilities, CategoryField } from '@/lib/categories'

type PatchBody = {
  label?: string
  pluralLabel?: string
  icon?: string
  description?: string
  sortOrder?: number
  fields?: CategoryField[]
  upvotesEnabled?: boolean
  capabilities?: Partial<CategoryCapabilities>
}

// PATCH /api/admin/categories/:id — edit a category's presentation, fields, and
// capabilities. Only the provided keys change; the slug (id) is immutable.
// Admin only.
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/admin/categories/[id]'>) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const { id } = await ctx.params

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }

  if (body.label !== undefined && !body.label.trim()) {
    return Response.json({ ok: false, errors: ['Category name cannot be empty.'] }, { status: 400 })
  }

  try {
    const category = await updateCategory(id, body)
    if (!category) {
      return Response.json({ ok: false, errors: ['Category not found.'] }, { status: 404 })
    }
    return Response.json({ ok: true, category })
  } catch (err) {
    console.error('[admin/categories/:id] PATCH failed:', err)
    return Response.json({ ok: false, errors: ['Could not update category.'] }, { status: 502 })
  }
}

// DELETE /api/admin/categories/:id — permanently remove a category and all of
// its listings. Admin only.
export async function DELETE(request: NextRequest, ctx: RouteContext<'/api/admin/categories/[id]'>) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const { id } = await ctx.params
  try {
    const { listings } = await deleteCategory(id)
    return Response.json({ ok: true, listings })
  } catch (err) {
    console.error('[admin/categories/:id] DELETE failed:', err)
    return Response.json({ ok: false, errors: ['Could not delete category.'] }, { status: 502 })
  }
}
