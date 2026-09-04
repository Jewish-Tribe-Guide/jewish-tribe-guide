'use client'

import { createContext, useCallback, useContext, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Community } from './communityStore'
import { COMMUNITY_COOKIE } from './configCommunity'

// ─────────────────────────────────────────────────────────────────────────────
// Which community the visitor is looking at — now decided by the URL.
//
// This used to be localStorage read through useSyncExternalStore. That made a
// link ambiguous: /?  rendered whatever community the tapping device had last
// chosen, so the same URL showed different directories to different people.
// The community is a path segment now (see routes.ts), the server layout
// resolves it, and this context hands it to the client tree.
//
// Something still remembers the last community, but it's demoted to a single
// job — telling a bare "/" where to send this device — and it's a cookie, not
// localStorage. The cookie is what makes that redirect server-side: the root
// route reads it and issues a real redirect, so a crawler and a link preview
// resolve to a real community and a returning visitor never sees a flash of
// the wrong one. It is a hint for one redirect, never the answer to "what am I
// looking at" — the URL is.
// ─────────────────────────────────────────────────────────────────────────────

// Defined in configCommunity.ts (a server-safe module) so proxy.ts can read
// it; re-exported here so this file's existing importers are unchanged.
export { COMMUNITY_COOKIE }

type CommunityContextValue = {
  community: Community
  communities: Community[]
}

const CommunityContext = createContext<CommunityContextValue | null>(null)

export function CommunityProvider({
  community,
  communities,
  children,
}: CommunityContextValue & { children: React.ReactNode }) {
  // Remember wherever the visitor actually ends up, not only an explicit
  // switch — most people arrive on a shared link rather than through the
  // switcher, and that link is just as good a signal of which community is
  // theirs.
  useEffect(() => {
    rememberCommunity(community.slug)
  }, [community.slug])

  return (
    <CommunityContext.Provider value={{ community, communities }}>
      {children}
    </CommunityContext.Provider>
  )
}

export type ActiveCommunity = {
  /** The community named by the URL. Never null inside a [community] route. */
  community: Community
  communities: Community[]
  /** True once more than one exists — the header switcher stays hidden below
   *  this, so a single-community site looks exactly as it did before. */
  canSwitch: boolean
  /** Switches community, keeping the visitor on the equivalent screen where
   *  one exists. */
  setCommunity: (slug: string) => void
}

export function useActiveCommunity(): ActiveCommunity {
  const ctx = useContext(CommunityContext)
  const router = useRouter()

  if (!ctx) {
    throw new Error('useActiveCommunity must be used inside a CommunityProvider')
  }
  const { community, communities } = ctx

  const setCommunity = useCallback(
    (next: string) => {
      rememberCommunity(next)
      // Keep the visitor on the same screen in the new community where that
      // makes sense — /philly/map → /baltimore/map. Category and listing paths
      // are deliberately excluded: a category slug isn't guaranteed to exist in
      // the other community, and a listing id certainly doesn't, so those land
      // on that community's home rather than a 404.
      //
      // The path is read from window at click time rather than through
      // usePathname, deliberately. This hook is used by the header, which is on
      // every screen, so subscribing it to the path would subscribe the whole
      // chrome — and reading the path suspends during prerendering, which held
      // back every page from rendering. An event handler has no such problem:
      // by the time it runs there is a window, and its value is current.
      const rest = window.location.pathname.split('/').filter(Boolean).slice(1)
      const screen = rest[0]
      const portable = rest.length === 1 && (screen === 'map' || screen === 'feedback')
      router.push(portable ? `/${next}/${screen}` : `/${next}`)
    },
    [router],
  )

  return {
    community,
    communities,
    canSwitch: communities.length > 1,
    setCommunity,
  }
}

/** The community slug from the URL. Convenience for the many callers that only
 *  need the slug to build a link or scope a fetch. */
export function useCommunitySlug(): string {
  return useActiveCommunity().community.slug
}

// ── The "/" redirect hint ────────────────────────────────────────────────────

/** Records the community the visitor is reading, so a later bare "/" can send
 *  them back to it. Safe to lose — the only consequence is landing on the
 *  default community.
 *
 *  Deliberately not `Secure`, so it works over plain http in local development;
 *  it holds a community slug and nothing else, so there is nothing here worth
 *  protecting. `SameSite=Lax` still applies it to a normal top-level visit,
 *  which is the only navigation that reads it. */
export function rememberCommunity(slug: string): void {
  try {
    const year = 60 * 60 * 24 * 365
    document.cookie = `${COMMUNITY_COOKIE}=${encodeURIComponent(slug)}; Path=/; Max-Age=${year}; SameSite=Lax`
  } catch {
    /* cookies disabled — the default community is a fine answer */
  }
}
