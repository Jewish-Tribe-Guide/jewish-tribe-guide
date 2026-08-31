'use client'

import { useActiveCommunity } from '@/lib/communityContext'
// From configCommunity.ts, not adminCommunity.ts — that module pulls in
// next/headers and communityStore's 'use cache' functions, neither of which
// may reach a Client Component's bundle (same reasoning as
// communityContext.tsx re-exporting COMMUNITY_COOKIE from configCommunity.ts
// instead of communityStore.ts).
import { ADMIN_COMMUNITY_COOKIE } from '@/lib/configCommunity'

// ─────────────────────────────────────────────────────────────────────────────
// Which community the admin console is editing — separate from the public
// site's header switcher (SiteHeader.tsx), which changes the URL. The console
// is one shared route with no community segment, so switching here writes
// ADMIN_COMMUNITY_COOKIE and reloads: admin/layout.tsx (a server component)
// reads that cookie on every request and resolves everything below it from
// the new community.
//
// A full reload, not router.refresh() — most of the admin's own tabs
// (CategoryManager, ModerationQueue, SiteSettingsEditor, …) fetch their data
// client-side in a mount-only effect, exactly like the public site used to
// before loadCommunityContent. router.refresh() only re-runs the SERVER
// component tree; those effects never re-fire, so the panel you're actually
// looking at would keep showing the old community's data under the new
// community's chrome. A real reload remounts everything.
//
// Hides itself below two communities, same rule the public switcher follows,
// so a single-community deployment's admin looks exactly as it did before.
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminCommunitySwitcher() {
  const { community, communities } = useActiveCommunity()

  if (communities.length <= 1) return null

  return (
    <label className="flex shrink-0 items-center gap-1.5 text-sm text-muted">
      <span className="sr-only">Editing community</span>
      <select
        value={community.slug}
        onChange={(e) => {
          const year = 60 * 60 * 24 * 365
          document.cookie = `${ADMIN_COMMUNITY_COOKIE}=${encodeURIComponent(e.target.value)}; Path=/; Max-Age=${year}; SameSite=Lax`
          window.location.reload()
        }}
        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm font-medium text-slate-700"
      >
        {communities.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  )
}
