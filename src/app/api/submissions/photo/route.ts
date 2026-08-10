import { getAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit, clientIp } from '@/lib/rateLimit'

// Same bucket every other admin-uploaded image uses (see
// admin/categories/icon/route.ts) — a separate path prefix, not a separate
// bucket. Uses the admin (service-role) Supabase client because there's no
// admin session here to check: this route is public, gated by rate limiting
// instead, same posture as POST /api/submissions itself.
const BUCKET = 'site-assets'
const MAX_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

async function ensureBucket() {
  const { error } = await getAdminClient().storage.createBucket(BUCKET, { public: true })
  if (error && !/already exists/i.test(error.message)) throw error
}

// POST /api/submissions/photo — public endpoint for a listing's own photo
// (see the category editor's "Photo" toggle and CategoryField type 'image').
// Uploads a file (multipart form-data, field "file") and returns its public
// URL; the listing form then carries that URL in its normal submission
// payload like any other detail field — this route never touches the
// resource/submission tables itself, and the upload isn't reviewed
// separately from the rest of the submission.
export async function POST(request: Request) {
  // Uploads are rare compared to page views but each one writes to storage —
  // throttle per IP, more generously than /api/submissions since a listing
  // form only calls this once per photo chosen, not once per full submit.
  const limited = await enforceRateLimit(request, 'submissions-photo', { limit: 20, windowSec: 60 })
  if (limited) return limited

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ ok: false, errors: ['Invalid upload.'] }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return Response.json({ ok: false, errors: ['No file provided.'] }, { status: 400 })
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return Response.json({ ok: false, errors: ['Please upload a PNG, JPG, WebP, or GIF image.'] }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ ok: false, errors: ['Image is too large — please keep it under 5MB.'] }, { status: 400 })
  }

  try {
    await ensureBucket()

    const ext = file.type.split('/')[1]
    const path = `listing-photo/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    const { error: uploadError } = await getAdminClient()
      .storage.from(BUCKET)
      .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false })
    if (uploadError) throw uploadError

    const { data } = getAdminClient().storage.from(BUCKET).getPublicUrl(path)
    return Response.json({ ok: true, url: data.publicUrl })
  } catch (err) {
    console.error('[submissions/photo] upload failed:', err, 'ip:', clientIp(request))
    return Response.json({ ok: false, errors: ['Upload failed. Please try again.'] }, { status: 502 })
  }
}
