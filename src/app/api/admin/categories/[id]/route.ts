import { adminWrite, unchanged } from '@/lib/adminRoute'
import { isPlaceKind, type PlaceKind } from '@/lib/placeKinds'
import type { NextRequest } from 'next/server'
import { updateCategory, deleteCategory, categoryDeleteCounts } from '@/lib/categoryStore'
import { filesInRow, removeLaterIfUnused } from '@/lib/storedFiles'
import { clearCategoryFieldData, applyFieldOptionRenames } from '@/lib/resourceStore'
import { isHttpUrl } from '@/lib/validation'
import type { CategoryCapabilities, CategoryField, CategoryFormSection } from '@/lib/categories'
import { parseGroupBy, type GroupBy } from '@/lib/listGroups'
import { parseQuestionCard, type QuestionCard } from '@/lib/questionCards'
import { parseWalkLists, type WalkList } from '@/lib/walkList'
import { parseListingParts, type ListingParts } from '@/lib/listingParts'
import { isValidPinColor } from '@/lib/categoryColor'

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
  cardBandImageUrl?: string | null
  pinColor?: string | null
  /** Map category only (kind === 'map') — see CategoryConfig's own doc. */
  mapZoomRadiusMiles?: number | null
  /** Whether this category shows on the public site — see CategoryConfig's
   *  own doc. */
  active?: boolean
  /** How the category page groups its list, or null for one list — see
   *  listGroups.ts. Only sent when the admin changed it. */
  groupBy?: GroupBy | null
  /** What kind of place it holds — see placeKinds.ts. Only sent when the
   *  admin changed it. */
  placeKind?: PlaceKind
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
}

// PATCH /api/admin/categories/:id — edit a category's presentation, fields,
// and capabilities. Only the provided keys change. Its id (its address)
// never does: banners, home sections, Right now, tabs, subscribers and
// pending suggestions all name it. Admin only.
export const PATCH = adminWrite(async (request: NextRequest, { community }, ctx: RouteContext<'/api/admin/categories/[id]'>) => {
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
  if (body.placeKind !== undefined && !isPlaceKind(body.placeKind)) {
    return Response.json({ ok: false, errors: ['That kind of place isn’t one the site knows.'] }, { status: 400 })
  }
  if (body.questionCard != null && !parseQuestionCard(body.questionCard)) {
    return Response.json({ ok: false, errors: ['That question isn’t one the site knows.'] }, { status: 400 })
  }
  if (body.questionCard != null) body.questionCard = parseQuestionCard(body.questionCard)
  if (body.walkList != null && (!Array.isArray(body.walkList) || parseWalkLists(body.walkList).length !== body.walkList.length)) {
    return Response.json({ ok: false, errors: ['That list of places within a walk isn’t one the site knows.'] }, { status: 400 })
  }
  if (body.walkList != null) body.walkList = parseWalkLists(body.walkList)
  if (body.listingParts != null) body.listingParts = parseListingParts(body.listingParts)

  // A refusal comes before anything is written (a 4xx isn't invalidated,
  // adminRoute.ts).
  if (body.pinColor && !isValidPinColor(body.pinColor)) {
    return Response.json({ ok: false, errors: ['The pin colour must be a hex value like #2657bf.'] }, { status: 400 })
  }

  try {
    const before = await filesInRow('category', { community_id: community.slug, id })
    const category = await updateCategory(community.slug, id, body)
    if (!category) {
      return Response.json({ ok: false, errors: ['Category not found.'] }, { status: 404 })
    }
    // A banner or card picture replaced: the old file goes, if nothing else
    // uses it (storedFiles.ts).
    removeLaterIfUnused(before, 'category')
    let cleared: number | undefined
    if (body.clearFields && (body.clearFields.address || body.clearFields.phone || body.clearFields.keys?.length)) {
      ;({ updated: cleared } = await clearCategoryFieldData(community.slug, id, {
        address: body.clearFields.address,
        phone: body.clearFields.phone,
        fieldKeys: body.clearFields.keys,
      }))
    }
    let renamed: number | undefined
    if (body.applyOptionRenames?.length) {
      ;({ updated: renamed } = await applyFieldOptionRenames(community.slug, id, body.applyOptionRenames))
    }
    return Response.json({ ok: true, category, cleared, renamed })
  } catch (err) {
    console.error('[admin/categories/:id] PATCH failed:', err)
    // The columns a save can reach before the database has them.
    if (body.placeKind !== undefined && err instanceof Error && /place_kind/.test(err.message)) {
      return Response.json(
        { ok: false, errors: ['Kinds of place aren’t set up on this site yet.'] },
        { status: 502 },
      )
    }
    if (body.groupBy !== undefined && err instanceof Error && /group_by/.test(err.message)) {
      return Response.json(
        { ok: false, errors: ['Grouping isn’t set up on this site yet.'] },
        { status: 502 },
      )
    }
    if (body.questionCard !== undefined && err instanceof Error && /question_card/.test(err.message)) {
      return Response.json(
        { ok: false, errors: ['The question card isn’t set up on this site yet.'] },
        { status: 502 },
      )
    }
    if (body.walkList !== undefined && err instanceof Error && /walk_list/.test(err.message)) {
      return Response.json(
        { ok: false, errors: ['Places within a walk aren’t set up on this site yet.'] },
        { status: 502 },
      )
    }
    if (body.listingParts !== undefined && err instanceof Error && /listing_parts/.test(err.message)) {
      return Response.json(
        { ok: false, errors: ['Choosing what each listing shows isn’t set up on this site yet.'] },
        { status: 502 },
      )
    }
    return Response.json({ ok: false, errors: ['Could not update category.'] }, { status: 502 })
  }
})

// DELETE /api/admin/categories/:id — permanently remove a category and all of
// its listings (and the Eruv's eruvim and their watches). Admin only.
// ?dry=1 only counts what would go, for the confirm.
export const DELETE = adminWrite(async (request: NextRequest, { community }, ctx: RouteContext<'/api/admin/categories/[id]'>) => {
  const { id } = await ctx.params
  try {
    if (new URL(request.url).searchParams.get('dry') === '1') {
      return unchanged(Response.json({ ok: true, ...(await categoryDeleteCounts(community.slug, id)) }))
    }
    const before = await filesInRow('category', { community_id: community.slug, id })
    const counts = await deleteCategory(community.slug, id)
    // Its pictures go with it. Its listings' photos are the weekly sweep's,
    // once nothing (History included) mentions them.
    removeLaterIfUnused(before, 'category')
    return Response.json({ ok: true, ...counts })
  } catch (err) {
    console.error('[admin/categories/:id] DELETE failed:', err)
    return Response.json({ ok: false, errors: ['Could not delete category.'] }, { status: 502 })
  }
})
