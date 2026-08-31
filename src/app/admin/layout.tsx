import { listCommunities } from '@/lib/communityStore'
import { adminCommunityFromCookies } from '@/lib/adminCommunity'
import { CommunityProvider } from '@/lib/communityContext'
import { ContentProvider } from '@/lib/contentContext'
import { loadCommunityContent } from '@/lib/loadCommunityContent'
import AdminAuthGate from '@/components/admin/AdminAuthGate'

// ─────────────────────────────────────────────────────────────────────────────
// The admin lives outside /[community] — it's one console, not a public screen
// under a community — but its editors render the same content hooks the public
// site does (useCategories, useSiteSettings, useForms, and the device preview
// that renders the real home screen). Those resolve their community from
// context, so the console needs one too.
//
// Which community that is comes from ADMIN_COMMUNITY_COOKIE (see
// adminCommunity.ts), set by AdminCommunitySwitcher — not the URL, since the
// console is one shared route rather than living under /[community]. A fresh
// browser with no cookie yet resolves to the default community, so a
// single-community deployment behaves exactly as before this existed.
//
// Reading that cookie is a genuine per-viewer runtime read (next/headers'
// cookies()), which is exactly what next.config.ts's rewrite comment used to
// call out as NOT happening here — /admin was prerendered and CDN-cached
// because every server-rendered byte was the same for every viewer, and the
// only per-admin thing (the moderation queue, category edits, …) was fetched
// client-side with a Bearer token. Once which community's content this
// layout server-renders depends on a cookie, that's no longer true: two
// admins editing different communities must not share one cached shell.
// `instant = false` opts the route out of prerendering rather than forcing a
// Suspense boundary around the cookie read — worth it here (a low-traffic
// internal console, not the public directory) to keep the layout's own code
// simple instead of splitting it into a static shell + a streamed island.
export const instant = false

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [community, communities] = await Promise.all([adminCommunityFromCookies(), listCommunities()])
  // The editors render the same content hooks the public site does, and those
  // read from context now rather than fetching. Without this the console would
  // throw on load — the same failure the missing CommunityProvider caused.
  const content = await loadCommunityContent(community.slug)

  return (
    <CommunityProvider community={community} communities={communities}>
      <ContentProvider content={content}>
        {/* Real routes now live under here (/admin, /admin/categories, …) —
            this one gate covers every one of them, subscribing to the
            Supabase session once at the layout level (which persists across
            sibling-route navigations) instead of every route re-doing its
            own session check. */}
        <AdminAuthGate>{children}</AdminAuthGate>
      </ContentProvider>
    </CommunityProvider>
  )
}
