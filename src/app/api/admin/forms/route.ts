import { getAdminUser } from '@/lib/adminAuth'
import { listFormsForAdmin } from '@/lib/formStore'

// GET /api/admin/forms — every form (published content + any pending draft)
// for the admin Forms manager. Admin only. No POST/DELETE: forms are a fixed
// pair (support, volunteer) defined in the schema, not user-created.
export async function GET(request: Request) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const forms = await listFormsForAdmin()
    return Response.json({ ok: true, forms })
  } catch (err) {
    console.error('[admin/forms] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load forms.'] }, { status: 502 })
  }
}
