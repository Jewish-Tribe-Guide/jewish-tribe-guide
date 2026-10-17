import { getAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit, clientIp } from '@/lib/rateLimit'
import { isHoneypotTripped } from '@/lib/honeypot'
import { verifyTurnstile } from '@/lib/turnstile'
import { ui } from '@/lib/uiConfig'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { listCategories } from '@/lib/categoryStore'
import { listApprovedResources } from '@/lib/resourceStore'
import { buildCatalog, itemsChange, newPlaceSubmission, readMessage, type ReadImage } from '@/lib/messageReader'
import { readShulWeek } from '@/lib/shulWeekReading'
import { findMenu, isOrderingApp, readMenu, type MenuSource } from '@/lib/menuReader'
import { readFieldChanges, type FieldRead } from '@/lib/fieldChanges'
import { UUID } from '@/lib/itemMarkRoutes'
import { selectValues } from '@/lib/categories'
import { itemWording } from '@/lib/itemMarks'

// POST /api/message/read   multipart: text, file (up to 3), listingId?, turnstileToken, company
// The "+ Add" box's reader (agreed Oct 5): what someone pastes or
// photographs, read into proposed changes for them to see (messageReader.ts).
// Nothing is saved here but the photos, kept so the admin can check the
// change against them; sending is its own step, and an admin approves
// every change.
//
// Each proposal comes back with what it would do to the listing as it is
// now: the item lines ("+ Chicken, sometimes"), any other field as it would
// be (fieldChanges.ts), and for a shul's times, the week as the guide will
// show it, read by the shul card's own week reader.
// A food place's menu, as a link or in the photos, is read by the Main
// dishes tab's own menu reader (menuReader.ts) and comes back as that
// place's dishes, shaped like a store's items, with `menu` saying where
// they were read (agreed Oct 6: a menu link had been read as a new website).
// `listingId`: the listing the box was opened from, if any.
// `mode=menu` (with listingId): the box opened as "Add their menu" (Oct 10).
// What was sent is that place's menu, so it goes straight to the menu
// reader: a link, a whole menu pasted as text, or photos of it.
//
// A menu that can't be read comes back with `why`, a reason the box words
// and acts on (one line why, one thing that works instead), and the 502
// with `code: 'down'`, so the box can say the reader isn't answering.

/** Why a menu couldn't be read (the box words each one, TellUsSheet). */
export type MenuWhy = 'which_place' | 'one_menu' | 'ordering_app' | 'wont_open' | 'no_dishes' | 'no_source' | 'down'

export const maxDuration = 60

const MAX_BYTES = 5 * 1024 * 1024
const MAX_FILES = 3
const MAX_TIMES = 2
const MAX_MENUS = 1
// Photos, and a PDF (Oct 6): shuls send their schedules as PDF flyers.
const FILE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'])
const BUCKET = 'site-assets'

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'message-read', { limit: 6, windowSec: 300 })
  if (limited) return limited
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return Response.json({ ok: false, code: 'off', error: 'Reading a message isn’t available here.' }, { status: 503 })

  const form = await request.formData().catch(() => null)
  if (!form) return Response.json({ ok: false, error: 'Invalid request.' }, { status: 400 })
  const field = (k: string) => (typeof form.get(k) === 'string' ? (form.get(k) as string) : '')
  if (isHoneypotTripped({ company: field('company') })) return Response.json({ ok: false, error: 'Invalid request.' }, { status: 400 })
  if (!ui.contributions.add && !ui.contributions.edit) return Response.json({ ok: false, error: 'This action is not available.' }, { status: 403 })

  const text = field('text').trim().slice(0, 8000)
  const files = form.getAll('file').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length > MAX_FILES) return Response.json({ ok: false, error: `Please add up to ${MAX_FILES} photos.` }, { status: 400 })
  for (const f of files) {
    if (!FILE_TYPES.has(f.type)) return Response.json({ ok: false, error: 'Please add photos (PNG, JPG or WebP) or a PDF.' }, { status: 400 })
    if (f.size > MAX_BYTES) return Response.json({ ok: false, error: 'That photo is too large. Please keep each under 5MB.' }, { status: 400 })
  }
  if (text.length < 3 && files.length === 0) return Response.json({ ok: false, error: 'Write or paste what you saw, or add a photo.' }, { status: 400 })
  if (!(await verifyTurnstile(field('turnstileToken') || undefined, clientIp(request)))) {
    return Response.json({ ok: false, code: 'turnstile', error: 'Verification failed. Please try again.' }, { status: 403 })
  }

  const community = await resolveCommunity(communitySlugFromRequest(request))
  try {
    const [listings, categories] = await Promise.all([listApprovedResources(community.slug), listCategories(community.slug)])
    const live = categories.filter((c) => c.active !== false)
    const catalog = buildCatalog(listings, live)
    const byId = new Map(listings.map((l) => [l.id, l]))
    const catById = new Map(live.map((c) => [c.id, c]))
    const about = UUID.test(field('listingId')) && byId.has(field('listingId')) ? field('listingId') : undefined
    const menuMode = field('mode') === 'menu'

    const bytes = await Promise.all(files.map(async (f) => ({ mime: f.type, data: await f.arrayBuffer() })))
    const images: ReadImage[] = bytes.map((b) => ({ mime: b.mime, b64: Buffer.from(b.data).toString('base64') }))
    // Kept, so the admin sees the photo beside the change.
    const keepPhotos = async () => {
      const photoUrls: string[] = []
      for (const b of bytes) {
        const path = `message-source/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${b.mime.split('/')[1]}`
        const storage = getAdminClient().storage.from(BUCKET)
        const { error } = await storage.upload(path, b.data, { contentType: b.mime, upsert: false })
        if (!error) photoUrls.push(storage.getPublicUrl(path).data.publicUrl)
        else console.error('[message/read] could not keep the photo:', error.message)
      }
      return photoUrls
    }

    const brief = (id: string) => {
      const l = byId.get(id)!
      return { id, name: l.name, address: l.address, category: l.category, categoryLabel: catById.get(l.category)?.label ?? '' }
    }
    // With what the store lists now, so the box can show it as the listing
    // does, the new ones marked, and know a repeat when someone adds one.
    const linesFor = (id: string, items: Parameters<typeof itemsChange>[2]) => {
      const l = byId.get(id)
      const c = l && catById.get(l.category)
      const change = l && c ? itemsChange(c, l, items) : null
      const tags = c?.detailFields.find((f) => f.type === 'tags')
      const key = tags?.key
      const current = { always: key && l ? selectValues(l[key]) : [], sometimes: key && l ? selectValues(l[`${key}_sometimes`]) : [] }
      // A Food place's list is of dishes, and says so.
      const dishes = !!tags && itemWording(tags).noun === 'dish'
      return change ? { lines: change.lines, held: change.held, current, dishes } : { lines: [], held: [], current, dishes }
    }

    // A change to other fields: each as it would be (the whole week's hours
    // with one day changed), what it was, and the lines it makes.
    const fieldsFor = (id: string, changes: FieldRead[]) => {
      const l = byId.get(id)
      const c = l && catById.get(l.category)
      if (!l || !c) return { values: {}, before: {}, lines: [], held: [], notes: [], askWhen: null }
      const read = readFieldChanges(c, l, changes)
      return { ...read, before: Object.fromEntries(Object.keys(read.values).map((k) => [k, l[k] ?? null])) }
    }

    let timesRead = 0
    let menusRead = 0
    // A menu: where it can be read from, or why it can't.
    // `pasted`: a whole menu sent as text, in the menu box.
    const menuFrom = async (url: string | null, pasted: string | null = null): Promise<MenuSource | MenuWhy> => {
      if (url) {
        if (isOrderingApp(url)) return 'ordering_app'
        return (await findMenu(url)) ?? 'wont_open'
      }
      const pdf = images.find((i) => i.mime === 'application/pdf')
      const photos = images.filter((i) => i.mime !== 'application/pdf')
      if (pdf || photos.length || pasted) return { url: null, text: pasted, pdf: pdf?.b64 ?? null, images: photos }
      return 'no_source'
    }
    const failedMenu = (listingId: string | null, asWritten: string, why: MenuWhy, note: string | null = null) => ({ kind: 'menu', listing: listingId ? brief(listingId) : null, asWritten, why, note })
    // A place's dishes read off its menu, shaped like a store's items.
    const menuProposal = async (l: (typeof listings)[number], asWritten: string, url: string | null, extra: { quote?: string; checked?: boolean } = {}, pasted: string | null = null) => {
      // One menu per message: each is a model call, and a long one.
      if (++menusRead > MAX_MENUS) return failedMenu(l.id, asWritten, 'one_menu')
      try {
        const source = await menuFrom(url, pasted)
        if (typeof source === 'string') return failedMenu(l.id, asWritten, source)
        const read = await readMenu(source, l.name, { apiKey })
        if (read.dishes.length === 0) return failedMenu(l.id, asWritten, 'no_dishes', read.note)
        const items = read.dishes.map((d) => ({ name: d.name, availability: 'always' as const, doubt: null }))
        return {
          kind: 'items',
          listingId: l.id,
          listing: brief(l.id),
          asWritten,
          chain: false,
          ask: null,
          items,
          note: null,
          ...extra,
          menu: { url: read.sourceUrl, dishes: read.dishes },
          ...linesFor(l.id, items),
        }
      } catch (err) {
        console.error('[message/read] menu not read:', err instanceof Error ? err.message : err)
        return failedMenu(l.id, asWritten, 'down')
      }
    }

    // The menu box: what was sent is this place's menu.
    if (menuMode && about) {
      const l = byId.get(about)!
      const link = /^\S+$/.test(text) && /^(https?:\/\/|[\w-]+(\.[\w-]+)+(\/|$))/i.test(text) ? (/^https?:\/\//i.test(text) ? text : `https://${text}`) : null
      const proposal = await menuProposal(l, l.name, link, {}, link ? null : text || null)
      return Response.json({ ok: true, proposals: [proposal], photoUrls: await keepPhotos(), model: null })
    }
    const reading = await readMessage({ text, images }, catalog, { apiKey, communityName: community.name, about })
    const proposals = await Promise.all(
      reading.proposals.map(async (p) => {
        if (p.kind === 'items') {
          return {
            ...p,
            listing: p.listingId ? brief(p.listingId) : null,
            ...(p.listingId ? linesFor(p.listingId, p.items) : { lines: [], held: [] }),
            ask: p.ask ? { ...p.ask, choices: p.ask.choices.map((c) => ({ ...c, listing: brief(c.listingId), ...linesFor(c.listingId, p.items) })) } : null,
          }
        }
        if (p.kind === 'fields') {
          return {
            ...p,
            listing: p.listingId ? brief(p.listingId) : null,
            ...(p.listingId ? fieldsFor(p.listingId, p.changes) : fieldsFor('', [])),
            ask: p.ask ? { ...p.ask, choices: p.ask.choices.map((c) => ({ ...c, listing: brief(c.listingId), ...fieldsFor(c.listingId, p.changes) })) } : null,
          }
        }
        if (p.kind === 'new_place') {
          // "Already in the guide? It's this one": each with its own lines,
          // so picking one shows at once what changes there.
          // `seed`: what was read, as the add form's starting values
          // (name, address, phone, a hechsher the category offers, what it
          // carries), under Google's details once the place is found.
          const cat = p.category ? catById.get(p.category) : undefined
          const seed = cat ? newPlaceSubmission(cat, p.place, p.items).submission : null
          return {
            ...p,
            categoryLabel: cat?.label ?? null,
            seed: seed && { name: seed.name, address: seed.address, phone: seed.phone, ...seed.details },
            maybe: p.maybe.map((id) => ({ ...brief(id), ...linesFor(id, p.items) })),
          }
        }
        if (p.kind === 'ask_others') return { ...p, listing: p.listingId ? brief(p.listingId) : null }
        if (p.kind === 'menu') {
          const l = p.listingId ? byId.get(p.listingId) : undefined
          if (!l) return failedMenu(null, p.asWritten, 'which_place')
          return menuProposal(l, p.asWritten, p.url, { quote: p.quote, checked: p.checked })
        }
        if (p.kind === 'times') {
          const l = byId.get(p.listingId)!
          const key = catById.get(l.category)?.detailFields.find((f) => f.type === 'minyanim')?.key
          // A second reading, by the week reader, for at most two shuls: each
          // costs a model call.
          if (!key || ++timesRead > MAX_TIMES) return { ...p, listing: brief(p.listingId), item: l, minyanimKey: key ?? null, update: null }
          const first = images[0]
          const source = first && !text ? (first.mime === 'application/pdf' ? { pdf: first.b64 } : { image: first.b64, mime: first.mime }) : { text: text || '(see photo)' }
          try {
            const { update } = await readShulWeek(l, key, source, apiKey)
            return { ...p, listing: brief(p.listingId), item: l, minyanimKey: key, update }
          } catch (err) {
            console.error('[message/read] times not read:', err instanceof Error ? err.message : err)
            return { ...p, listing: brief(p.listingId), item: l, minyanimKey: key, update: null }
          }
        }
        return p
      }),
    )

    return Response.json({ ok: true, proposals, photoUrls: await keepPhotos(), model: reading.model })
  } catch (err) {
    console.error('[message/read] failed:', err instanceof Error ? err.message : err)
    return Response.json({ ok: false, code: 'down', error: 'Couldn’t read it right now. Please try again in a minute.' }, { status: 502 })
  }
}
