import { notFound } from 'next/navigation'
import { listCommunities } from '@/lib/communityStore'
import { CommunityProvider } from '@/lib/communityContext'
import { ContentProvider } from '@/lib/contentContext'
import { loadCommunityContent } from '@/lib/loadCommunityContent'
import AdminAuthGate from '@/components/admin/AdminAuthGate'

// ─────────────────────────────────────────────────────────────────────────────
// A separate admin console per community — /philly/admin and /ues/admin are
// different route trees (this one, parameterized), each locked to its own
// community by the URL itself, the same way the public /[community] layout
// resolves. An unknown slug 404s rather than falling back to some default,
// same reasoning as the public layout: /baltimore/admin when Baltimore
// doesn't exist should say so, not quietly open Philadelphia's queue.
//
// This used to be one shared console with a cookie-based switcher
// (ADMIN_COMMUNITY_COOKIE) instead of a URL segment. That required reading
// cookies() in this layout — a genuine per-viewer runtime read Cache
// Components won't prerender/cache away — and, worse, meant every admin
// shared literally one editable state: switching community only changed
// which community THIS layout resolved to, not which community a request
// was actually for, so nothing distinguished "the Philly admin" from "the
// UES admin" as places instead of a toggle. A real URL segment fixes both:
// it's build-time enumerable again (generateStaticParams below), and two
// admins editing different communities are just on different pages, the way
// two browser tabs on /philly and /ues already are on the public site.
//
// The editors below render the same content hooks the public site does
// (useCategories, useSiteSettings, useForms, and the device preview that
// renders the real home screen) — those resolve their community from
// context, so the console needs a CommunityProvider/ContentProvider of its
// own, same as the public layout.
// ─────────────────────────────────────────────────────────────────────────────

async function resolveFromPath(slug: string) {
  const communities = await listCommunities()
  const community = communities.find((c) => c.slug === slug)
  return { community, communities }
}

/** Prerenders a page per community at build time — same reasoning as the
 *  public [community] layout's own generateStaticParams. */
export async function generateStaticParams() {
  const communities = await listCommunities()
  return communities.map((c) => ({ community: c.slug }))
}

export default async function AdminLayout(props: LayoutProps<'/admin/[community]'>) {
  const { community: slug } = await props.params
  const { community, communities } = await resolveFromPath(slug)
  if (!community) notFound()

  // Fetched here, on the server, so the editors' content hooks (which read
  // from context, not a fetch — see loadCommunityContent's own doc) have
  // something to read. Without this the console would throw on load.
  const content = await loadCommunityContent(community.slug)

  return (
    <CommunityProvider community={community} communities={communities}>
      <ContentProvider content={content}>
        {/* key={community.slug}: forces the whole subtree — every admin
            panel below the auth gate — to remount when the URL's community
            segment changes. Several of them (CategoryManager, ModerationQueue,
            SiteSettingsEditor, …) do their own authenticated fetch in a
            mount-only effect, exactly like the public site's content used to
            before loadCommunityContent — a plain client-side navigation
            between /philly/admin and /ues/admin updates this layout's props
            but does NOT by itself re-run those effects, so without the key
            switching community would leave the panel you're looking at
            showing the OLD community's data under the new community's URL.
            Real routes now live under here (/admin/[community],
            /admin/[community]/categories, …) — this one gate covers every
            one of them, subscribing to the Supabase session once at the
            layout level (which persists across sibling-route navigations)
            instead of every route re-doing its own session check. */}
        <AdminAuthGate key={community.slug} community={community.slug}>
          {props.children}
        </AdminAuthGate>
      </ContentProvider>
    </CommunityProvider>
  )
}
