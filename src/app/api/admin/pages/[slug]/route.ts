import { revalidateTag } from 'next/cache'
import { getAdminUser } from '@/lib/adminAuth'
import { TAGS } from '@/lib/cacheTags'
import { PAGE_SLUGS, updatePage, type PageSlug } from '@/lib/pagesStore'

function isPageSlug(slug: string): slug is PageSlug {
  return (PAGE_SLUGS as string[]).includes(slug)
}

// PATCH /api/admin/pages/[slug] — update a static page's title/body. Takes
// effect immediately (no draft/publish step, same reasoning as site-settings
// — this is plain copy). Admin only.
export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const { slug } = await params
  if (!isPageSlug(slug)) {
    return Response.json({ ok: false, errors: ['Unknown page.'] }, { status: 404 })
  }

  let body: { title?: string; body?: string }
  try {
    body = (await request.json()) as { title?: string; body?: string }
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }

  if (body.title !== undefined && !body.title.trim()) {
    return Response.json({ ok: false, errors: ['Page title cannot be empty.'] }, { status: 400 })
  }

  try {
    const page = await updatePage(slug, body)
    // The public /about and /privacy routes cache this content; drop it so
    // the edit shows up. 'max' keeps serving the stale value while the fresh
    // one regenerates, same as revalidatePublicContent.
    revalidateTag(TAGS.pages, 'max')
    return Response.json({ ok: true, page })
  } catch (err) {
    console.error('[admin/pages] PATCH failed:', err)
    return Response.json({ ok: false, errors: ['Could not save page.'] }, { status: 502 })
  }
}
