import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { listCategories } from '@/lib/categoryStore'
import { getResourceById, listApprovedResources } from '@/lib/resourceStore'
import { revalidatePublicContent } from '@/lib/revalidateContent'
import { itemsField, listingFacts } from '@/lib/listingView'
import { addedItemName, cleanItemName, itemMarks, itemWording } from '@/lib/itemMarks'
import { findMenus, isOrderingApp, readMenu, readMenus, readMenuPage, troubleClause, unreadMenuNote, type MenuDish, type Trouble } from '@/lib/menuReader'
import { MENU_LINK_KEY, menuWebsite, readMenuLink } from '@/lib/menuLink'
import {
  clearMenuReading,
  decideMenuReading,
  getMenuReading,
  isNoMenu,
  listMenuReadings,
  markNoMenu,
  saveMenuLink,
  saveMenuReading,
  setMenuDishes,
  type StoredMenuReading,
} from '@/lib/menuReadingStore'
import { UUID } from '@/lib/itemMarkRoutes'
import { dishProposal } from '@/lib/dishProposal'
import { routes } from '@/lib/routes'
import { listingSlug } from '@/lib/listingSlug'
import { pageRenderer } from '@/lib/renderPage'
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
// GET  ?item=<id> — one place's listing and category, for Edit (the
//      listing's own Edit for its dishes, BoxEditSheet).
// POST /api/admin/main-dishes   body: { action: 'use', resourceId }
//      "Use this" (Oct 21): the listing's dishes as its reading has them
//      (dishProposal.ts): the ones its menu no longer names off, unless
//      added by hand; new ones on; each it names dated "on its menu" today,
//      with the menu's address for "Full menu ↗". All from the stored
//      reading and the listing, nothing from the request.
// POST body: { action: 'save', resourceId, always: string[], sometimes: string[] }
//      Edit's "Save to the listing": the list as the admin left it. The
//      ones the reading found on its menu are dated; ones added by hand
//      aren't, so a later read that misses them never crosses them out.
// POST /api/admin/main-dishes   body: { action: 'skip', resourceId }
//      "Keep the listing": the reading stays, marked skipped.
// POST body: { action: 'unlink', resourceId }
//      Stop reading its menu link: taken off the listing.
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

type Action = 'read' | 'use' | 'save' | 'skip' | 'link' | 'unlink' | 'photos' | 'no_menu' | 'undo_no_menu'
const ACTIONS: readonly Action[] = ['read', 'use', 'save', 'skip', 'link', 'unlink', 'photos', 'no_menu', 'undo_no_menu']

/** A reading as the tab gets it: "no menu" said as its own status. */
function forTab(r: StoredMenuReading) {
  return isNoMenu(r) ? { ...r, status: 'no_menu' as const } : r
}

/** The dishes a place lists now: each looked for again on a new read of
 *  its menu (the user, Oct 21), the ones added by hand included. */
function listedNames(item: DirectoryResource, field: CategoryField): string[] {
  return itemMarks(item, field).map((m) => m.name)
}

/** The listing's side of dishProposal: its dishes, the "not always" ones,
 *  and those a reader found on its menu before (a menu date). */
function listedDishes(item: DirectoryResource, field: CategoryField) {
  const marks = itemMarks(item, field)
  return { dishes: marks.map((m) => m.name), sometimes: marks.filter((m) => m.sometimes).map((m) => m.name), menuDated: marks.filter((m) => m.menuAt).map((m) => m.name) }
}

/** At most this many dishes saved at once. */
const MAX_DISHES = 80

/** Names from a request: cleaned, as the list names them, each once. */
function cleanNames(raw: unknown): string[] {
  return [...new Map((Array.isArray(raw) ? raw : []).flatMap((d) => {
    const name = cleanItemName(d)
    return name ? [[addedItemName(name).toLowerCase(), addedItemName(name)] as const] : []
  })).values()]
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

export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  // One place, for Edit.
  const itemId = new URL(request.url).searchParams.get('item')
  if (itemId !== null) {
    if (!UUID.test(itemId)) return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })
    const [item, categories] = await Promise.all([getResourceById(itemId, community.slug), listCategories(community.slug)])
    const kind = item ? dishKinds(categories).find((k) => k.category.id === item.category) : undefined
    if (!item || !kind) return Response.json({ ok: false, errors: ['Not a food place with a list of dishes.'] }, { status: 404 })
    return Response.json({ ok: true, item, category: kind.category })
  }

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
          website: menuWebsite(l, category),
          menuUrl: menuLinkOf(l),
          href: routes.listing(community.slug, l.category, listingSlug(l)),
          ...listedDishes(l, field),
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
      const website = menuWebsite(listing, kind.category)
      const menuUrl = menuLinkOf(listing)
      // Its menu link when that can be read, else the pages its website
      // links to as its menu, best first, until one names dishes. A page
      // drawn by a script is drawn in a browser (renderPage.ts).
      // Why each couldn't be read, the first reason each, for the note.
      const renderer = pageRenderer()
      const trouble: { link?: Trouble; site?: Trouble } = {}
      let sources
      try {
        const linked = menuUrl ? await readMenuPage(menuUrl, { render: renderer.render, trouble: (t) => void (trouble.link ??= t) }) : null
        sources = linked ? [linked] : website ? await findMenus(website, { render: renderer.render, trouble: (t) => void (trouble.site ??= t) }) : []
      } finally {
        await renderer.close()
      }
      if (!sources.length) {
        const reading = await saveMenuReading(community.slug, resourceId, {
          status: 'failed',
          sourceUrl: menuUrl ?? website,
          dishes: [],
          note: unreadMenuNote(menuUrl, website, trouble),
          model: null,
        })
        return Response.json({ ok: true, reading })
      }
      const read = (await readMenus(sources, listing.name, { apiKey, listed: listedNames(listing, kind.field) }))!
      const reading = await saveMenuReading(community.slug, resourceId, {
        status: read.dishes.length ? 'proposed' : 'failed',
        sourceUrl: read.sourceUrl,
        dishes: read.dishes,
        missing: read.missing,
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
      const renderer = pageRenderer()
      const linkTrouble: { t?: Trouble } = {}
      const source = await readMenuPage(url, { render: renderer.render, trouble: (t) => void (linkTrouble.t ??= t) }).finally(() => renderer.close())
      const read = source ? (await readMenus([source], listing.name, { apiKey, listed: listedNames(listing, kind.field) }))! : null
      const reading = await saveMenuReading(community.slug, resourceId, {
        status: read?.dishes.length ? 'proposed' : 'failed',
        sourceUrl: read?.sourceUrl ?? url,
        dishes: read?.dishes ?? [],
        missing: read?.missing,
        note: read
          ? read.note
          : isOrderingApp(url)
            ? 'Saved as its menu link. The reader doesn’t open ordering apps: add photos of the menu.'
            : `Saved as its menu link, but it couldn’t be read${linkTrouble.t ? `: ${troubleClause(linkTrouble.t)}` : ''}. Add photos of the menu.`,
        model: read?.model ?? null,
      })
      return Response.json({ ok: true, menuUrl: url, reading })
    }

    if (action === 'unlink') {
      if (!(await saveMenuLink(community.slug, resourceId, null))) return Response.json({ ok: false, errors: ['That listing isn’t live any more.'] }, { status: 404 })
      await revalidatePublicContent()
      return Response.json({ ok: true, menuUrl: null })
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
      const read = await readMenu({ url: null, text: null, pdf: pdf?.b64 ?? null, images: photos }, listing.name, { apiKey, listed: listedNames(listing, kind.field) })
      // Read off a photo: said beside each dish, as for a menu's pictures.
      const dishes: MenuDish[] = pdf ? read.dishes : read.dishes.map((d) => ({ ...d, picture: true as const }))
      const reading = await saveMenuReading(community.slug, resourceId, {
        status: dishes.length ? 'proposed' : 'failed',
        sourceUrl: null,
        dishes,
        missing: read.missing,
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

    // Use this, or Edit's Save to the listing.
    const at = new Date().toISOString()
    let lists: { always: string[]; sometimes: string[] }
    let found: string[]
    if (action === 'use') {
      if (stored.status !== 'proposed') return Response.json({ ok: false, errors: ['Read its menu again first.'] }, { status: 409 })
      const proposal = dishProposal(listedDishes(listing, kind.field), stored)
      lists = { always: proposal.always, sometimes: proposal.sometimes }
      found = proposal.rows.filter((r) => r.status === 'same' || r.status === 'new').map((r) => r.name)
    } else {
      const always = cleanNames(body?.always)
      const taken = new Set(always.map((n) => n.toLowerCase()))
      lists = { always, sometimes: cleanNames(body?.sometimes).filter((n) => !taken.has(n.toLowerCase())) }
      const onMenu = new Set(stored.dishes.map((d) => d.name.toLowerCase()))
      found = [...lists.always, ...lists.sometimes].filter((n) => onMenu.has(n.toLowerCase()))
    }
    if (lists.always.length + lists.sometimes.length > MAX_DISHES) return Response.json({ ok: false, errors: ['That’s too many dishes.'] }, { status: 400 })
    if (!(await setMenuDishes(community.slug, resourceId, kind.field.key, lists, { names: found, at, menuUrl: stored.sourceUrl }))) {
      return Response.json({ ok: false, errors: ['That listing isn’t live any more.'] }, { status: 404 })
    }
    await decideMenuReading(community.slug, resourceId, 'approved', admin.email)
    await revalidatePublicContent()
    const menuDated = new Set([...found, ...listedDishes(listing, kind.field).menuDated].map((n) => n.toLowerCase()))
    const dishes = [...lists.always, ...lists.sometimes]
    return Response.json({ ok: true, dishes, sometimes: lists.sometimes, menuDated: dishes.filter((n) => menuDated.has(n.toLowerCase())) })
  } catch (err) {
    console.error('[admin/main-dishes] POST failed:', err)
    return Response.json({ ok: false, errors: ['Could not do that. If this keeps happening, migration 065 may not be applied yet.'] }, { status: 502 })
  }
}
