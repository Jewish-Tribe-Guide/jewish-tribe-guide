import { revalidatePublicContent } from '@/lib/revalidateContent'
import { getAdminUser } from '@/lib/adminAuth'
import { getSiteSettingsUncached, updateSiteSettings } from '@/lib/siteSettingsStore'
import { MAX_MOBILE_TABS, type SiteSettings } from '@/lib/siteSettings'
import { getDefaultCommunity } from '@/lib/communityStore'

// GET /api/admin/site-settings — the current settings, for the admin editor.
// Admin only (same data as the public route, just auth-gated for symmetry
// with the rest of /admin).
export async function GET(request: Request) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const settings = await getSiteSettingsUncached((await getDefaultCommunity()).slug)
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
  if (
    body.mapZoomRadiusMiles !== undefined &&
    body.mapZoomRadiusMiles !== null &&
    (!Number.isFinite(body.mapZoomRadiusMiles) || body.mapZoomRadiusMiles <= 0)
  ) {
    return Response.json({ ok: false, errors: ['The map zoom radius must be a positive number of miles, or left blank.'] }, { status: 400 })
  }
  if (body.mobileTabs !== undefined) {
    const tabs = body.mobileTabs
    if (!Array.isArray(tabs) || tabs.length === 0) {
      return Response.json({ ok: false, errors: ['The mobile tab bar needs at least one tab.'] }, { status: 400 })
    }
    if (tabs.length > MAX_MOBILE_TABS) {
      return Response.json(
        { ok: false, errors: [`The mobile tab bar holds at most ${MAX_MOBILE_TABS} tabs.`] },
        { status: 400 },
      )
    }
    if (tabs.some((t) => !t?.id?.trim() || !t?.label?.trim() || !t?.target?.trim())) {
      return Response.json({ ok: false, errors: ['Every mobile tab needs a label and a destination.'] }, { status: 400 })
    }
    // Two tabs pointing at the same screen would both light up as active — the
    // bar would look broken rather than merely redundant.
    if (new Set(tabs.map((t) => t.target)).size !== tabs.length) {
      return Response.json({ ok: false, errors: ['Two mobile tabs cannot share a destination.'] }, { status: 400 })
    }
  }

  try {
    const settings = await updateSiteSettings((await getDefaultCommunity()).slug, body)
    // The public site caches this content; drop it so the edit shows up.
    await revalidatePublicContent()
    return Response.json({ ok: true, settings })
  } catch (err) {
    console.error('[admin/site-settings] PATCH failed:', err)
    return Response.json({ ok: false, errors: ['Could not save site settings.'] }, { status: 502 })
  }
}
