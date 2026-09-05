import { revalidatePublicContent } from '@/lib/revalidateContent'
import type { NextRequest } from 'next/server'
import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { updateCategory, deleteCategory, renameCategoryId } from '@/lib/categoryStore'
import { clearCategoryFieldData, applyFieldOptionRenames } from '@/lib/resourceStore'
import { isHttpUrl } from '@/lib/validation'
import type { CategoryCapabilities, CategoryField } from '@/lib/categories'
import { isValidPinColor } from '@/lib/categoryColor'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

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
  /** Rename this category's own URL slug — the editor confirms against a
   *  listing count first (see id-usage) since it cascades to every listing's
   *  stored `category` value, not just this row. Applied before the rest of
   *  the patch, which then targets the NEW id. */
  newId?: string
}

// PATCH /api/admin/categories/:id — edit a category's presentation, fields,
// and capabilities. Only the provided keys change. `newId` renames the
// category's own slug (see renameCategoryId) — everything else in this same
// request then targets that new id. Admin only.
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/admin/categories/[id]'>) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
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

  // Applied before everything else, and using its own error path (400, not
  // the catch-all 502 below) — an invalid/taken slug is a plain validation
  // problem the admin needs to fix and retry, same tier as the pinColor
  // check above, not an unexpected server failure.
  let effectiveId = id
  let idRenamed: number | undefined
  if (body.newId && body.newId !== id) {
    try {
      ;({ listings: idRenamed } = await renameCategoryId(community.slug, id, body.newId))
      effectiveId = body.newId
    } catch (err) {
      return Response.json({ ok: false, errors: [err instanceof Error ? err.message : 'Could not rename category.'] }, { status: 400 })
    }
  }

  try {
    if (body.pinColor && !isValidPinColor(body.pinColor)) {
      return Response.json({ ok: false, errors: ['The pin colour must be a hex value like #2657bf.'] }, { status: 400 })
    }
    const category = await updateCategory(community.slug, effectiveId, body)
    if (!category) {
      return Response.json({ ok: false, errors: ['Category not found.'] }, { status: 404 })
    }
    let cleared: number | undefined
    if (body.clearFields && (body.clearFields.address || body.clearFields.phone || body.clearFields.keys?.length)) {
      ;({ updated: cleared } = await clearCategoryFieldData(community.slug, effectiveId, {
        address: body.clearFields.address,
        phone: body.clearFields.phone,
        fieldKeys: body.clearFields.keys,
      }))
    }
    let renamed: number | undefined
    if (body.applyOptionRenames?.length) {
      ;({ updated: renamed } = await applyFieldOptionRenames(community.slug, effectiveId, body.applyOptionRenames))
    }
    // The public site caches this content; drop it so the edit shows up.
    await revalidatePublicContent()
    return Response.json({ ok: true, category, cleared, renamed, idRenamed })
  } catch (err) {
    console.error('[admin/categories/:id] PATCH failed:', err)
    return Response.json({ ok: false, errors: ['Could not update category.'] }, { status: 502 })
  }
}

// DELETE /api/admin/categories/:id — permanently remove a category and all of
// its listings. Admin only.
export async function DELETE(request: NextRequest, ctx: RouteContext<'/api/admin/categories/[id]'>) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const { id } = await ctx.params
  try {
    const { listings } = await deleteCategory(community.slug, id)
    // The public site caches this content; drop it so the edit shows up.
    await revalidatePublicContent()
    return Response.json({ ok: true, listings })
  } catch (err) {
    console.error('[admin/categories/:id] DELETE failed:', err)
    return Response.json({ ok: false, errors: ['Could not delete category.'] }, { status: 502 })
  }
}
