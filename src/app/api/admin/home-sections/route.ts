import { revalidatePublicContent } from '@/lib/revalidateContent'
import { getAdminUser } from '@/lib/adminAuth'
import { listHomeSectionsUncached, createHomeSection } from '@/lib/homeSectionStore'
import { getDefaultCommunity } from '@/lib/communityStore'

// GET /api/admin/home-sections — every section, for the admin Sections tab.
// Admin only. The public GET /api/home-sections serves the same data to the
// site; this route exists so the manager can require auth and evolve
// independently.
export async function GET(request: Request) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const sections = await listHomeSectionsUncached((await getDefaultCommunity()).slug)
    return Response.json({ ok: true, sections })
  } catch (err) {
    console.error('[admin/home-sections] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load sections.'] }, { status: 502 })
  }
}

type CreateBody = {
  title?: string
  cardIds?: string[]
}

// POST /api/admin/home-sections — create a new (initially empty, unless
// cardIds is given) section.
export async function POST(request: Request) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  let body: CreateBody
  try {
    body = (await request.json()) as CreateBody
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }

  if (!body.title?.trim()) {
    return Response.json({ ok: false, errors: ['Section title is required.'] }, { status: 400 })
  }

  try {
    const section = await createHomeSection({ title: body.title, cardIds: body.cardIds })
    // The public site caches this content; drop it so the edit shows up.
    await revalidatePublicContent()
    return Response.json({ ok: true, section })
  } catch (err) {
    console.error('[admin/home-sections] POST failed:', err)
    const message = err instanceof Error ? err.message : 'Could not create section.'
    return Response.json({ ok: false, errors: [message] }, { status: 502 })
  }
}
