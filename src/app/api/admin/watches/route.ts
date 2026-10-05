import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { listApprovedResources } from '@/lib/resourceStore'
import { listCategories } from '@/lib/categoryStore'
import { addWatch, getWatch, listWatches, removeWatch, updateWatch } from '@/lib/watchStore'
import { runAndRecord } from '@/lib/watchRunner'
import { kindForUrl, normalizeWatchUrl } from '@/lib/watches'
import { UUID } from '@/lib/itemMarkRoutes'

// GET  /api/admin/watches — the "Watches" tab: every page this community's
//      guide reads on its own (watch, migration 070), and the listings a
//      page can be tied to. Admin only.
// POST /api/admin/watches  body: { action: 'add', url, resourceId?, label? }
//      Watches a new page and checks it once straight away, so the admin
//      sees at once whether the guide can read it.
// POST /api/admin/watches  body: { action: 'check' | 'pause' | 'resume' | 'remove', id }

export const maxDuration = 60

export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const [{ watches, available }, listings, categories] = await Promise.all([
      listWatches(community.slug),
      listApprovedResources(community.slug),
      listCategories(community.slug),
    ])
    const labelOf = new Map(categories.map((c) => [c.id, c.label]))
    return Response.json({
      ok: true,
      available,
      watches,
      listings: listings
        .map((l) => ({ id: l.id, name: l.name, categoryLabel: labelOf.get(l.category) ?? l.category }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    })
  } catch (err) {
    console.error('[admin/watches] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the watches.'] }, { status: 502 })
  }
}

export async function POST(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const action = body?.action

  try {
    if (action === 'add') {
      const url = normalizeWatchUrl(typeof body?.url === 'string' ? body.url : '')
      if (!url) return Response.json({ ok: false, errors: ['That isn’t a web address.'] }, { status: 400 })
      const resourceId = typeof body?.resourceId === 'string' && body.resourceId ? body.resourceId : null
      if (resourceId) {
        const listings = await listApprovedResources(community.slug)
        if (!UUID.test(resourceId) || !listings.some((l) => l.id === resourceId)) {
          return Response.json({ ok: false, errors: ['That listing isn’t in this guide.'] }, { status: 400 })
        }
      }
      const label = typeof body?.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 120) : null
      const added = await addWatch(community.slug, { kind: kindForUrl(url), url, resourceId, label, createdBy: admin.email })
      if (!added) return Response.json({ ok: false, errors: ['The guide already watches that page.'] }, { status: 409 })
      const { watch } = await runAndRecord(added)
      return Response.json({ ok: true, watch })
    }

    const id = typeof body?.id === 'string' ? body.id : ''
    if (!UUID.test(id) || !['check', 'pause', 'resume', 'remove'].includes(String(action))) {
      return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })
    }
    const existing = await getWatch(community.slug, id)
    if (!existing) return Response.json({ ok: false, errors: ['No such watch.'] }, { status: 404 })

    if (action === 'remove') {
      await removeWatch(community.slug, id)
      return Response.json({ ok: true })
    }
    if (action === 'pause' || action === 'resume') {
      await updateWatch(community.slug, id, { active: action === 'resume' })
      return Response.json({ ok: true, watch: { ...existing, active: action === 'resume' } })
    }
    const { watch } = await runAndRecord(existing)
    return Response.json({ ok: true, watch })
  } catch (err) {
    console.error('[admin/watches] POST failed:', err)
    return Response.json({ ok: false, errors: ['Could not save that.'] }, { status: 502 })
  }
}
