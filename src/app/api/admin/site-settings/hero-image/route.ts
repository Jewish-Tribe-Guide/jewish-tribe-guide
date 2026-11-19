import { adminWrite } from '@/lib/adminRoute'
import { getAdminClient } from '@/lib/supabase/admin'

// Same bucket/mechanism as the logo route (see that file's own doc) — a
// separate route rather than a shared one because the two differ slightly
// (SVG allowed for the logo, not here — a hero photo is a real photograph,
// not a mark that benefits from being vector) and because they store to
// different paths within the bucket (logo/ vs hero/).
const BUCKET = 'site-assets'
const MAX_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

async function ensureBucket() {
  const { error } = await getAdminClient().storage.createBucket(BUCKET, { public: true })
  if (error && !/already exists/i.test(error.message)) throw error
}

// POST /api/admin/site-settings/hero-image?community=<slug> — uploads an
// image file (multipart form-data, field "file") to storage and returns its
// public URL. Admin only, and community-scoped (getAdminUserForCommunity) —
// this used to check the global-only getAdminUser, so a real admin for this
// community but not on the site-wide SUPERADMIN_EMAILS list got a genuine
// 401 the moment they tried to upload or reposition a photo, even though
// every other part of the Site Settings editor worked for them. Does NOT
// touch site_settings itself — the editor sets the returned URL on its
// draft, same as pasting a URL, so it's still batched into the normal Save
// changes flow rather than taking effect immediately.
export const POST = adminWrite(async (request: Request) => {
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
    const path = `hero/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    const { error: uploadError } = await getAdminClient()
      .storage.from(BUCKET)
      .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false })
    if (uploadError) throw uploadError

    const { data } = getAdminClient().storage.from(BUCKET).getPublicUrl(path)
    return Response.json({ ok: true, url: data.publicUrl })
  } catch (err) {
    console.error('[admin/site-settings/hero-image] upload failed:', err)
    return Response.json({ ok: false, errors: ['Upload failed. Please try again.'] }, { status: 502 })
  }
})
