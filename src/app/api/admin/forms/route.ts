import { getAdminUser } from '@/lib/adminAuth'
import { listFormsForAdmin, createForm } from '@/lib/formStore'

// GET /api/admin/forms — every form (published content + any pending draft)
// for the admin Forms manager. Admin only.
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

type CreateBody = { label?: string }

// POST /api/admin/forms — create a new form (published immediately with a
// starter contact step block — see createForm), the admin equivalent of
// "+ New category" for the Forms side of CategoryManager's unified list.
// Admin only.
export async function POST(request: Request) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  let body: CreateBody
  try {
    body = (await request.json()) as CreateBody
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }

  if (!body.label?.trim()) {
    return Response.json({ ok: false, errors: ['Form name is required.'] }, { status: 400 })
  }

  try {
    const form = await createForm(body.label)
    return Response.json({ ok: true, form })
  } catch (err) {
    console.error('[admin/forms] POST failed:', err)
    return Response.json({ ok: false, errors: ['Could not create form.'] }, { status: 502 })
  }
}
