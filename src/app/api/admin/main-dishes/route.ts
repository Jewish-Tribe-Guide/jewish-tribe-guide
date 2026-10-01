import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { listCategories } from '@/lib/categoryStore'
import { getResourceById, listApprovedResources } from '@/lib/resourceStore'
import { getAdminClient } from '@/lib/supabase/admin'
import { revalidatePublicContent } from '@/lib/revalidateContent'
import { itemsField, listingFacts } from '@/lib/listingView'
import { addedItemName, cleanItemName, itemMarks, itemWording } from '@/lib/itemMarks'
import { findMenu, readMenu, MAX_DISHES } from '@/lib/menuReader'
import { decideMenuReading, getMenuReading, listMenuReadings, saveMenuReading } from '@/lib/menuReadingStore'
import { UUID } from '@/lib/itemMarkRoutes'
import type { CategoryConfig } from '@/lib/categories'
import type { DirectoryResource } from '@/types'

// GET  /api/admin/main-dishes — the "Main dishes" tab (agreed Oct 1): every
//      food place whose category keeps a list of dishes, with its website,
//      the dishes it lists now, and what the menu reader proposed for it
//      (menu_reading, migration 065). Admin only.
// POST /api/admin/main-dishes   body: { action: 'read', resourceId }
//      Reads that place's own menu now (menuReader.ts) and keeps what the AI
//      proposed, for an admin to check. Replaces an earlier reading.
// POST /api/admin/main-dishes   body: { action: 'approve', resourceId, dishes: string[] }
//      Puts the dishes the admin kept (and any they added) on the listing,
//      each dated "on its menu" today, with the menu's address for "Full
//      menu ↗". The address is the reading's own, never the request's.
// POST /api/admin/main-dishes   body: { action: 'skip', resourceId }
//      Not now: the reading stays, marked skipped.

export const maxDuration = 60

/** The categories with a list of dishes, each with that list's field. */
function dishKinds(categories: CategoryConfig[]) {
  return categories.flatMap((c) => {
    const field = itemsField(c)
    return field && itemWording(field).noun === 'dish' ? [{ category: c, field }] : []
  })
}

/** A place's own website: its category's first web-address field in the
 *  form's basics (Website), or one keyed "website". */
function websiteOf(item: DirectoryResource, category: CategoryConfig): string | null {
  const field = category.detailFields.find((f) => f.type === 'url' && f.coreSection) ?? category.detailFields.find((f) => f.key === 'website')
  const url = field ? item[field.key] : null
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim()) ? url.trim() : null
}

export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const [categories, listings, { readings, available }] = await Promise.all([
      listCategories(community.slug),
      listApprovedResources(community.slug),
      listMenuReadings(community.slug),
    ])
    const kinds = dishKinds(categories)
    const byId = new Map(readings.map((r) => [r.resourceId, r]))
    const places = kinds.flatMap(({ category, field }) =>
      listings
        .filter((l) => l.category === category.id)
        .map((l) => ({
          id: l.id,
          name: l.name,
          categoryLabel: category.label,
          facts: listingFacts(l, category),
          website: websiteOf(l, category),
          dishes: itemMarks(l, field).map((m) => m.name),
          reading: byId.get(l.id) ?? null,
        })),
    )
    places.sort((a, b) => a.name.localeCompare(b.name))
    return Response.json({ ok: true, available, readerOn: !!process.env.OPENAI_API_KEY, places })
  } catch (err) {
    console.error('[admin/main-dishes] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the food places.'] }, { status: 502 })
  }
}

export async function POST(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const resourceId = typeof body?.resourceId === 'string' ? body.resourceId : ''
  const action = body?.action
  if (!UUID.test(resourceId) || (action !== 'read' && action !== 'approve' && action !== 'skip')) {
    return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })
  }

  try {
    const listing = await getResourceById(resourceId, community.slug)
    const kind = listing ? dishKinds(await listCategories(community.slug)).find((k) => k.category.id === listing.category) : undefined
    if (!listing || !kind) return Response.json({ ok: false, errors: ['Not a food place with a list of dishes.'] }, { status: 404 })

    if (action === 'read') {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) return Response.json({ ok: false, errors: ['The AI reader isn’t set up here (no OPENAI_API_KEY).'] }, { status: 503 })
      const website = websiteOf(listing, kind.category)
      const source = website ? await findMenu(website) : null
      if (!source) {
        const reading = await saveMenuReading(community.slug, resourceId, {
          status: 'failed',
          sourceUrl: website,
          dishes: [],
          note: website ? 'Couldn’t read a menu on its website.' : 'No website to read.',
          model: null,
        })
        return Response.json({ ok: true, reading })
      }
      const read = await readMenu(source, listing.name, { apiKey })
      const reading = await saveMenuReading(community.slug, resourceId, {
        status: read.dishes.length ? 'proposed' : 'failed',
        sourceUrl: read.sourceUrl,
        dishes: read.dishes,
        note: read.note,
        model: read.model,
      })
      return Response.json({ ok: true, reading })
    }

    const stored = await getMenuReading(community.slug, resourceId)
    if (!stored) return Response.json({ ok: false, errors: ['Read its menu first.'] }, { status: 409 })

    if (action === 'skip') {
      await decideMenuReading(community.slug, resourceId, 'skipped', admin.email)
      return Response.json({ ok: true })
    }

    const raw = Array.isArray(body?.dishes) ? body.dishes : []
    const names = [...new Map(raw.flatMap((d) => {
      const name = cleanItemName(d)
      return name ? [[addedItemName(name).toLowerCase(), addedItemName(name)] as const] : []
    })).values()]
    if (names.length === 0 || names.length > MAX_DISHES + 5) return Response.json({ ok: false, errors: ['Pick at least one dish.'] }, { status: 400 })
    const { data, error } = await getAdminClient().rpc('approve_menu_dishes', {
      p_id: resourceId,
      p_field: kind.field.key,
      p_items: names,
      p_now: new Date().toISOString(),
      p_menu_url: stored.sourceUrl,
    })
    if (error) throw new Error(error.message)
    const row = (Array.isArray(data) ? data[0] : data) as { out_labels?: string[] } | null
    if (!row) return Response.json({ ok: false, errors: ['That listing isn’t live any more.'] }, { status: 404 })
    await decideMenuReading(community.slug, resourceId, 'approved', admin.email)
    await revalidatePublicContent()
    return Response.json({ ok: true, dishes: row.out_labels ?? names })
  } catch (err) {
    console.error('[admin/main-dishes] POST failed:', err)
    return Response.json({ ok: false, errors: ['Could not do that. If this keeps happening, migration 065 may not be applied yet.'] }, { status: 502 })
  }
}
