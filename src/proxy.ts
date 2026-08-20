import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  COMMUNITY_COOKIE,
  CONFIG_COMMUNITY_SLUG,
  looksLikeCommunitySlug,
} from '@/lib/configCommunity'

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

export function proxy(request: NextRequest) {
  const remembered = request.cookies.get(COMMUNITY_COOKIE)?.value

  // A shape check only. The proxy deliberately doesn't reach the database —
  // it runs ahead of the app and may be deployed to a CDN — so a slug that
  // looks fine but names a community that has since been removed will 404 at
  // the route. That's the right answer for a stale link, and visiting any real
  // community rewrites the cookie.
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

export const config = {
  // Only the bare root. Every other path is a real route and must not be
  // touched — matching more broadly would put this in front of every request
  // for no benefit.
  matcher: '/',
}
