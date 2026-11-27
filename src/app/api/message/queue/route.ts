import { after } from 'next/server'
import { reportServerError } from '@/lib/serverError'
import { getAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit, clientIp, photoReaderSpend } from '@/lib/rateLimit'
import { isHoneypotTripped } from '@/lib/honeypot'
import { verifyTurnstile } from '@/lib/turnstile'
import { contributionsFor } from '@/lib/uiConfig'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { normalizeEmail } from '@/lib/activity'
import { UUID } from '@/lib/itemMarkRoutes'
import { createSentMessage } from '@/lib/sentMessageStore'
import { readAndFile } from '@/lib/messageFiling'

// POST /api/message/queue   multipart: text, file (up to 3), listingId?, email?, turnstileToken, company
// The "+ Add" box's Send for a post or a photo (Nov 27, board S1b): kept
// as sent, answered at once with its id, and read afterwards, at a higher
// thinking level, into suggestions for an admin (messageFiling.ts). The
// visitor waits on nothing and checks nothing: the admin checks the read.
// The phone keeps the id for "Your updates" on You (/api/updates).
// `listingId`: the listing the box was opened from ("Update ACME"), told to
// the reader as the read route tells it.
//
// The bot check, the per-visitor limit and the readers' daily ceiling are
// taken here, at Send, since the read that costs comes after.

// The read after Send runs in after(), inside this function's time.
export const maxDuration = 300

const MAX_BYTES = 5 * 1024 * 1024
const MAX_FILES = 3
const FILE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'])
const BUCKET = 'site-assets'

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'message-read', { limit: 6, windowSec: 300 })
  if (limited) return limited
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return Response.json({ ok: false, code: 'off', error: 'Sending a post isn’t available here.' }, { status: 503 })

  const form = await request.formData().catch(() => null)
  if (!form) return Response.json({ ok: false, error: 'Invalid request.' }, { status: 400 })
  const field = (k: string) => (typeof form.get(k) === 'string' ? (form.get(k) as string) : '')
  if (isHoneypotTripped({ company: field('company') })) return Response.json({ ok: true, id: null })
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const contributions = contributionsFor(community.ui)
  if (!contributions.add && !contributions.edit) return Response.json({ ok: false, error: 'This action is not available.' }, { status: 403 })

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
  const spend = await photoReaderSpend()
  if (spend) return spend

  try {
    // Kept, so the read has them and the admin sees them beside the change.
    const photoUrls: string[] = []
    for (const f of files) {
      const path = `message-source/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${f.type.split('/')[1]}`
      const storage = getAdminClient().storage.from(BUCKET)
      const { error } = await storage.upload(path, await f.arrayBuffer(), { contentType: f.type, upsert: false })
      if (error) throw new Error(`could not keep the photo: ${error.message}`)
      photoUrls.push(storage.getPublicUrl(path).data.publicUrl)
    }
    const sent = await createSentMessage(community.slug, { text, photoUrls, email: normalizeEmail(field('email')), listingId: UUID.test(field('listingId')) ? field('listingId') : null })
    after(() => readAndFile(community, sent, { apiKey }))
    return Response.json({ ok: true, id: sent.id })
  } catch (err) {
    reportServerError('[message/queue] failed:', err instanceof Error ? err.message : err)
    return Response.json({ ok: false, error: 'That didn’t send. Please try again.' }, { status: 502 })
  }
}
