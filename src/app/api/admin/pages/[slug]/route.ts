import { revalidatePath, revalidateTag } from 'next/cache'
import { getAdminUser } from '@/lib/adminAuth'
import { TAGS } from '@/lib/cacheTags'
import { PAGE_SLUGS, updatePage, type PageSlug } from '@/lib/pagesStore'
import { sanitizeRichText } from '@/lib/richText'
import { listCommunities } from '@/lib/communityStore'
import { routes } from '@/lib/routes'
import { revalidateRouteAfterInFlightRenders } from '@/lib/revalidateAfterInFlightRenders'

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
    // Sanitized here, not only in the editor: the body ends up in
    // dangerouslySetInnerHTML on a page every visitor loads, and this route is
    // reachable with nothing but an admin token and curl. The client
    // sanitizes too, so that the value it holds matches what comes back — but
    // that copy is a convenience, and this one is the control.
    const page = await updatePage(slug, {
      ...body,
      ...(body.body !== undefined ? { body: sanitizeRichText(body.body) } : {}),
    })
    // The public /about and /privacy routes cache this content; drop it so
    // the edit shows up. 'max' keeps serving the stale value while the fresh
    // one regenerates, same as revalidatePublicContent.
    revalidateTag(TAGS.pages, 'max')
    // And the path itself, for every community. The tag already reaches the
    // page's entry (the build-time prerender carries `pages`); what this adds
    // is immediate expiry rather than stale-while-revalidate, so the admin's
    // own next load of the page is the new copy instead of one stale view.
    // It was first added as a fix for e2e-cache's /about HIT/old failure and
    // never was one — that was the race the line below handles.
    //
    // One row, N communities: /about and /privacy live under /[community],
    // so a single edit has to reach every community's own copy of the URL,
    // and revalidatePath takes exactly one path per call.
    //
    // Slug-derived (via routes[slug], not a hand-typed path) because the
    // public route IS the slug — /about, /privacy — and PAGE_SLUGS is the
    // closed set both sides share, so a third page cannot get one and not
    // the other.
    const communities = await listCommunities().catch(() => [])
    for (const c of communities) revalidatePath(routes[slug](c.slug))
    // A regeneration of this page already running when the lines above ran
    // read the old row, and Next stamps its result with the time it finishes
    // — after this invalidation — so it would be served as fresh for days.
    // This invalidates the route again once such a render has had time to
    // finish. Must be the route PATTERN, not routes[slug](c.slug) again: Next
    // drops a revalidation repeated within one request. See the helper.
    revalidateRouteAfterInFlightRenders(routes[slug]('[community]'))
    return Response.json({ ok: true, page })
  } catch (err) {
    console.error('[admin/pages] PATCH failed:', err)
    return Response.json({ ok: false, errors: ['Could not save page.'] }, { status: 502 })
  }
}
