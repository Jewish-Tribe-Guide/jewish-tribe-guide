import { revalidatePublicContent } from '@/lib/revalidateContent'
import { getAdminUser } from '@/lib/adminAuth'
import { listFormsForAdmin, createForm } from '@/lib/formStore'
import type { FormContent } from '@/lib/forms'
import { adminCommunityFromRequest } from '@/lib/adminCommunity'

// GET /api/admin/forms — every form (published content + any pending draft)
// for the admin Forms manager. Admin only.
export async function GET(request: Request) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const community = await adminCommunityFromRequest(request)
    const forms = await listFormsForAdmin(community.slug)
    return Response.json({ ok: true, forms })
  } catch (err) {
    console.error('[admin/forms] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load forms.'] }, { status: 502 })
  }
}

// POST /api/admin/forms — create a form with its full content (title, chrome
// text, steps, icon, card background), published immediately. Called only
// from FormEditor's Publish button on a brand-new form — see the comment on
// createForm — so nothing is created (not even a hidden draft row) unless the
// admin actually publishes. Admin only.
export async function POST(request: Request) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  let body: Partial<FormContent>
  try {
    body = (await request.json()) as Partial<FormContent>
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }

  if (!body.title?.trim()) {
    return Response.json({ ok: false, errors: ['Form title is required.'] }, { status: 400 })
  }

  try {
    const community = await adminCommunityFromRequest(request)
    const form = await createForm(community.slug, {
      title: body.title,
      submitLabel: body.submitLabel ?? 'Submit',
      successTitle: body.successTitle ?? 'All set',
      successMessage: body.successMessage ?? 'Thanks — we’ll be in touch.',
      steps: body.steps ?? [],
      icon: body.icon,
      cardImageUrl: body.cardImageUrl,
      cardTextColor: body.cardTextColor,
    })
    // The public site caches this content; drop it so the edit shows up.
    await revalidatePublicContent()
    return Response.json({ ok: true, form })
  } catch (err) {
    console.error('[admin/forms] POST failed:', err)
    return Response.json({ ok: false, errors: ['Could not create form.'] }, { status: 502 })
  }
}
