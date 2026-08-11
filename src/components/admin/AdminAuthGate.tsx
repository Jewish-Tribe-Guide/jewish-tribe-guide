'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getBrowserClient } from '@/lib/supabase/client'
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
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [devLoginError, setDevLoginError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = getBrowserClient()
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

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
      body: JSON.stringify({ secret: devToken }),
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
  }, [])

  if (!ready) {
    return <AdminShell><p className="text-sm text-muted">Loading…</p></AdminShell>
  }

  if (!session) {
    return (
      <AdminShell>
        {devLoginError && (
          <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">
            Dev login failed: {devLoginError}
          </p>
        )}
        <MagicLinkLogin
          requestLinkUrl="/api/admin/request-link"
          emailLabel="Admin email"
          sentMessage="an authorized admin"
        />
      </AdminShell>
    )
  }

  return (
    <AdminShell>
      <AdminSessionContext.Provider value={session}>{children}</AdminSessionContext.Provider>
    </AdminShell>
  )
}
