import { revalidatePublicContent } from '@/lib/revalidateContent'
import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { getSiteSettingsUncached, updateSiteSettings } from '@/lib/siteSettingsStore'
import { MAX_MOBILE_TABS, type DesktopNavItem, type SiteSettings } from '@/lib/siteSettings'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// Recursive shape check — a 'link' item needs a target, a 'more-menu' item
// needs its own valid `items` (never nested further than one level), and
// every item needs a non-empty id/label. Mirrors what
// siteSettingsStore.ts's toDesktopNavItem already tolerates on read, just
// enforced here so a malformed save doesn't silently write junk the reader
// then has to fall back away from.
function validDesktopNavItem(item: unknown, allowNested: boolean): item is DesktopNavItem {
  if (!item || typeof item !== 'object') return false
  const { id, label, kind, target, items } = item as Record<string, unknown>
  if (typeof id !== 'string' || !id.trim() || typeof label !== 'string' || !label.trim()) return false
  if (kind === 'categories-menu') return true
  if (kind === 'link') return typeof target === 'string' && target.trim().length > 0
  if (kind === 'more-menu' && allowNested) {
    return Array.isArray(items) && items.every((i) => validDesktopNavItem(i, false))
  }
  return false
}

function validDesktopNavItems(items: unknown): items is DesktopNavItem[] {
  return Array.isArray(items) && items.length > 0 && items.every((i) => validDesktopNavItem(i, true))
}

// GET /api/admin/site-settings — the current settings, for the admin editor.
// Admin only (same data as the public route, just auth-gated for symmetry
// with the rest of /admin).
export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const settings = await getSiteSettingsUncached(community.slug)
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
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
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
  if (body.searchPlaceholder !== undefined && !body.searchPlaceholder.trim()) {
    return Response.json({ ok: false, errors: ['Search placeholder cannot be empty.'] }, { status: 400 })
  }
  // Every desktop card's eyebrow/heading pair (Browse's own two, plus the
  // five added when the old paired blocks split into independent cards —
  // see homeSections.ts's own doc) — none of these has anywhere sensible to
  // fall back to if saved blank, so all are required the same way.
  const REQUIRED_CARD_TEXT_FIELDS: { key: keyof SiteSettings; label: string }[] = [
    { key: 'desktopBrowseEyebrow', label: 'The Categories and Search card’s eyebrow' },
    { key: 'desktopBrowseHeading', label: 'The Categories and Search card’s heading' },
    { key: 'desktopDaveningEyebrow', label: 'The Davening Times card’s eyebrow' },
    { key: 'desktopDaveningHeading', label: 'The Davening Times card’s heading' },
    { key: 'desktopListingsEyebrow', label: 'The Update Listings card’s eyebrow' },
    { key: 'desktopListingsHeading', label: 'The Update Listings card’s heading' },
    { key: 'desktopMapEyebrow', label: 'The Map card’s eyebrow' },
    { key: 'desktopMapHeading', label: 'The Map card’s heading' },
    { key: 'desktopSubscribeEyebrow', label: 'The Email Signup card’s eyebrow' },
    { key: 'desktopSubscribeHeading', label: 'The Email Signup card’s heading' },
    { key: 'desktopJewishTimesHeading', label: 'The Jewish Times card’s heading' },
  ]
  for (const { key, label } of REQUIRED_CARD_TEXT_FIELDS) {
    const value = body[key]
    if (value !== undefined && !(value as string).trim()) {
      return Response.json({ ok: false, errors: [`${label} cannot be empty.`] }, { status: 400 })
    }
  }
  if (body.desktopHeroHeadline !== undefined && !body.desktopHeroHeadline.trim()) {
    return Response.json({ ok: false, errors: ['The hero headline cannot be empty.'] }, { status: 400 })
  }
  if (body.desktopAccentColor !== undefined && !/^#[0-9a-fA-F]{6}$/.test(body.desktopAccentColor)) {
    return Response.json({ ok: false, errors: ['The accent color must be a 6-digit hex value like #b45309.'] }, { status: 400 })
  }
  if (body.desktopNavItems !== undefined) {
    const items = body.desktopNavItems
    if (!validDesktopNavItems(items)) {
      return Response.json({ ok: false, errors: ['The top nav needs at least one valid item.'] }, { status: 400 })
    }
  }

  try {
    const settings = await updateSiteSettings(community.slug, body)
    // The public site caches this content; drop it so the edit shows up.
    await revalidatePublicContent()
    return Response.json({ ok: true, settings })
  } catch (err) {
    console.error('[admin/site-settings] PATCH failed:', err)
    return Response.json({ ok: false, errors: ['Could not save site settings.'] }, { status: 502 })
  }
}
