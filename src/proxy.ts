import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  COMMUNITY_COOKIE,
  CONFIG_COMMUNITY_SLUG,
  looksLikeCommunitySlug,
} from '@/lib/configCommunity'
import { listCommunityVisibility } from '@/lib/communityStore'
import { createVisibilityLoader } from '@/lib/visibilityLoader'
import { previewCookieName, previewCookieOptions } from '@/lib/previewCookie'
import { friendlyListingPath, parseBareListingLink } from '@/lib/bareListingLink'
import { NO_ADDRESSES, isKnownAddress, loadKnownAddresses } from '@/lib/knownAddresses'

// ─────────────────────────────────────────────────────────────────────────────
// Redirects "/" to a community.
//
// This lived in app/page.tsx, and the end-to-end suite caught that it had
// stopped being a real redirect. Cache Components requires runtime APIs —
// cookies here — to sit inside a <Suspense> boundary, and by the time a
// suspended component resolves, the 200 and the document shell have already
// been flushed. So the redirect could only be emitted into the stream for the
// browser to carry out: `curl /` returned 200 and a full HTML page.
//
// That defeated the entire reason the community preference is a cookie rather
// than localStorage — a crawler or a WhatsApp link preview, neither of which
// runs JavaScript, saw no redirect at all. "/" is the most-linked URL a site
// has, so this is the one that most needs to be right.
//
// The proxy runs before any rendering, so it can answer with a genuine 307 and
// no page is rendered at all.
// ─────────────────────────────────────────────────────────────────────────────

function redirectRoot(request: NextRequest) {
  const remembered = request.cookies.get(COMMUNITY_COOKIE)?.value

  // A shape check only. This part of the proxy deliberately doesn't reach the
  // database — it's the one path every single request without exception hits
  // — so a slug that looks fine but names a community that has since been
  // removed will 404 at the route. That's the right answer for a stale link,
  // and visiting any real community rewrites the cookie.
  const slug =
    remembered && looksLikeCommunitySlug(remembered) ? remembered : CONFIG_COMMUNITY_SLUG

  const url = new URL(`/${slug}`, request.url)
  // Carry the query string through. A dropped param is a silent failure, and
  // this used to lose `?preview=1` from the admin's preview frame.
  url.search = request.nextUrl.search

  // 307 (temporary). It was a 308 for search engines' sake, but where "/"
  // goes depends on the visitor's remembered community, and a browser keeps
  // a permanent redirect without asking again: a visitor who switched to
  // another community kept landing on the old one from "/" (Nov 18, item 38
  // of the public review). The answer changes per visitor, so it can't be
  // permanent.
  return NextResponse.redirect(url, 307)
}

// ─────────────────────────────────────────────────────────────────────────────
// Gating a hidden community's PUBLIC URL — not its admin console.
//
// visible=false (see the community-visibility migration) only ever removed a
// community from the switcher/sitemap — the plain /slug URL still rendered
// normally for anyone who had it, which isn't obscure enough to build a
// community out on the real database before announcing it. This makes /slug
// (and everything under it) not work without `?access=<token>` (or the
// cookie that sets), for anyone but a holder of the link CommunityManager
// shows a superadmin.
//
// /slug/admin is deliberately EXEMPT: unlike the public site, it's already
// behind real authentication (the community's own admin_email, checked by
// adminAuth.ts once someone actually signs in) — a second, obscurity-based
// gate in front of it would only add friction for the admin building the
// community out, not real protection, since anyone who could pass it would
// still need real admin credentials to do anything. "Publish" is meant to
// answer one question — is this on the public site yet — not to also decide
// whether its own admin can reach the console that builds it.
//
// This DOES reach the database, unlike the root redirect above — a real
// departure from this file's original "proxy never touches the database"
// design, made deliberately: gating has to happen before the route renders
// (a layout can't read the query string at all — only page.tsx can — and
// reading cookies() there would force Cache Components to stop prerendering
// EVERY community, including the two live ones, just to protect the rare
// hidden one). The cost is bounded rather than paid per-request: results are
// cached in-process for VISIBILITY_CACHE_MS, so this is one query per cache
// window per instance, not one per request — and it's skipped
// entirely for any path that isn't shaped like /<community-slug>/....
// ─────────────────────────────────────────────────────────────────────────────

const ACCESS_PARAM = 'access'
const VISIBILITY_CACHE_MS = 30_000
// After a failed refresh: how long before trying again. Short, so a blip heals
// in seconds instead of holding an old (or empty) answer for a full window.
const VISIBILITY_RETRY_MS = 5_000

// See visibilityLoader.ts. The failure policy, in one place: a failed refresh
// keeps serving the last good answer; only a process that has NEVER loaded one
// fails open. That last case is deliberate — getAdminClient() throws
// synchronously on a missing Supabase env var (a real state on a fresh preview
// deployment), and that exception once reached all the way out of the proxy
// and broke EVERY path on the site (ERR_INVALID_RESPONSE), not just a hidden
// community's. The one thing this gate must never do is take down traffic it
// isn't even meant to affect. A misconfigured deployment loses the visibility
// gate, not the site.
const loadVisibility = createVisibilityLoader({
  load: listCommunityVisibility,
  empty: {} as Awaited<ReturnType<typeof listCommunityVisibility>>,
  ttlMs: VISIBILITY_CACHE_MS,
  retryMs: VISIBILITY_RETRY_MS,
  onError: (err) => console.error('[proxy] community visibility refresh failed:', err),
})

async function getVisibility(slug: string) {
  return (await loadVisibility())[slug] ?? null
}

// /admin and /inbox never reach here at all — the matcher below excludes
// them outright, since a community slug can never collide with either
// (assertUsableSlug's reserved-word list blocks that at creation time).
async function gateCommunityPath(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const segment = pathname.slice(1).split('/', 1)[0]
  if (!looksLikeCommunitySlug(segment)) return null

  // /slug/admin (and everything under it) is real routes rewritten from
  // /admin/[community]/... (see next.config.ts's own rewrite) — always
  // reachable regardless of visibility; see this section's comment above.
  if (pathname === `/${segment}/admin` || pathname.startsWith(`/${segment}/admin/`)) return null

  const entry = await getVisibility(segment)
  if (!entry || entry.visible) return null // unknown slug: let the route 404 itself

  const fromQuery = request.nextUrl.searchParams.get(ACCESS_PARAM)
  const fromCookie = request.cookies.get(previewCookieName(segment))?.value
  const authorized = fromQuery === entry.previewToken || fromCookie === entry.previewToken
  if (!authorized) {
    // A null body reproduced as a clean 404 against `next dev` locally, but
    // came back as ERR_INVALID_RESPONSE on an actual Vercel deployment — a
    // real gap between the local Node dev server and Vercel's own runtime
    // wrapper around the proxy response. An explicit body and content-type
    // sidesteps whatever ambiguity a null body left for Vercel's layer.
    return new NextResponse('Not found.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  }

  if (fromQuery === entry.previewToken && fromCookie !== entry.previewToken) {
    const response = NextResponse.next()
    response.cookies.set(previewCookieName(segment), entry.previewToken, previewCookieOptions())
    return response
  }
  return null
}

// ── The public API routes, for a hidden community (Nov 20) ──
// The pages were gated and the data behind them wasn't: every public API
// route takes its community as ?community=, so /api/resources?community=
// <hidden> handed over a hidden guide's listings to anyone who guessed its
// slug. Same rule as the pages: the community's preview cookie (set by its
// preview link, or by its own admin console through /api/admin/whoami) or
// nothing. The cookie is path "/" for this (previewCookie.ts).
//
// Not gated: /api/admin (real sign-in), /api/cron (its secret),
// /api/inbound (a signed webhook), /api/inbox (a signed link); the matcher
// below keeps them out of the proxy altogether. A route reached by a
// listing's id (/api/resource/<id>/…) needs that id, which the gate keeps.
const UNGATED_API = /^\/api\/(admin|cron|inbound|inbox)(\/|$)/

async function gateCommunityApi(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl
  if (UNGATED_API.test(pathname)) return null
  const slug = searchParams.get('community')
  if (!slug || !looksLikeCommunitySlug(slug)) return null
  const entry = await getVisibility(slug)
  if (!entry || entry.visible) return null
  if (request.cookies.get(previewCookieName(slug))?.value === entry.previewToken) return null
  return NextResponse.json({ error: 'Not found.' }, { status: 404 })
}

// A listing's bare-id link goes to its friendly one (see bareListingLink.ts
// for why here and not in the page). After the gate, so a hidden community's
// listings stay hidden. A failed lookup lets the page answer, as before.
async function redirectBareListingLink(request: NextRequest) {
  const link = parseBareListingLink(request.nextUrl.pathname)
  if (!link) return null
  const to = await friendlyListingPath(link).catch(() => null)
  if (!to) return null
  const url = new URL(to, request.url)
  url.search = request.nextUrl.search
  return NextResponse.redirect(url, 308)
}

// ── A made-up address answers 404, not the page's shell (Nov 21) ──
// With Partial Prefetching, an address that wasn't prerendered is sent its
// route's shell, and a 200, before the page can find it isn't real. So the
// proxy turns away what it knows isn't there (knownAddresses.ts). Cached
// like the visibility list; an address it doesn't know asks for a copy at
// most ADDRESSES_RECHECK_MS old before answering 404, so a category or
// listing made a moment ago gets through. Never loaded: everything passes.
const ADDRESSES_CACHE_MS = 60_000
const ADDRESSES_RECHECK_MS = 5_000
const loadAddresses = createVisibilityLoader({
  load: loadKnownAddresses,
  empty: NO_ADDRESSES,
  ttlMs: ADDRESSES_CACHE_MS,
  retryMs: VISIBILITY_RETRY_MS,
  onError: (err) => console.error('[proxy] address list refresh failed:', err),
})

// The site's own 404 page, not a line of text: it offers a way back into
// the community the address named (not-found.tsx reads the address the
// browser shows, which a rewrite leaves alone). Next serves /_not-found
// with a 404.
function notFoundResponse(request: NextRequest) {
  return NextResponse.rewrite(new URL('/_not-found', request.url), { status: 404 })
}

async function refuseUnknownAddress(request: NextRequest) {
  const { pathname } = request.nextUrl
  let known = await loadAddresses()
  if (known.communities.size === 0 || isKnownAddress(pathname, known)) return null
  known = await loadAddresses({ maxAgeMs: ADDRESSES_RECHECK_MS })
  if (known.communities.size === 0 || isKnownAddress(pathname, known)) return null
  return notFoundResponse(request)
}

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/') return redirectRoot(request)
  if (request.nextUrl.pathname.startsWith('/api/')) return (await gateCommunityApi(request)) ?? NextResponse.next()
  return (
    (await gateCommunityPath(request)) ??
    (await redirectBareListingLink(request)) ??
    (await refuseUnknownAddress(request)) ??
    NextResponse.next()
  )
}

export const config = {
  // One pattern covers both jobs: bare "/" (for the redirect above) plus
  // every community path (for the visibility gate) and the public API
  // routes (gateCommunityApi) — everything EXCEPT the standalone superadmin
  // console (/admin, no community segment), /inbox, the API routes that
  // aren't public, and static/metadata assets, none of which are ever
  // community paths. A slug can never collide with any excluded word —
  // assertUsableSlug's reserved-word list blocks that at creation.
  // The admin API stays out on purpose too: a proxy buffers every request
  // body it sees, and the admin's uploads have no need to be.
  // favicon.ico isn't left out: there is none, and the proxy answers its 404
  // (refuseUnknownAddress), as the [community] route did before Partial
  // Prefetching.
  matcher: '/((?!api/admin|api/cron|api/inbound|api/inbox|admin|inbox|_next/static|_next/image|sitemap.xml|robots.txt|manifest.webmanifest|icons).*)',
}
