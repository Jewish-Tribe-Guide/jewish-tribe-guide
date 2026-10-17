import { after } from 'next/server'
import { enforceRateLimit, clientIp } from '@/lib/rateLimit'
import { isHoneypotTripped } from '@/lib/honeypot'
import { verifyTurnstile } from '@/lib/turnstile'
import { ui } from '@/lib/uiConfig'
import { resolveCapabilities } from '@/lib/categories'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { listCategories } from '@/lib/categoryStore'
import { listApprovedResources } from '@/lib/resourceStore'
import { submitListingCreate, submitListingUpdate } from '@/lib/submissionStore'
import { sendSubmissionNotification } from '@/lib/email'
import { normalizeEmail } from '@/lib/activity'
import { payloadTooLarge } from '@/lib/limits'
import { itemWording } from '@/lib/itemMarks'
import { itemsChange, messageSource, newPlaceSubmission, sentItems, sentPlace } from '@/lib/messageReader'
import { fieldsEdit } from '@/lib/fieldChanges'
import { validateSubmission } from '@/lib/resourceStore'
import { SERVER_ONLY_PAYLOAD_KEYS } from '@/lib/submissionSource'
import { normalizeUrl } from '@/lib/validation'
import type { ResourceSubmission, SubmissionRow } from '@/types'

// POST /api/message/send   { text, photoUrls, stores: [{ listingId, items, menu? }], edits: [{ listingId, values, notes }], places: [{ category, place, items }], forms: [{ submission }], email?, turnstileToken, company }
// The "+ Add" box's Send (agreed Oct 5): what the person saw after the
// reader (/api/message/read), filed as ordinary suggestions for an admin,
// one per store or place, each labelled "Read by AI" with the message or
// photo it came from (submissionSource.ts), so the queue's opened card
// shows it beside the change.
//
// Nothing is taken on trust from the browser: the listing is read here,
// and the change worked out again from it (itemsChange, fieldsEdit), the
// way the shul card's times route does. A store with nothing left to change
// files nothing, unless there's a note the guide can't hold as a field
// ("closes early this Wednesday only"), which goes to the admin as one.
// A shul's times go through that card's own route.
//
// A store's `menu` ({ url }, url null for photos): its dishes were read off
// its menu. Filed saying so, and approved dated "on its menu" with the link
// for "Full menu" (submissionStore.ts), as the Main dishes tab does. Only
// for a category that lists dishes.
//
// `forms`: a new place the reader found, filled in by the person with the
// add form (Google's details and the category's questions). Taken as the
// public submissions route takes a new listing, checked the same way, and
// filed with what it was read from.

const MAX_STORES = 10
const MAX_NOTES = 10

/** Notes for the admin beside an edit, as the box sent them: short text. */
function sentNotes(v: unknown): string[] {
  return (Array.isArray(v) ? v : []).filter((n): n is string => typeof n === 'string' && !!n.trim()).slice(0, MAX_NOTES).map((n) => n.trim().slice(0, 500))
}
const FAILED = { ok: false, error: 'That didn’t send. Please try again.' }

/** Where a store's dishes were read: its menu's link (null for photos of
 *  it), or nothing when they weren't read off a menu. */
function sentMenu(v: unknown): { url: string | null } | null {
  if (!v || typeof v !== 'object') return null
  const url = (v as Record<string, unknown>).url
  if (url === null) return { url: null }
  return typeof url === 'string' && /^https?:\/\/\S+$/i.test(url) && url.length <= 500 ? { url } : null
}

/** A photo the reader kept, in the guide's own storage, never any other
 *  address. */
function keptPhoto(url: unknown): url is string {
  const kept = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/site-assets/message-source/`
  return typeof url === 'string' && url.startsWith(kept) && /^[\w.-]+$/.test(url.slice(kept.length))
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'submissions', { limit: 10, windowSec: 60 })
  if (limited) return limited
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return Response.json({ ok: false, error: 'Invalid request.' }, { status: 400 })
  const tooBig = payloadTooLarge(body)
  if (tooBig) return Response.json({ ok: false, error: tooBig }, { status: 413 })
  if (isHoneypotTripped(body)) return Response.json({ ok: true, filed: 0 })
  if (!(await verifyTurnstile(typeof body.turnstileToken === 'string' ? body.turnstileToken : undefined, clientIp(request)))) {
    return Response.json({ ok: false, code: 'turnstile', error: 'Verification failed. Please try again.' }, { status: 403 })
  }

  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 8000) : ''
  const photoUrls = (Array.isArray(body.photoUrls) ? body.photoUrls : []).filter(keptPhoto).slice(0, 3)
  const email = normalizeEmail(body.email)
  const submittedBy = email ? { email } : null
  const source = messageSource(text, photoUrls)
  const stores = (Array.isArray(body.stores) ? body.stores : []).slice(0, MAX_STORES) as Record<string, unknown>[]
  const places = (Array.isArray(body.places) ? body.places : []).slice(0, MAX_STORES) as Record<string, unknown>[]
  const edits = (Array.isArray(body.edits) ? body.edits : []).slice(0, MAX_STORES) as Record<string, unknown>[]
  const forms = (Array.isArray(body.forms) ? body.forms : []).slice(0, MAX_STORES) as Record<string, unknown>[]
  if (stores.length + places.length + edits.length + forms.length === 0) return Response.json({ ok: false, error: 'Nothing to send.' }, { status: 400 })

  const community = await resolveCommunity(communitySlugFromRequest(request))
  try {
    const [listings, categories] = await Promise.all([listApprovedResources(community.slug), listCategories(community.slug)])
    const byId = new Map(listings.map((l) => [l.id, l]))
    const catById = new Map(categories.filter((c) => c.active !== false).map((c) => [c.id, c]))
    const filed: SubmissionRow[] = []

    for (const s of stores) {
      const listing = typeof s.listingId === 'string' ? byId.get(s.listingId) : undefined
      const category = listing && catById.get(listing.category)
      if (!listing || !category) continue
      if (!ui.contributions.edit || !resolveCapabilities(category.capabilities).edit) continue
      const change = itemsChange(category, listing, sentItems(s.items))
      if (!change || change.lines.length === 0) continue
      const tags = category.detailFields.find((f) => f.type === 'tags')
      const menu = tags && itemWording(tags).noun === 'dish' ? sentMenu(s.menu) : null
      const from = menu ? (menu.url ? `Read from its menu: ${menu.url}` : 'Read from photos of its menu.') : null
      const note = ['From a message sent with “Tell us”.', ...(from ? [from] : []), change.lines.join('\n'), ...(change.held.length ? [`Not changed:\n${change.held.join('\n')}`] : [])].join('\n\n')
      filed.push(await submitListingUpdate(community.slug, listing.id, Object.assign({}, change.submission, { source: menu ? { ...source, menu } : source }), note, submittedBy))
    }

    for (const e of edits) {
      const listing = typeof e.listingId === 'string' ? byId.get(e.listingId) : undefined
      const category = listing && catById.get(listing.category)
      if (!listing || !category) continue
      if (!ui.contributions.edit || !resolveCapabilities(category.capabilities).edit) continue
      const { submission, lines } = fieldsEdit(category, listing, e.values)
      const notes = sentNotes(e.notes)
      if (lines.length === 0 && notes.length === 0) continue
      const note = ['From a message sent with “Tell us”.', lines.join('\n'), notes.length ? `For the admin:\n${notes.join('\n')}` : ''].filter(Boolean).join('\n\n')
      filed.push(await submitListingUpdate(community.slug, listing.id, Object.assign({}, submission, { source }), note, submittedBy))
    }

    for (const p of places) {
      const category = typeof p.category === 'string' ? catById.get(p.category) : undefined
      const place = sentPlace(p.place)
      if (!category || !place) continue
      if (!ui.contributions.add || !resolveCapabilities(category.capabilities).add) continue
      const { submission, note } = newPlaceSubmission(category, place, sentItems(p.items))
      filed.push(
        await submitListingCreate(
          community.slug,
          Object.assign({}, submission, { submittedBy: submittedBy ?? undefined, source }),
          ['A new place, from a message sent with “Tell us”.', note].filter(Boolean).join('\n\n'),
        ),
      )
    }

    for (const f of forms) {
      const submission = (f.submission && typeof f.submission === 'object' ? f.submission : null) as ResourceSubmission | null
      if (!submission) continue
      for (const k of SERVER_ONLY_PAYLOAD_KEYS) delete (submission as Record<string, unknown>)[k]
      const category = catById.get(submission.category)
      if (!category || !ui.contributions.add || !resolveCapabilities(category.capabilities).add) {
        return Response.json({ ok: false, errors: ['This action is not available for this category.'] }, { status: 403 })
      }
      for (const field of category.detailFields) {
        const raw = submission.details?.[field.key]
        if (field.type === 'url' && typeof raw === 'string' && raw.trim()) submission.details[field.key] = normalizeUrl(raw)
      }
      const errors = validateSubmission(submission, category)
      if (errors.length) return Response.json({ ok: false, errors }, { status: 400 })
      filed.push(
        await submitListingCreate(
          community.slug,
          Object.assign({}, submission, { submittedBy: submittedBy ?? undefined, source }),
          'A new place, read from a message sent with “Tell us” and filled in by them.',
        ),
      )
    }

    after(async () => {
      for (const s of filed) await sendSubmissionNotification(s).catch((err) => console.error('[message/send] Admin notification failed:', err))
    })
    // The ids, for the email asked once at the end (/api/message/email).
    return Response.json({ ok: true, filed: filed.length, ids: filed.map((f) => f.id) })
  } catch (err) {
    console.error('[message/send] could not file:', err)
    return Response.json(FAILED, { status: 502 })
  }
}
