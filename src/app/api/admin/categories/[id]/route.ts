import { revalidatePublicContent } from '@/lib/revalidateContent'
import type { NextRequest } from 'next/server'
import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { updateCategory, deleteCategory, renameCategoryId } from '@/lib/categoryStore'
import { clearCategoryFieldData, applyFieldOptionRenames } from '@/lib/resourceStore'
import { isHttpUrl } from '@/lib/validation'
import type { CategoryCapabilities, CategoryField, CategoryFormSection } from '@/lib/categories'
import { parseGroupBy, type GroupBy } from '@/lib/listGroups'
import { parseQuestionCard, type QuestionCard } from '@/lib/questionCards'
import { parseWalkLists, type WalkList } from '@/lib/walkList'
import { parseListingParts, type ListingParts } from '@/lib/listingParts'
import { isValidPinColor } from '@/lib/categoryColor'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

type PatchBody = {
  label?: string
  pluralLabel?: string
  icon?: string
  description?: string
  sortOrder?: number
  fields?: CategoryField[]
  /** Named groups for the intake/edit form's optional fields — see
   *  CategoryConfig.formSections. */
  formSections?: CategoryFormSection[] | null
  hasAddress?: boolean
  hasPhone?: boolean
  upvotesEnabled?: boolean
  capabilities?: Partial<CategoryCapabilities>
  externalLink?: { label: string; url: string } | null
  cardImageUrl?: string | null
  cardTextColor?: string | null
  cardBandImageUrl?: string | null
  pinColor?: string | null
  iconImageUrl?: string | null
  /** Map category only (kind === 'map') — see CategoryConfig's own doc. */
  mapZoomRadiusMiles?: number | null
  /** Whether this category shows on the public site — see CategoryConfig's
   *  own doc. */
  active?: boolean
  /** How the category page groups its list, or null for one list — see
   *  listGroups.ts. Only sent when the admin changed it. */
  groupBy?: GroupBy | null
  /** The one question the list asks, or null for none — see
   *  questionCards.ts. Only sent when the admin changed it. */
  questionCard?: QuestionCard | null
  /** Other categories' places within a walk, or null for none — see
   *  walkList.ts. Only sent when the admin changed it. */
  walkList?: WalkList[] | null
  /** The named main thing, boxes and the Shabbos card, or null
   *  for none — see listingParts.ts. Only sent when the admin changed it. */
  listingParts?: ListingParts | null
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
  if (body.cardBandImageUrl && !isHttpUrl(body.cardBandImageUrl)) {
    return Response.json({ ok: false, errors: ['The banner image must be a valid http(s) URL.'] }, { status: 400 })
  }
  if (
    body.mapZoomRadiusMiles !== undefined &&
    body.mapZoomRadiusMiles !== null &&
    (!Number.isFinite(body.mapZoomRadiusMiles) || body.mapZoomRadiusMiles <= 0)
  ) {
    return Response.json({ ok: false, errors: ['The map zoom radius must be a positive number of miles, or left blank.'] }, { status: 400 })
  }

  // A grouping this code doesn't know would read back as no groups at all,
  // so it's refused here rather than saved and silently ignored.
  if (body.groupBy != null && !parseGroupBy(body.groupBy)) {
    return Response.json({ ok: false, errors: ['That way of grouping the list isn’t one the site knows.'] }, { status: 400 })
  }
  if (body.groupBy != null) body.groupBy = parseGroupBy(body.groupBy)
  if (body.questionCard != null && !parseQuestionCard(body.questionCard)) {
    return Response.json({ ok: false, errors: ['That question isn’t one the site knows.'] }, { status: 400 })
  }
  if (body.questionCard != null) body.questionCard = parseQuestionCard(body.questionCard)
  if (body.walkList != null && (!Array.isArray(body.walkList) || parseWalkLists(body.walkList).length !== body.walkList.length)) {
    return Response.json({ ok: false, errors: ['That list of places within a walk isn’t one the site knows.'] }, { status: 400 })
  }
  if (body.walkList != null) body.walkList = parseWalkLists(body.walkList)
  if (body.listingParts != null) body.listingParts = parseListingParts(body.listingParts)

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
    // The columns a save can reach before the database has them.
    if (body.groupBy !== undefined && err instanceof Error && /group_by/.test(err.message)) {
      return Response.json(
        { ok: false, errors: ['Could not save the grouping: database migration 059 (category group_by) isn’t applied yet.'] },
        { status: 502 },
      )
    }
    if (body.questionCard !== undefined && err instanceof Error && /question_card/.test(err.message)) {
      return Response.json(
        { ok: false, errors: ['Could not save the question: database migration 060 (category question_card) isn’t applied yet.'] },
        { status: 502 },
      )
    }
    if (body.walkList !== undefined && err instanceof Error && /walk_list/.test(err.message)) {
      return Response.json(
        { ok: false, errors: ['Could not save the places within a walk: database migration 061 (category walk_list) isn’t applied yet.'] },
        { status: 502 },
      )
    }
    if (body.listingParts !== undefined && err instanceof Error && /listing_parts/.test(err.message)) {
      return Response.json(
        { ok: false, errors: ['Could not save what each listing shows: database migration 066 (category listing_parts) isn’t applied yet.'] },
        { status: 502 },
      )
    }
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
