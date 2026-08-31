'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getBrowserClient } from '@/lib/supabase/client'
import { useCommunitySlug } from '@/lib/communityContext'
import MagicLinkLogin from '@/components/auth/MagicLinkLogin'
import AdminShell from './AdminShell'

// The admin's session, established once here and read by every route below —
// this component lives in admin/layout.tsx, which persists across every
// /admin/* navigation the way the public site's SiteChrome persists across
// community screens, so the Supabase session subscription below survives a
// tab switch instead of re-subscribing (and briefly re-checking) on every
// navigation the way it would if this lived in each route's own page file.
const AdminSessionContext = createContext<Session | null>(null)

/** The signed-in admin's session. Only ever called from inside
 *  &lt;AdminAuthGate&gt;'s `children`, where a non-null session is guaranteed —
 *  see AdminAuthGate itself, which never renders `children` without one. */
export function useAdminSession(): Session {
  const session = useContext(AdminSessionContext)
  if (!session) throw new Error('useAdminSession must be used inside AdminAuthGate\'s authenticated children')
  return session
}

/** Gates every /admin/* route behind a real admin session — renders the
 *  loading/magic-link-login screens itself (in the same AdminShell chrome
 *  every authenticated route uses) until one exists, then makes it available
 *  to `children` via useAdminSession(). Auth stays entirely client-side here,
 *  same as before this existed as its own component: /admin is deliberately
 *  CDN-cached as a static shell (see AGENTS.md's caching notes), so nothing
 *  session-scoped can move server-side into layout.tsx itself. */
export default function AdminAuthGate({ children }: { children: React.ReactNode }) {
  const community = useCommunitySlug()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [devLoginError, setDevLoginError] = useState<string | null>(null)
  // Whether the signed-in session's email is actually allowed to administer
  // THIS community (checked server-side via /api/admin/whoami, which uses
  // adminAuth.ts's per-community isAllowedForCommunity — not just "is there a
  // session"). A valid Supabase session proves identity, not access: without
  // this, an admin who signed in for one community could open a different
  // community's /admin URL and get straight in on the strength of the same
  // browser-held token, once communities have different admin_emails. null
  // = not checked yet for the current session.
  const [authorized, setAuthorized] = useState<boolean | null>(null)

  useEffect(() => {
    const supabase = getBrowserClient()
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    // No setState here for the !session case — render already treats
    // `!session` as unauthenticated regardless of `authorized`'s last value
    // (see the `!session || authorized === false` check below), and a
    // subsequent real session re-runs this effect and resets `authorized`
    // itself, right before its own fetch.
    if (!session) return

    // Wrapped in an async function so the only synchronous statement in the
    // effect body is the call below — every setAuthorized happens inside
    // this function's own async continuation, not directly in the effect,
    // same shape as this codebase's useLoadOnMount(load) convention
    // elsewhere (see e.g. ArchivedListings.tsx's own `load`).
    let cancelled = false
    async function checkAuthorized(currentSession: Session) {
      setAuthorized(null)
      try {
        const res = await fetch(`/api/admin/whoami?community=${encodeURIComponent(community)}`, {
          headers: { Authorization: `Bearer ${currentSession.access_token}` },
        })
        const body = await res.json()
        if (!cancelled) setAuthorized(!!body.ok)
      } catch {
        if (!cancelled) setAuthorized(false)
      }
    }
    checkAuthorized(session)

    return () => {
      cancelled = true
    }
  }, [session, community])

  // Local-dev-only shortcut: /admin?devToken=<DEV_ADMIN_BYPASS_SECRET> signs in
  // instantly via /api/admin/dev-login instead of the magic-link email — see
  // that route for why this can't do anything on a real deployment. Strips the
  // secret from the URL bar/history immediately either way. Reads
  // window.location directly (not a route param) so this works identically
  // regardless of which /admin/* route the query string landed on.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const devToken = params.get('devToken')
    if (!devToken) return

    history.replaceState(history.state, '', window.location.pathname)

    fetch('/api/admin/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: devToken, community }),
    })
      .then((res) => res.json())
      .then(async (body) => {
        if (!body.ok) throw new Error(body.error || 'Dev login failed.')
        const { error } = await getBrowserClient().auth.setSession({
          access_token: body.accessToken,
          refresh_token: body.refreshToken,
        })
        if (error) throw error
      })
      .catch((err) => setDevLoginError(err instanceof Error ? err.message : 'Dev login failed.'))
  }, [community])

  // Signs out a session that turned out not to belong to this community's
  // admin, rather than leaving it sitting in the browser to be re-checked
  // (and re-fail) on every render — a real side effect, so it belongs here,
  // not in the render below.
  useEffect(() => {
    if (session && authorized === false) getBrowserClient().auth.signOut()
  }, [session, authorized])

  if (!ready) {
    return <AdminShell><p className="text-sm text-muted">Loading…</p></AdminShell>
  }

  // A session that turned out not to belong to THIS community's admin is
  // treated the same as no session — the sign-in form shows again rather
  // than any of `children`, just with an explanation instead of silence.
  // Signed out (not just ignored) so a stale, wrong-community token doesn't
  // linger and get re-checked forever, and so a fresh "Send magic link"
  // click here is unambiguously starting over.
  if (!session || authorized === false) {
    return (
      <AdminShell>
        {devLoginError && (
          <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">
            Dev login failed: {devLoginError}
          </p>
        )}
        {authorized === false && (
          <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">
            That account isn&apos;t an admin for this community.
          </p>
        )}
        <MagicLinkLogin
          requestLinkUrl="/api/admin/request-link"
          emailLabel="Admin email"
          sentMessage="an authorized admin for this community"
          community={community}
        />
      </AdminShell>
    )
  }

  // authorized === null: the whoami check hasn't come back yet — same
  // loading treatment as `!ready`, rather than flashing `children` (or the
  // login form) for a moment before the real answer arrives.
  if (authorized !== true) {
    return <AdminShell><p className="text-sm text-muted">Loading…</p></AdminShell>
  }

  return (
    <AdminShell>
      <AdminSessionContext.Provider value={session}>{children}</AdminSessionContext.Provider>
    </AdminShell>
  )
}
