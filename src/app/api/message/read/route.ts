import { getAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit, clientIp } from '@/lib/rateLimit'
import { isHoneypotTripped } from '@/lib/honeypot'
import { verifyTurnstile } from '@/lib/turnstile'
import { ui } from '@/lib/uiConfig'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { listCategories } from '@/lib/categoryStore'
import { listApprovedResources } from '@/lib/resourceStore'
import { buildCatalog, itemsChange, readMessage, type ReadImage } from '@/lib/messageReader'
import { readShulWeek } from '@/lib/shulWeekReading'
import { UUID } from '@/lib/itemMarkRoutes'

// POST /api/message/read   multipart: text, file (up to 3), listingId?, turnstileToken, company
// The "+ Add" box's reader (agreed Oct 5): what someone pastes or
// photographs, read into proposed changes for them to see (messageReader.ts).
// Nothing is saved here but the photos, kept so the admin can check the
// change against them; sending is its own step, and an admin approves
// every change.
//
// Each proposal comes back with what it would do to the listing as it is
// now: the item lines ("+ Chicken, sometimes"), and for a shul's times, the
// week as the guide will show it, read by the shul card's own week reader.
// `listingId`: the listing the box was opened from, if any.

export const maxDuration = 60

const MAX_BYTES = 5 * 1024 * 1024
const MAX_FILES = 3
const MAX_TIMES = 2
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
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
    if (!IMAGE_TYPES.has(f.type)) return Response.json({ ok: false, error: 'Please add photos (PNG, JPG or WebP).' }, { status: 400 })
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

    const bytes = await Promise.all(files.map(async (f) => ({ mime: f.type, data: await f.arrayBuffer() })))
    const images: ReadImage[] = bytes.map((b) => ({ mime: b.mime, b64: Buffer.from(b.data).toString('base64') }))
    const reading = await readMessage({ text, images }, catalog, { apiKey, communityName: community.name, about })

    const brief = (id: string) => {
      const l = byId.get(id)!
      return { id, name: l.name, address: l.address, category: l.category, categoryLabel: catById.get(l.category)?.label ?? '' }
    }
    const linesFor = (id: string, items: Parameters<typeof itemsChange>[2]) => {
      const l = byId.get(id)
      const c = l && catById.get(l.category)
      const change = l && c ? itemsChange(c, l, items) : null
      return change ? { lines: change.lines, held: change.held } : { lines: [], held: [] }
    }

    let timesRead = 0
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
        if (p.kind === 'new_place') return { ...p, categoryLabel: p.category ? catById.get(p.category)?.label ?? null : null, maybe: p.maybe.map(brief) }
        if (p.kind === 'ask_others') return { ...p, listing: p.listingId ? brief(p.listingId) : null }
        if (p.kind === 'times') {
          const l = byId.get(p.listingId)!
          const key = catById.get(l.category)?.detailFields.find((f) => f.type === 'minyanim')?.key
          // A second reading, by the week reader, for at most two shuls: each
          // costs a model call.
          if (!key || ++timesRead > MAX_TIMES) return { ...p, listing: brief(p.listingId), update: null }
          const source = images[0] && !text ? { image: images[0].b64, mime: images[0].mime } : { text: text || '(see photo)' }
          try {
            const { update } = await readShulWeek(l, key, source, apiKey)
            return { ...p, listing: brief(p.listingId), update }
          } catch (err) {
            console.error('[message/read] times not read:', err instanceof Error ? err.message : err)
            return { ...p, listing: brief(p.listingId), update: null }
          }
        }
        return p
      }),
    )

    // Kept, so the admin sees the photo beside the change.
    const photoUrls: string[] = []
    for (const b of bytes) {
      const path = `message-source/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${b.mime.split('/')[1]}`
      const storage = getAdminClient().storage.from(BUCKET)
      const { error } = await storage.upload(path, b.data, { contentType: b.mime, upsert: false })
      if (!error) photoUrls.push(storage.getPublicUrl(path).data.publicUrl)
      else console.error('[message/read] could not keep the photo:', error.message)
    }

    return Response.json({ ok: true, proposals, photoUrls, model: reading.model })
  } catch (err) {
    console.error('[message/read] failed:', err instanceof Error ? err.message : err)
    return Response.json({ ok: false, error: 'Couldn’t read it right now. Please try again in a minute.' }, { status: 502 })
  }
}
