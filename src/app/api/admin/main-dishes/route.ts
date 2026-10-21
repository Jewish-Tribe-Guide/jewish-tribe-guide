import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { listCategories } from '@/lib/categoryStore'
import { getResourceById, listApprovedResources } from '@/lib/resourceStore'
import { getAdminClient } from '@/lib/supabase/admin'
import { revalidatePublicContent } from '@/lib/revalidateContent'
import { itemsField, listingFacts } from '@/lib/listingView'
import { addedItemName, cleanItemName, itemMarks, itemWording } from '@/lib/itemMarks'
import { findMenus, isOrderingApp, readMenu, readMenus, readMenuPage, MAX_DISHES, type MenuDish } from '@/lib/menuReader'
import { MENU_LINK_KEY, readMenuLink } from '@/lib/menuLink'
import {
  clearMenuReading,
  decideMenuReading,
  getMenuReading,
  isNoMenu,
  listMenuReadings,
  markNoMenu,
  saveMenuLink,
  saveMenuReading,
  type StoredMenuReading,
} from '@/lib/menuReadingStore'
import { UUID } from '@/lib/itemMarkRoutes'
import type { CategoryConfig, CategoryField } from '@/lib/categories'
import type { DirectoryResource } from '@/types'

// GET  /api/admin/main-dishes — the "Main dishes" tab (agreed Oct 1): every
//      food place whose category keeps a list of dishes, with its website
//      and menu link,
//      the dishes it lists now, and what the menu reader proposed for it
//      (menu_reading, migration 065). Admin only.
// POST /api/admin/main-dishes   body: { action: 'read', resourceId }
//      Reads that place's own menu now (menuReader.ts): its menu link when
//      it has one that can be read (menuLink.ts), else the pages its
//      website links to as its menu, best first, until one names dishes. Keeps what the AI proposed, for an admin to
//      check. Replaces an earlier reading.
// POST /api/admin/main-dishes   body: { action: 'approve', resourceId, dishes: string[] }
//      Puts the dishes the admin kept (and any they added) on the listing,
//      each dated "on its menu" today, with the menu's address for "Full
//      menu ↗". The address is the reading's own, never the request's.
// POST /api/admin/main-dishes   body: { action: 'skip', resourceId }
//      Not now: the reading stays, marked skipped.
//
// For a place whose menu couldn't be read (the user, Oct 20):
// POST body: { action: 'link', resourceId, url }
//      "Give its menu link": saved on the listing as its menu link (so the
//      tab reads it first from now on, and the menu watch watches it), then
//      read. Saved even when it can't be read (an ordering app's, say): it's
//      still the listing's "Full menu".
// POST multipart: action=photos, resourceId, file (up to 3)
//      "Add photos of the menu": read as the "+ Add" box reads photos (or a
//      PDF), kept as a reading to check like any other. The photos aren't
//      kept, and don't become its menu link.
// POST body: { action: 'no_menu' | 'undo_no_menu', resourceId }
//      "No menu": the place has none to read (menuReadingStore's isNoMenu).
//
// A reading marked "no menu" is sent as status 'no_menu'. Each place also
// has `menuAt`, the newest "on its menu" date among the dishes it lists:
// dishes approved from a menu someone sent through the site, which the tab
// says, rather than a stale "couldn't read".

export const maxDuration = 60

const MAX_PHOTOS = 3
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const PHOTO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])

type Action = 'read' | 'approve' | 'skip' | 'link' | 'photos' | 'no_menu' | 'undo_no_menu'
const ACTIONS: readonly Action[] = ['read', 'approve', 'skip', 'link', 'photos', 'no_menu', 'undo_no_menu']

/** A reading as the tab gets it: "no menu" said as its own status. */
function forTab(r: StoredMenuReading) {
  return isNoMenu(r) ? { ...r, status: 'no_menu' as const } : r
}

/** The newest "on its menu" date among the dishes a place lists. */
function newestMenuDate(item: DirectoryResource, field: CategoryField): string | null {
  return itemMarks(item, field).reduce<string | null>((newest, m) => (m.menuAt && (!newest || m.menuAt > newest) ? m.menuAt : newest), null)
}

/** The categories with a list of dishes, each with that list's field. */
function dishKinds(categories: CategoryConfig[]) {
  return categories.flatMap((c) => {
    const field = itemsField(c)
    return field && itemWording(field).noun === 'dish' ? [{ category: c, field }] : []
  })
}

/** A place's menu link, when it has one (menuLink.ts). */
function menuLinkOf(item: DirectoryResource): string | null {
  return readMenuLink(item[MENU_LINK_KEY]) || null
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
          menuUrl: menuLinkOf(l),
          dishes: itemMarks(l, field).map((m) => m.name),
          menuAt: newestMenuDate(l, field),
          reading: byId.has(l.id) ? forTab(byId.get(l.id)!) : null,
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

  // Photos come as a form; everything else as JSON.
  const form = (request.headers.get('content-type') ?? '').includes('multipart/form-data') ? await request.formData().catch(() => null) : null
  const body = form
    ? (Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, unknown>)
    : ((await request.json().catch(() => null)) as Record<string, unknown> | null)
  const resourceId = typeof body?.resourceId === 'string' ? body.resourceId : ''
  const action = ACTIONS.find((a) => a === body?.action)
  if (!UUID.test(resourceId) || !action || (action === 'photos') !== !!form) {
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
      const menuUrl = menuLinkOf(listing)
      // Its menu link when that can be read, else the pages its website
      // links to as its menu, best first, until one names dishes.
      const linked = menuUrl ? await readMenuPage(menuUrl) : null
      const sources = linked ? [linked] : website ? await findMenus(website) : []
      if (!sources.length) {
        const reading = await saveMenuReading(community.slug, resourceId, {
          status: 'failed',
          sourceUrl: menuUrl ?? website,
          dishes: [],
          note: menuUrl ? `Couldn’t read its menu link${website ? ' or a menu on its website' : ''}.` : website ? 'Couldn’t read a menu on its website.' : 'No website or menu link to read.',
          model: null,
        })
        return Response.json({ ok: true, reading })
      }
      const read = (await readMenus(sources, listing.name, { apiKey }))!
      const reading = await saveMenuReading(community.slug, resourceId, {
        status: read.dishes.length ? 'proposed' : 'failed',
        sourceUrl: read.sourceUrl,
        dishes: read.dishes,
        note: read.note,
        model: read.model,
      })
      return Response.json({ ok: true, reading })
    }

    if (action === 'link') {
      const url = readMenuLink(body?.url)
      if (!url) return Response.json({ ok: false, errors: ['That isn’t a web address.'] }, { status: 400 })
      if (!(await saveMenuLink(community.slug, resourceId, url))) return Response.json({ ok: false, errors: ['That listing isn’t live any more.'] }, { status: 404 })
      await revalidatePublicContent()
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) return Response.json({ ok: true, menuUrl: url, reading: null })
      const source = await readMenuPage(url)
      const read = source ? (await readMenus([source], listing.name, { apiKey }))! : null
      const reading = await saveMenuReading(community.slug, resourceId, {
        status: read?.dishes.length ? 'proposed' : 'failed',
        sourceUrl: read?.sourceUrl ?? url,
        dishes: read?.dishes ?? [],
        note: read
          ? read.note
          : isOrderingApp(url)
            ? 'Saved as its menu link. The reader doesn’t open ordering apps: add photos of the menu.'
            : 'Saved as its menu link, but it couldn’t be read (blocked, or drawn in the browser). Add photos of the menu.',
        model: read?.model ?? null,
      })
      return Response.json({ ok: true, menuUrl: url, reading })
    }

    if (action === 'photos') {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) return Response.json({ ok: false, errors: ['The AI reader isn’t set up here (no OPENAI_API_KEY).'] }, { status: 503 })
      const files = form!.getAll('file').filter((f): f is File => f instanceof File && f.size > 0)
      if (files.length === 0 || files.length > MAX_PHOTOS) return Response.json({ ok: false, errors: [`Add 1 to ${MAX_PHOTOS} photos of the menu.`] }, { status: 400 })
      if (files.some((f) => !PHOTO_TYPES.has(f.type))) return Response.json({ ok: false, errors: ['Photos (PNG, JPG or WebP) or a PDF, please.'] }, { status: 400 })
      if (files.some((f) => f.size > MAX_PHOTO_BYTES)) return Response.json({ ok: false, errors: ['Each photo needs to be under 5MB.'] }, { status: 400 })
      const sent = await Promise.all(files.map(async (f) => ({ mime: f.type, b64: Buffer.from(await f.arrayBuffer()).toString('base64') })))
      const pdf = sent.find((f) => f.mime === 'application/pdf')
      const photos = sent.filter((f) => f.mime !== 'application/pdf')
      const read = await readMenu({ url: null, text: null, pdf: pdf?.b64 ?? null, images: photos }, listing.name, { apiKey })
      // Read off a photo: said beside each dish, as for a menu's pictures.
      const dishes: MenuDish[] = pdf ? read.dishes : read.dishes.map((d) => ({ ...d, picture: true as const }))
      const reading = await saveMenuReading(community.slug, resourceId, {
        status: dishes.length ? 'proposed' : 'failed',
        sourceUrl: null,
        dishes,
        note: dishes.length ? null : (read.note ?? 'No dishes in those photos.'),
        model: read.model,
      })
      return Response.json({ ok: true, reading })
    }

    if (action === 'no_menu') {
      return Response.json({ ok: true, reading: forTab(await markNoMenu(community.slug, resourceId, admin.email)) })
    }

    const stored = await getMenuReading(community.slug, resourceId)
    if (action === 'undo_no_menu') {
      if (stored && isNoMenu(stored)) await clearMenuReading(community.slug, resourceId)
      return Response.json({ ok: true, reading: null })
    }
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
