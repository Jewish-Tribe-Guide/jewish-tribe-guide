import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { addEruv, approveLine, listEruvimForAdmin, removeEruv, saveLineRead, saveStatusRead, updateEruv, type AdminEruv } from '@/lib/eruvStore'
import { readEruvPage } from '@/lib/eruvReader'
import { runLine } from '@/lib/eruvLines'
import { readEruvEdit, eruvIdFor } from '@/lib/eruvEdit'

// GET  /api/admin/eruvim — the "Eruvim" tab: every eruv of this community
//      (eruv, migration 074), hidden ones too, with its status, its line
//      and any new line waiting. Admin only.
// POST /api/admin/eruvim  body: { action: 'save', id, edit } | { action: 'add', name }
//      | { action: 'remove' | 'check' | 'approve-line', id }
//      'check' reads its status page and its line now; 'approve-line' puts
//      the waiting line on the map.

export const maxDuration = 60

const notAuthorized = () => Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  if (!(await getAdminUserForCommunity(request, community.slug))) return notAuthorized()
  try {
    const { eruvim, available } = await listEruvimForAdmin(community.slug)
    return Response.json({ ok: true, available, timezone: community.timezone, eruvim })
  } catch (err) {
    console.error('[admin/eruvim] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the eruvim.'] }, { status: 502 })
  }
}

async function one(community: string, id: string): Promise<AdminEruv | null> {
  return (await listEruvimForAdmin(community)).eruvim.find((e) => e.id === id) ?? null
}

export async function POST(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return notAuthorized()

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const action = body?.action
  const id = typeof body?.id === 'string' ? body.id : ''
  const bad = (msg: string) => Response.json({ ok: false, errors: [msg] }, { status: 400 })

  try {
    if (action === 'add') {
      const name = typeof body?.name === 'string' ? body.name.trim() : ''
      const newId = eruvIdFor(name)
      if (!name || !newId) return bad('Give the eruv a name.')
      if (!(await addEruv(community.slug, newId, { name, sortOrder: 99 }))) return bad('There’s already an eruv by that name.')
      return Response.json({ ok: true, eruv: await one(community.slug, newId) })
    }

    const eruv = id ? await one(community.slug, id) : null
    if (!eruv) return bad('No such eruv.')

    if (action === 'save') {
      const read = readEruvEdit(body?.edit)
      if (!read.ok) return bad(read.error)
      await updateEruv(community.slug, id, read.edit)
      return Response.json({ ok: true, eruv: await one(community.slug, id) })
    }
    if (action === 'remove') {
      await removeEruv(community.slug, id)
      return Response.json({ ok: true })
    }
    if (action === 'check') {
      const now = new Date()
      if (eruv.statusUrl) await saveStatusRead(community.slug, id, await readEruvPage(eruv.statusUrl, now))
      const { save } = await runLine(eruv, { due: true, now })
      if (save) await saveLineRead(community.slug, id, save)
      return Response.json({ ok: true, eruv: await one(community.slug, id) })
    }
    if (action === 'approve-line') {
      if (!(await approveLine(community.slug, id, admin.email))) return bad('There’s no new line waiting.')
      return Response.json({ ok: true, eruv: await one(community.slug, id) })
    }
    return bad('Unknown action.')
  } catch (err) {
    console.error('[admin/eruvim] POST failed:', err)
    return Response.json({ ok: false, errors: ['Could not save that.'] }, { status: 502 })
  }
}
