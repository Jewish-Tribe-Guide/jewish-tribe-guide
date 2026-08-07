import { revalidatePublicContent } from '@/lib/revalidateContent'
import { getAdminUser } from '@/lib/adminAuth'
import { getAdminClient } from '@/lib/supabase/admin'

// Public bucket that serves uploaded site assets (currently just the logo) —
// created lazily on first upload rather than via a SQL migration, since
// `public: true` is all a bucket needs for its objects to be readable at their
// public URL; no storage.objects RLS policy required. Writes always go through
// the service-role client below, which bypasses RLS regardless.
const BUCKET = 'site-assets'
const MAX_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'])

async function ensureBucket() {
  const { error } = await getAdminClient().storage.createBucket(BUCKET, { public: true })
  // Already exists — the expected case after the first upload. Anything else
  // is a real failure and should surface.
  if (error && !/already exists/i.test(error.message)) throw error
}

// POST /api/admin/site-settings/logo — uploads an image file (multipart
// form-data, field "file") to storage and returns its public URL. Admin only.
// Does NOT touch site_settings itself — the editor sets the returned URL on
// its draft, same as pasting a URL, so it's still batched into the normal
// Save changes flow rather than taking effect immediately.
export async function POST(request: Request) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

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
    return Response.json({ ok: false, errors: ['Please upload a PNG, JPG, WebP, GIF, or SVG image.'] }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ ok: false, errors: ['Image is too large — please keep it under 5MB.'] }, { status: 400 })
  }

  try {
    await ensureBucket()

    const ext = file.type === 'image/svg+xml' ? 'svg' : file.type.split('/')[1]
    const path = `logo/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    const { error: uploadError } = await getAdminClient()
      .storage.from(BUCKET)
      .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false })
    if (uploadError) throw uploadError

    const { data } = getAdminClient().storage.from(BUCKET).getPublicUrl(path)
    // The public site caches this content; drop it so the edit shows up.
    await revalidatePublicContent()
    return Response.json({ ok: true, url: data.publicUrl })
  } catch (err) {
    console.error('[admin/site-settings/logo] upload failed:', err)
    return Response.json({ ok: false, errors: ['Upload failed. Please try again.'] }, { status: 502 })
  }
}
