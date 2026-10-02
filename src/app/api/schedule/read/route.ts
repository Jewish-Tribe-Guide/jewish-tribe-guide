import { community } from '@/community.config'
import { getAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit, clientIp } from '@/lib/rateLimit'
import { isHoneypotTripped } from '@/lib/honeypot'
import { verifyTurnstile } from '@/lib/turnstile'
import { ui } from '@/lib/uiConfig'
import { getResourceById } from '@/lib/resourceStore'
import { fetchFestivals } from '@/lib/festivals'
import { readRegular, readSchedule, type ScheduleSource } from '@/lib/scheduleReader'
import { getCategoryById } from '@/lib/categoryStore'
import { fetchDatesInfo } from '@/lib/dateZmanim'
import { compareTimes } from '@/lib/scheduleUpdate'
import { regularMinyanim } from '@/lib/schedules'
import { currentSeason } from '@/lib/season'

/** `n` dates from `today`, inclusive. */
function datesFrom(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => new Date(Date.parse(`${today}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10))
}
import { UUID } from '@/lib/itemMarkRoutes'

// POST /api/schedule/read   multipart: listingId, festival | kind=regular, turnstileToken, company, and text or file
// "Paste their message, or add a photo" (step 4, the user's idea, agreed
// Oct 1): the AI reads a shul's Yom Tov schedule into times for the person
// to check (scheduleReader.ts). Nothing is saved to the listing here: what
// comes back fills the schedule editor, and the person sends it for an
// admin's check (/api/resource/:id/schedule). A photo or PDF is kept, so
// the admin can check the times against it; its address comes back with
// the reading.
//
// With kind=regular ("Update their times", agreed Oct 1): the shul's
// regular times instead, read and then compared with what the listing has,
// day by day (scheduleUpdate.ts). What comes back is the result to show:
// the shul's times as the guide will show them, each marked.
//
// The festival's days are the calendar's, looked up here by name, never
// the browser's. Each read costs a model call: the bot check, and a tight
// limit.

export const maxDuration = 60

const MAX_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const BUCKET = 'site-assets'

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'schedule-read', { limit: 6, windowSec: 300 })
  if (limited) return limited
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return Response.json({ ok: false, code: 'off', error: 'Reading a schedule isn’t available here. Type the times in instead.' }, { status: 503 })

  const form = await request.formData().catch(() => null)
  if (!form) return Response.json({ ok: false, error: 'Invalid request.' }, { status: 400 })
  const field = (k: string) => (typeof form.get(k) === 'string' ? (form.get(k) as string) : '')
  if (isHoneypotTripped({ company: field('company') })) return Response.json({ ok: false, error: 'Invalid request.' }, { status: 400 })
  if (!(await verifyTurnstile(field('turnstileToken') || undefined, clientIp(request)))) {
    return Response.json({ ok: false, code: 'turnstile', error: 'Verification failed. Please try again.' }, { status: 403 })
  }
  if (!ui.contributions.edit) return Response.json({ ok: false, error: 'This action is not available.' }, { status: 403 })

  // The listing's own community, from the row: a live one only.
  const listingId = field('listingId')
  const { data: row } = UUID.test(listingId)
    ? await getAdminClient().from('resource').select('community_id').eq('id', listingId).eq('status', 'approved').maybeSingle<{ community_id: string }>()
    : { data: null }
  const listing = row ? await getResourceById(listingId, row.community_id) : null
  if (!listing) return Response.json({ ok: false, error: 'Not found.' }, { status: 404 })

  const text = field('text').trim()
  const file = form.get('file')
  let source: ScheduleSource
  let bytes: ArrayBuffer | null = null
  let mime = ''
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return Response.json({ ok: false, error: 'That file is too large. Please keep it under 5MB.' }, { status: 400 })
    mime = file.type
    bytes = await file.arrayBuffer()
    const b64 = Buffer.from(bytes).toString('base64')
    if (IMAGE_TYPES.has(mime)) source = { image: b64, mime }
    else if (mime === 'application/pdf') source = { pdf: b64 }
    else return Response.json({ ok: false, error: 'Please add a photo (PNG, JPG, WebP) or a PDF.' }, { status: 400 })
  } else if (text.length >= 10) {
    source = { text: text.slice(0, 8000) }
  } else {
    return Response.json({ ok: false, error: 'Paste their message, or add a photo of it.' }, { status: 400 })
  }

  try {
    let result: Record<string, unknown>
    if (field('kind') === 'regular') {
      // "Update their times": the shul's regular times, compared with what
      // the guide has (scheduleUpdate.ts).
      const category = await getCategoryById(row!.community_id, listing.category)
      const minyanimField = category?.detailFields.find((f) => f.type === 'minyanim')
      if (!minyanimField) return Response.json({ ok: false, error: 'Not found.' }, { status: 404 })
      const now = Date.now()
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: community.timezone }).format(new Date(now))
      const coords = listing.geo ?? community.mapCenter
      const ahead = await fetchDatesInfo({ latitude: coords.lat, longitude: coords.lng, timezone: community.timezone }, today, datesFrom(today, 21).at(-1)!)
      const days = { today, days: datesFrom(today, 21).map((date) => ({ date, names: ahead.names[date] ?? [] })) }
      const reading = await readRegular(source, days, listing.name, { apiKey })
      const update = compareTimes(regularMinyanim(listing[minyanimField.key]), reading, { season: currentSeason(now, community.timezone), zmanim: ahead.zmanim })
      result = { update, model: reading.model }
    } else {
      const festivals = await fetchFestivals(community.timezone)
      const festival = festivals.find((f) => f.name === field('festival')) ?? festivals.find((f) => f.festival === field('festival'))
      if (!festival) return Response.json({ ok: false, error: 'That Yom Tov isn’t coming up.' }, { status: 400 })
      result = await readSchedule(source, festival, listing.name, { apiKey })
    }

    // Kept for the admin to check the times against.
    let sourceUrl: string | null = null
    if (bytes) {
      const ext = mime === 'application/pdf' ? 'pdf' : mime.split('/')[1]
      const path = `schedule-source/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`
      const storage = getAdminClient().storage.from(BUCKET)
      const { error } = await storage.upload(path, bytes, { contentType: mime, upsert: false })
      if (!error) sourceUrl = storage.getPublicUrl(path).data.publicUrl
      else console.error('[schedule/read] could not keep the file:', error.message)
    }
    return Response.json({ ok: true, ...result, sourceUrl })
  } catch (err) {
    console.error('[schedule/read] failed:', err instanceof Error ? err.message : err)
    return Response.json({ ok: false, error: 'Couldn’t read it right now. Type the times in instead, or try again.' }, { status: 502 })
  }
}
