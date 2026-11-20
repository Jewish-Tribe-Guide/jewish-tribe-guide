import { getAdminUser, getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity, type Community } from '@/lib/communityStore'
import { revalidatePublicContent } from '@/lib/revalidateContent'

// ─────────────────────────────────────────────────────────────────────────────
// What every /api/admin route did by hand at its top and bottom: resolve the
// community, check the admin may act on it, and, after a write, throw away
// the public site's cached copy (revalidatePublicContent).
//
// The invalidation used to sit on the success path only, just before the
// 200. A save that wrote and then failed — a category renamed and then its
// update refused, a field's data cleared and then the option rename thrown
// — returned its 502 without it, and the site served the old copy for days
// while the database held the new one. Here it runs in the wrapper, after
// the handler, on everything but a refusal:
//
// - a 2xx, a 5xx, or a throw: invalidated. A 5xx may have written part of
//   the change; invalidating when nothing changed costs a refetch, missing
//   one costs an admin a save that looks lost.
// - a 4xx: not invalidated. By convention a route refuses (bad body, not
//   found, a conflict) before it writes. A route that can write and then
//   refuse has to answer 5xx, or call `revalidatePublicContent` itself.
// - `unchanged(response)`: a 2xx that wrote nothing (a dry run's counts).
//
// The route's own context (`params`) is optional on the wrapped handler, as
// a route is also called directly: by its tests, and by the combined jobs
// read (watches/jobs), with the request alone.
//
// A route that needs more than the blanket invalidation (the pages route's
// own pass, a new community's list) still calls what it needs itself.
// ─────────────────────────────────────────────────────────────────────────────

export type AdminRequestContext = { community: Community; admin: { email: string } }
export type SiteAdminRequestContext = { admin: { email: string } }

const NOT_AUTHORIZED = () => Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

const nothingWritten = new WeakSet<Response>()

/** A success that changed nothing: the wrapper leaves the cache alone. */
export function unchanged(response: Response): Response {
  nothingWritten.add(response)
  return response
}

/** `community`: the one the write was for, so only its pages go stale;
 *  left out (the site owner's routes), every community's. */
async function afterWrite(run: () => Promise<Response>, label: string, community?: string): Promise<Response> {
  const invalidate = () => revalidatePublicContent(community ? { communities: [community] } : {})
  let response: Response
  try {
    response = await run()
  } catch (err) {
    console.error(`[${label}] failed:`, err)
    await invalidate()
    return Response.json({ ok: false, errors: ['Something went wrong. Try again.'] }, { status: 502 })
  }
  const refused = response.status >= 400 && response.status < 500
  if (!refused && !nothingWritten.has(response)) await invalidate()
  return response
}

const labelOf = (request: Request) => `admin ${request.method} ${new URL(request.url).pathname}`

/** A community admin's read: signed in for the community the request names.
 *  Also the wrapper for a write the public site never shows (a watch's
 *  settings, the team, a run started): no invalidation, as before. */
export function adminRead<R extends Request, P>(handler: (request: R, admin: AdminRequestContext, ctx: P) => Promise<Response>) {
  return async (request: R, ctx?: P): Promise<Response> => {
    const community = await resolveCommunity(communitySlugFromRequest(request))
    const admin = await getAdminUserForCommunity(request, community.slug)
    if (!admin) return NOT_AUTHORIZED()
    return handler(request, { community, admin }, ctx as P)
  }
}

/** A community admin's write: `adminRead`, and the public site's cache
 *  thrown away after it (see the top of this file for when). */
export function adminWrite<R extends Request, P>(handler: (request: R, admin: AdminRequestContext, ctx: P) => Promise<Response>) {
  return async (request: R, ctx?: P): Promise<Response> => {
    const community = await resolveCommunity(communitySlugFromRequest(request))
    const admin = await getAdminUserForCommunity(request, community.slug)
    if (!admin) return NOT_AUTHORIZED()
    return afterWrite(() => handler(request, { community, admin }, ctx as P), labelOf(request), community.slug)
  }
}

/** A site owner's read (SUPERADMIN_EMAILS), or a write the public site
 *  never shows: signed in, no community, no invalidation. */
export function siteAdminRead<R extends Request, P>(handler: (request: R, admin: SiteAdminRequestContext, ctx: P) => Promise<Response>) {
  return async (request: R, ctx?: P): Promise<Response> => {
    const admin = await getAdminUser(request)
    if (!admin) return NOT_AUTHORIZED()
    return handler(request, { admin }, ctx as P)
  }
}

/** A site owner's write (SUPERADMIN_EMAILS): the cross-community routes,
 *  which name no community. Invalidates as `adminWrite` does. */
export function siteAdminWrite<R extends Request, P>(handler: (request: R, admin: SiteAdminRequestContext, ctx: P) => Promise<Response>) {
  return async (request: R, ctx?: P): Promise<Response> => {
    const admin = await getAdminUser(request)
    if (!admin) return NOT_AUTHORIZED()
    return afterWrite(() => handler(request, { admin }, ctx as P), labelOf(request))
  }
}
