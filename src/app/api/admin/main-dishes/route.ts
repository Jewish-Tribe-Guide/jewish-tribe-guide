import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { listCategories } from '@/lib/categoryStore'
import { getResourceById, listApprovedResources } from '@/lib/resourceStore'
import { revalidatePublicContent } from '@/lib/revalidateContent'
import { listingFacts } from '@/lib/listingView'
import { addedItemName, cleanItemName, itemMarks } from '@/lib/itemMarks'
import { findMenus, isOrderingApp, menuPages, readMenu, readMenus, readMenuPage, troubleClause, type MenuDish, type Trouble } from '@/lib/menuReader'
import { menuWebsite, readMenuLink } from '@/lib/menuLink'
import { dishKinds, listedNames, menuLinkOf, newestMenuDate, readPlaceMenu } from '@/lib/menuPlaceRead'
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
import { listWatches, updateWatch } from '@/lib/watchStore'
import { jobFindings } from '@/lib/watchFindingStore'
import { runAndRecord } from '@/lib/watchRunner'
import { isListingPageWatch } from '@/lib/listingPageWatch'
import { PAGE_STOPPED_CREATOR, homePageReads } from '@/lib/hoursJob'
import { listedContact } from '@/lib/contactRead'
import { MENU_WATCH_CREATOR, type Watch } from '@/lib/watches'
import type { CategoryField } from '@/lib/categories'
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
// POST body: { action: 'stop', resourceId, id }
//      Stop reading one of its website's pages (a hours/phone page, Oct 22):
//      kept, never read, so the morning's run never adds it again.
// POST body: { action: 'no_menu' | 'undo_no_menu', resourceId }
//      "No menu": the place has none to read (menuReadingStore's isNoMenu).
//
// A reading marked "no menu" is sent as status 'no_menu'. Each place also
// has `menuAt`, the newest "on its menu" date among the dishes it lists:
// dishes approved from a menu someone sent through the site, which the tab
// says, rather than a stale "couldn't read".
//
// A food place Google doesn't keep is read from its website for its hours
// and phone too (Main dishes board 3, Oct 22: hoursJob.ts's
// homePageReads). Each place then has `pages` (its website's pages the
// daily run reads, each with what its last read found), `findings` (what
// they found waiting to decide, watchFindings.ts), `hours` (its listed
// hours, when its website is read for them) and `contact` (its phone as
// listed, when its website is read for it: contactRead.ts). "Read them
// now" (action 'read') reads those pages too.
//
// And `menuWatch`, its menu watch (menuWatch.ts), so a menu page that
// stopped opening shows here (watchJobs.ts's menuDidntLoad), the Watches
// tab no longer listing those watches (Oct 22).

export const maxDuration = 60

const MAX_PHOTOS = 3
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const PHOTO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])

type Action = 'read' | 'use' | 'save' | 'skip' | 'link' | 'unlink' | 'photos' | 'no_menu' | 'undo_no_menu' | 'stop'
const ACTIONS: readonly Action[] = ['read', 'use', 'save', 'skip', 'link', 'unlink', 'photos', 'no_menu', 'undo_no_menu', 'stop']

/** A place's website pages the daily run reads for its hours and phone. */
const pagesOf = (watches: readonly Watch[], id: string) => watches.filter((w) => w.resourceId === id && isListingPageWatch(w))

/** A place's menu watch, as the tab needs it. */
function menuWatchOf(watches: readonly Watch[], id: string) {
  const w = watches.find((x) => x.resourceId === id && x.createdBy === MENU_WATCH_CREATOR)
  return w ? { url: w.url, active: w.active, lastRunAt: w.lastRunAt, lastOkAt: w.lastOkAt, lastError: w.lastError, failingSince: w.failingSince } : null
}

/** A reading as the tab gets it: "no menu" said as its own status. */
function forTab(r: StoredMenuReading) {
  return isNoMenu(r) ? { ...r, status: 'no_menu' as const } : r
}

/** The listing's side of dishProposal: its dishes, the "not always" ones,
 *  and those a reader found on its menu before (a menu date). */
function listedDishes(item: DirectoryResource, field: CategoryField) {
  const marks = itemMarks(item, field)
  return { dishes: marks.map((m) => m.name), sometimes: marks.filter((m) => m.sometimes).map((m) => m.name), menuDated: marks.filter((m) => m.menuAt).map((m) => m.name) }
}

/** A read at an admin's asking (a menu added, Read them now, photos) that
 *  changes nothing: the dishes it found are dated from the menu straight
 *  away, as Use this would, with nothing left to decide (the user, Oct 22:
 *  "If I add the menu it should have that as its date"). Else the reading
 *  as it is. */
async function dateAgreeing(slug: string, listing: DirectoryResource, field: CategoryField, reading: StoredMenuReading, by: string) {
  if (reading.status !== 'proposed') return { reading }
  const listed = listedDishes(listing, field)
  const proposal = dishProposal(listed, reading)
  const found = proposal.rows.filter((r) => r.status === 'same').map((r) => r.name)
  if (proposal.updates || !found.length) return { reading }
  const at = new Date().toISOString()
  if (!(await setMenuDishes(slug, listing.id, field.key, { always: proposal.always, sometimes: proposal.sometimes }, { names: found, at, menuUrl: reading.sourceUrl }))) return { reading }
  await decideMenuReading(slug, listing.id, 'approved', by)
  await revalidatePublicContent()
  const dated = new Set([...found, ...listed.menuDated].map((n) => n.toLowerCase()))
  return { reading: { ...reading, status: 'approved' as const, decidedAt: at, decidedBy: by }, menuDated: listed.dishes.filter((n) => dated.has(n.toLowerCase())) }
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
    const [categories, listings, { readings, available }, { watches }] = await Promise.all([
      listCategories(community.slug),
      listApprovedResources(community.slug),
      listMenuReadings(community.slug),
      listWatches(community.slug),
    ])
    const kinds = dishKinds(categories)
    const { findings } = await jobFindings(
      community.slug,
      'dishes',
      kinds.map((k) => k.category),
    )
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
          pages: pagesOf(watches, l.id),
          menuWatch: menuWatchOf(watches, l.id),
          findings: findings.filter((f) => f.targetId === l.id),
          hours: homePageReads(category, l as unknown as Record<string, unknown>).includes('hours') ? (l.hours ?? null) : undefined,
          contact: listedContact(category, l as unknown as Record<string, unknown>),
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

    if (action === 'stop') {
      const id = typeof body?.id === 'string' ? body.id : ''
      const page = pagesOf((await listWatches(community.slug)).watches, resourceId).find((w) => w.id === id)
      if (!page) return Response.json({ ok: false, errors: ['That page isn’t read for it.'] }, { status: 400 })
      await updateWatch(community.slug, page.id, { createdBy: PAGE_STOPPED_CREATOR, active: false })
      return Response.json({ ok: true })
    }

    if (action === 'read') {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) return Response.json({ ok: false, errors: ['The AI reader isn’t set up here (no OPENAI_API_KEY).'] }, { status: 503 })
      // Its website's pages for its hours and phone, read first, one after
      // another, as the hours job's Check now reads them.
      const pages: Watch[] = []
      for (const w of pagesOf((await listWatches(community.slug)).watches, resourceId).filter((x) => x.active)) pages.push((await runAndRecord(w, undefined, undefined, { full: true })).watch)
      // Its menu (menuPlaceRead.ts).
      const read = await readPlaceMenu(community.slug, listing, kind, apiKey)
      return Response.json({ ok: true, ...(read ? await dateAgreeing(community.slug, listing, kind.field, read, admin.email) : { reading: read }), pages })
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
      // With the rest of the place's menu on its website (menuPages).
      const website = menuWebsite(listing, kind.category)
      const sources = await readMenuPage(url, { render: renderer.render, trouble: (t) => void (linkTrouble.t ??= t) })
        .then(async (source) => (source ? menuPages(source, website ? await findMenus(website, { render: renderer.render }).catch(() => []) : []) : []))
        .finally(() => renderer.close())
      const read = sources.length ? (await readMenus(sources, listing.name, { apiKey, listed: listedNames(listing, kind.field) }))! : null
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
      return Response.json({ ok: true, menuUrl: url, ...(await dateAgreeing(community.slug, listing, kind.field, reading, admin.email)) })
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
      return Response.json({ ok: true, ...(await dateAgreeing(community.slug, listing, kind.field, reading, admin.email)) })
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
