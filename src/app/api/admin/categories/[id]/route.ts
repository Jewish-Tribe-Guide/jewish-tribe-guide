import { revalidatePublicContent } from '@/lib/revalidateContent'
import type { NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/adminAuth'
import { updateCategory, deleteCategory } from '@/lib/categoryStore'
import { clearCategoryFieldData, applyFieldOptionRenames } from '@/lib/resourceStore'
import { isHttpUrl } from '@/lib/validation'
import type { CategoryCapabilities, CategoryField } from '@/lib/categories'
import { isValidPinColor } from '@/lib/categoryColor'
import { adminCommunityFromRequest } from '@/lib/adminCommunity'

type PatchBody = {
  label?: string
  pluralLabel?: string
  icon?: string
  description?: string
  sortOrder?: number
  fields?: CategoryField[]
  hasAddress?: boolean
  hasPhone?: boolean
  upvotesEnabled?: boolean
  capabilities?: Partial<CategoryCapabilities>
  externalLink?: { label: string; url: string } | null
  cardImageUrl?: string | null
  cardTextColor?: string | null
  pinColor?: string | null
  iconImageUrl?: string | null
  /** Map category only (kind === 'map') — see CategoryConfig's own doc. */
  mapZoomRadiusMiles?: number | null
  /** Whether this category shows on the public site — see CategoryConfig's
   *  own doc. */
  active?: boolean
  /** When address/phone is being turned off or a field removed on a category
   *  that already has listings, the editor confirms with the admin (via
   *  field-usage) before including this — it wipes that data from every
   *  listing in the category, right after the category itself is saved. */
  clearFields?: { address?: boolean; phone?: boolean; keys?: string[] }
  /** When the editor detects an option rename (see option-usage), the admin
   *  confirms against its counts before this is included — cascades the old
   *  value to the new one on every listing that had it selected, right after
   *  the category itself is saved. */
  applyOptionRenames?: { fieldKey: string; oldValue: string; newValue: string }[]
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
  if (body.externalLink && !isHttpUrl(body.externalLink.url)) {
    return Response.json({ ok: false, errors: ['The external link must be a valid http(s) URL.'] }, { status: 400 })
  }
  if (body.cardImageUrl && !isHttpUrl(body.cardImageUrl)) {
    return Response.json({ ok: false, errors: ['The card image must be a valid http(s) URL.'] }, { status: 400 })
  }
  if (
    body.mapZoomRadiusMiles !== undefined &&
    body.mapZoomRadiusMiles !== null &&
    (!Number.isFinite(body.mapZoomRadiusMiles) || body.mapZoomRadiusMiles <= 0)
  ) {
    return Response.json({ ok: false, errors: ['The map zoom radius must be a positive number of miles, or left blank.'] }, { status: 400 })
  }

  try {
    if (body.pinColor && !isValidPinColor(body.pinColor)) {
      return Response.json({ ok: false, errors: ['The pin colour must be a hex value like #2657bf.'] }, { status: 400 })
    }
    const community = await adminCommunityFromRequest(request)
    const category = await updateCategory(community.slug, id, body)
    if (!category) {
      return Response.json({ ok: false, errors: ['Category not found.'] }, { status: 404 })
    }
    let cleared: number | undefined
    if (body.clearFields && (body.clearFields.address || body.clearFields.phone || body.clearFields.keys?.length)) {
      ;({ updated: cleared } = await clearCategoryFieldData(id, {
        address: body.clearFields.address,
        phone: body.clearFields.phone,
        fieldKeys: body.clearFields.keys,
      }))
    }
    let renamed: number | undefined
    if (body.applyOptionRenames?.length) {
      ;({ updated: renamed } = await applyFieldOptionRenames(id, body.applyOptionRenames))
    }
    // The public site caches this content; drop it so the edit shows up.
    await revalidatePublicContent()
    return Response.json({ ok: true, category, cleared, renamed })
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
    const community = await adminCommunityFromRequest(request)
    const { listings } = await deleteCategory(community.slug, id)
    // The public site caches this content; drop it so the edit shows up.
    await revalidatePublicContent()
    return Response.json({ ok: true, listings })
  } catch (err) {
    console.error('[admin/categories/:id] DELETE failed:', err)
    return Response.json({ ok: false, errors: ['Could not delete category.'] }, { status: 502 })
  }
}
