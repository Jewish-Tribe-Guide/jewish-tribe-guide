import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  COMMUNITY_COOKIE,
  CONFIG_COMMUNITY_SLUG,
  looksLikeCommunitySlug,
} from '@/lib/configCommunity'
import { listCommunityVisibility } from '@/lib/communityStore'

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

  // 308 (permanent), not the 307 default: "/" is the single most-linked URL
  // the site has (every bare-domain backlink and search-engine crawl of the
  // apex lands here), and the mapping to the default community's path is
  // permanent in practice. A 307 tells Google the destination might still
  // change, which withholds full confidence in consolidating ranking signal
  // onto /philly — a real, if modest, SEO cost for something this central.
  return NextResponse.redirect(url, 308)
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
// window across all traffic, not one per request — and it's skipped
// entirely for any path that isn't shaped like /<community-slug>/....
// ─────────────────────────────────────────────────────────────────────────────

const ACCESS_PARAM = 'access'
const VISIBILITY_CACHE_MS = 30_000

let visibilityCache: { at: number; bySlug: Record<string, { visible: boolean; previewToken: string }> } | null =
  null

async function getVisibility(slug: string) {
  const now = Date.now()
  if (!visibilityCache || now - visibilityCache.at > VISIBILITY_CACHE_MS) {
    try {
      visibilityCache = { at: now, bySlug: await listCommunityVisibility() }
    } catch {
      // getAdminClient() throws synchronously on a missing Supabase env var
      // (see supabase/admin.ts) — a real thing that happens on a fresh
      // preview deployment before its env is fully configured. That
      // exception was reaching all the way out of the proxy uncaught,
      // which broke EVERY path on the site (ERR_INVALID_RESPONSE), not
      // just a hidden community's — the one thing this gate must never do
      // is take down traffic it isn't even meant to affect. Fail open
      // instead: treat every slug as unresolvable this cycle, same as an
      // unknown one, and let the route render (or 404) normally. A
      // misconfigured deployment loses the visibility gate, not the site.
      visibilityCache = { at: now, bySlug: {} }
    }
  }
  return visibilityCache.bySlug[slug] ?? null
}

function previewCookieName(slug: string): string {
  return `jpc_preview_${slug}`
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
    response.cookies.set(previewCookieName(segment), entry.previewToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: `/${segment}`,
      maxAge: 60 * 60 * 24 * 30,
    })
    return response
  }
  return null
}

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/') return redirectRoot(request)
  return (await gateCommunityPath(request)) ?? NextResponse.next()
}

export const config = {
  // One pattern covers both jobs: bare "/" (for the redirect above) plus
  // every community path (for the visibility gate) — everything EXCEPT the
  // standalone superadmin console (/admin, no community segment), /inbox,
  // API routes, and static/metadata assets, none of which are ever
  // community paths. A slug can never collide with any excluded word —
  // assertUsableSlug's reserved-word list blocks that at creation.
  matcher: '/((?!api|admin|inbox|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|manifest.webmanifest|icons).*)',
}
