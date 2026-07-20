import { getAdminUser } from '@/lib/adminAuth'
import { getSiteSettings, updateSiteSettings } from '@/lib/siteSettingsStore'
import type { SiteSettings } from '@/lib/siteSettings'

// GET /api/admin/site-settings — the current settings, for the admin editor.
// Admin only (same data as the public route, just auth-gated for symmetry
// with the rest of /admin).
export async function GET(request: Request) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const settings = await getSiteSettings()
    return Response.json({ ok: true, settings })
  } catch (err) {
    console.error('[admin/site-settings] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load site settings.'] }, { status: 502 })
  }
}

// PATCH /api/admin/site-settings — update the site's branding text. Takes
// effect immediately (no draft/publish step — this is plain copy, not
// branching structure). Admin only.
export async function PATCH(request: Request) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  let body: Partial<SiteSettings>
  try {
    body = (await request.json()) as Partial<SiteSettings>
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }

  if (body.name !== undefined && !body.name.trim()) {
    return Response.json({ ok: false, errors: ['Site name cannot be empty.'] }, { status: 400 })
  }
  if (body.heroTitle !== undefined && !body.heroTitle.trim()) {
    return Response.json({ ok: false, errors: ['Home screen heading cannot be empty.'] }, { status: 400 })
  }
  if (body.feedbackButtonLabel !== undefined && !body.feedbackButtonLabel.trim()) {
    return Response.json({ ok: false, errors: ['Feedback button label cannot be empty.'] }, { status: 400 })
  }
  if (body.feedbackHeading !== undefined && !body.feedbackHeading.trim()) {
    return Response.json({ ok: false, errors: ['Feedback heading cannot be empty.'] }, { status: 400 })
  }
  if (body.feedbackSuccessMessage !== undefined && !body.feedbackSuccessMessage.trim()) {
    return Response.json({ ok: false, errors: ['Feedback success message cannot be empty.'] }, { status: 400 })
  }

  try {
    const settings = await updateSiteSettings(body)
    return Response.json({ ok: true, settings })
  } catch (err) {
    console.error('[admin/site-settings] PATCH failed:', err)
    return Response.json({ ok: false, errors: ['Could not save site settings.'] }, { status: 502 })
  }
}
