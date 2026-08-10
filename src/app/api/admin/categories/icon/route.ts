import { revalidatePublicContent } from '@/lib/revalidateContent'
import { getAdminUser } from '@/lib/adminAuth'
import { getAdminClient } from '@/lib/supabase/admin'

// Same bucket the site logo uploads to (see site-settings/logo/route.ts) —
// one public "site-assets" bucket for every admin-uploaded image, just a
// different path prefix per use. Duplicating the bucket-creation logic here
// rather than importing it: this route only needs the bucket to exist, not
// anything else from that module, and the two are small enough that sharing
// a helper would cost more in indirection than it'd save.
const BUCKET = 'site-assets'
const MAX_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'])

async function ensureBucket() {
  const { error } = await getAdminClient().storage.createBucket(BUCKET, { public: true })
  if (error && !/already exists/i.test(error.message)) throw error
}

// POST /api/admin/categories/icon — uploads an image file (multipart
// form-data, field "file") to storage and returns its public URL, for use as
// a category's icon image. Admin only. Doesn't touch the category row
// itself — the editor sets the returned URL on its draft (same as pasting a
// URL), batched into the normal Save changes flow via PATCH
// /api/admin/categories/:id.
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
    const path = `category-icon/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    const { error: uploadError } = await getAdminClient()
      .storage.from(BUCKET)
      .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false })
    if (uploadError) throw uploadError

    const { data } = getAdminClient().storage.from(BUCKET).getPublicUrl(path)
    // The public site caches this content; drop it so the edit shows up.
    await revalidatePublicContent()
    return Response.json({ ok: true, url: data.publicUrl })
  } catch (err) {
    console.error('[admin/categories/icon] upload failed:', err)
    return Response.json({ ok: false, errors: ['Upload failed. Please try again.'] }, { status: 502 })
  }
}
