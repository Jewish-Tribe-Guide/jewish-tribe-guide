'use client'

import { createContext, useCallback, useContext } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { Community } from './communityStore'

// ─────────────────────────────────────────────────────────────────────────────
// Which community the visitor is looking at — now decided by the URL.
//
// This used to be localStorage read through useSyncExternalStore. That made a
// link ambiguous: /?  rendered whatever community the tapping device had last
// chosen, so the same URL showed different directories to different people.
// The community is a path segment now (see routes.ts), the server layout
// resolves it, and this context hands it to the client tree.
//
// localStorage still exists, but demoted to a single job: remembering the last
// community so a bare "/" can redirect somewhere sensible. It is a hint for one
// redirect, never the answer to "what am I looking at".
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'jpc:community'

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
  const pathname = usePathname()

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
      const rest = pathname.split('/').filter(Boolean).slice(1)
      const screen = rest[0]
      const portable = rest.length === 1 && (screen === 'map' || screen === 'all' || screen === 'feedback')
      router.push(portable ? `/${next}/${screen}` : `/${next}`)
    },
    [pathname, router],
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
 *  them back to it. Safe to lose: iOS Safari evicts this after about a week of
 *  not visiting, and the only consequence is landing on the default community. */
export function rememberCommunity(slug: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, slug)
  } catch {
    /* private mode — the default community is a fine answer */
  }
}

/** The last community this device read, if any. Only "/" consults it. */
export function lastVisitedCommunity(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}
