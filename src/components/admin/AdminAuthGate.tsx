'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getBrowserClient } from '@/lib/supabase/client'
import MagicLinkLogin from '@/components/auth/MagicLinkLogin'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'
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

// Separate from AdminSessionContext (rather than folded into it) so the
// existing useAdminSession() callers — every one of them expects a raw
// Session, not a wrapper object — don't all need updating for one new,
// narrow need: whether the tabs under a per-community console should offer
// the Communities tab, which is superadmin-only underneath regardless of
// which community's console it's rendered inside (see AdminNav).
const IsSuperAdminContext = createContext(false)

/** Whether the signed-in admin is ALSO on the global superadmin list
 *  (SUPERADMIN_EMAILS), on top of whatever got them into this particular
 *  community's console — from /api/admin/whoami's own isSuperAdmin field.
 *  Only ever called from inside AdminAuthGate's authenticated children. */
export function useIsSuperAdmin(): boolean {
  return useContext(IsSuperAdminContext)
}

/** Gates a /admin/* route behind a real admin session — renders the
 *  loading/magic-link-login screens itself (in the same AdminShell chrome
 *  every authenticated route uses) until one exists, then makes it available
 *  to `children` via useAdminSession(). Auth stays entirely client-side here,
 *  same as before this existed as its own component: /admin is deliberately
 *  CDN-cached as a static shell (see AGENTS.md's caching notes), so nothing
 *  session-scoped can move server-side into layout.tsx itself.
 *
 *  `community`: which community this gate is checking the session against
 *  (adminAuth.ts's per-community isAllowedForCommunity, via
 *  /api/admin/whoami). Passed explicitly rather than read from
 *  useCommunitySlug() so this same gate also covers the standalone
 *  superadmin console at /admin itself (src/app/admin/page.tsx), which has
 *  no community in the URL at all and needs the SUPERADMIN check instead
 *  (community omitted — see /api/admin/whoami's own doc). Every route under
 *  /admin/[community]/... passes its own community.slug (see that
 *  layout.tsx).
 *
 *  `shellTitle`/`shellSubtitle`: forwarded to every AdminShell this renders
 *  (loading, login form, and the authenticated content) — AdminShell's own
 *  defaults ("Resource Moderation…") are right for the per-community
 *  console but wrong for the superadmin one. */
export default function AdminAuthGate({
  children,
  community,
  shellTitle,
  shellSubtitle,
}: {
  children: React.ReactNode
  community?: string
  shellTitle?: string
  shellSubtitle?: string
}) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [devLoginError, setDevLoginError] = useState<string | null>(null)
  const [signInError, setSignInError] = useState<string | null>(null)
  // Whether the signed-in session's email is actually allowed in here —
  // checked server-side via /api/admin/whoami (not just "is there a
  // session"). A valid Supabase session proves identity, not access: without
  // this, an admin who signed in for one community could open a different
  // community's /admin URL and get straight in on the strength of the same
  // browser-held token, once communities have different admin_emails — and,
  // for the superadmin console, any ordinary community admin could reach it
  // the same way. null = not checked yet for the current session.
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  useEffect(() => {
    const supabase = getBrowserClient()
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    // Supabase's own client registers a `visibilitychange` listener
    // (GoTrueClient) that re-checks the token every time the tab becomes
    // visible again — including a routine "still valid, nothing to do"
    // check, which STILL fires this callback with a freshly-constructed
    // session object (same access_token, new reference). Passing that
    // straight to setSession looked like a full reload every time an admin
    // tabbed away and back: a new session reference re-runs the
    // authorization-check effect below (its own deps include `session`),
    // which resets `authorized` to null and renders the "Loading…" shell
    // while it re-fetches /api/admin/whoami for no actual reason.
    //
    // Comparing access_token and keeping the OLD reference when it's
    // unchanged lets React's setState bail-out (same reference in, same
    // reference out) skip the re-render entirely for that case — a real
    // sign-in/out or an actual token rotation still flows through normally,
    // since the token itself differs then.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession((prev) => (prev?.access_token === s?.access_token ? prev : s))
    })
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
        const query = community ? `?community=${encodeURIComponent(community)}` : ''
        const res = await fetch(`/api/admin/whoami${query}`, {
          headers: { Authorization: `Bearer ${currentSession.access_token}` },
        })
        const body = await res.json()
        if (!cancelled) {
          setAuthorized(!!body.ok)
          setIsSuperAdmin(!!body.isSuperAdmin)
        }
      } catch {
        if (!cancelled) {
          setAuthorized(false)
          setIsSuperAdmin(false)
        }
      }
    }
    checkAuthorized(session)

    return () => {
      cancelled = true
    }
  }, [session, community])

  // Supabase redirects back from a failed/declined Google sign-in with
  // ?error=...&error_description=... on the query string, rather than
  // rejecting a promise anywhere in this component — GoogleSignInButton's
  // own error state only ever covers a failure to even start the redirect.
  // Stripped from the URL bar the same way the devToken effect below strips
  // its own param.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const description = params.get('error_description')
    if (!description) return
    history.replaceState(history.state, '', window.location.pathname)
    // Reading state Supabase's redirect set on the URL (external to React),
    // once on mount — the exact case the lint rule's own guidance carves out.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSignInError(description.replace(/\+/g, ' '))
  }, [])

  // A DIFFERENT failure shape from the one above: an expired or already-used
  // magic link (or any other /verify failure) comes back with
  // #error=...&error_description=... on the HASH instead of the query
  // string — the same place a successful sign-in's #access_token=... lands.
  // Confirmed directly against a real generateLink()'d expired link:
  // Supabase's own /verify redirect is
  // "<redirectTo>#error=access_denied&error_code=otp_expired&error_description=...".
  // Left unhandled, this used to just sit there — no message shown, login
  // form rendered with no explanation — and it went on to break the NEXT
  // sign-in attempt too: GoogleSignInButton's redirectTo is
  // window.location.href, so a leftover #error=... hash got carried into
  // the next OAuth round trip, and Supabase's own redirect construction
  // appends its new #access_token=... directly onto whatever redirect_to
  // it's given — producing a literal "...##access_token=..." and silently
  // failing the retry too.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const description = hash.get('error_description')
    if (!description) return
    history.replaceState(history.state, '', window.location.pathname + window.location.search)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSignInError(description.replace(/\+/g, ' '))
  }, [])

  // Even a SUCCESSFUL hash gets left half-cleaned: Supabase's client clears
  // #access_token=...'s CONTENTS once it's read the session out of them, but
  // leaves a bare trailing "#" in the address bar rather than removing it
  // outright (confirmed directly — the URL sat at ".../admin#" right after a
  // real, successful sign-in). That stray "#" alone is enough to corrupt a
  // LATER sign-in attempt the exact same way an unhandled #error=... does
  // (see the effect above) — so once Supabase has had its turn (`ready`,
  // set inside the getSession() effect below, only ever becomes true AFTER
  // that), strip whatever's left in the hash unconditionally, whether or
  // not there was ever anything meaningful in it.
  //
  // window.location.hash, NOT .href.includes('#') — a bare trailing "#"
  // with nothing after it normalizes to an EMPTY .hash (per the URL spec),
  // even though it's still literally sitting in .href/the address bar. That
  // cost a whole extra round of manual reproduction to notice: this exact
  // effect, checking `.hash`, silently never fired against the exact bug
  // it exists to fix.
  useEffect(() => {
    if (!ready) return
    if (!window.location.href.includes('#')) return
    history.replaceState(history.state, '', window.location.pathname + window.location.search)
  }, [ready])

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
      body: JSON.stringify({ secret: devToken, ...(community ? { community } : {}) }),
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

  // Signs out a session that turned out not to belong here, rather than
  // leaving it sitting in the browser to be re-checked (and re-fail) on
  // every render — a real side effect, so it belongs here, not in the
  // render below.
  useEffect(() => {
    if (session && authorized === false) getBrowserClient().auth.signOut()
  }, [session, authorized])

  if (!ready) {
    return (
      <AdminShell title={shellTitle} subtitle={shellSubtitle}>
        <p className="text-sm text-muted">Loading…</p>
      </AdminShell>
    )
  }

  // A session that turned out not to be authorized here is treated the same
  // as no session — the sign-in form shows again rather than any of
  // `children`, just with an explanation instead of silence. Signed out (not
  // just ignored) so a stale, unauthorized token doesn't linger and get
  // re-checked forever, and so a fresh "Send magic link" click here is
  // unambiguously starting over.
  if (!session || authorized === false) {
    return (
      <AdminShell title={shellTitle} subtitle={shellSubtitle}>
        {devLoginError && (
          <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">
            Dev login failed: {devLoginError}
          </p>
        )}
        {signInError && (
          <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">
            Sign-in failed: {signInError}
          </p>
        )}
        {authorized === false && (
          <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">
            {community ? "That account isn't an admin for this community." : "That account isn't a superadmin."}
          </p>
        )}
        <div className="max-w-sm space-y-4">
          <GoogleSignInButton />
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-muted">or</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>
        </div>
        <MagicLinkLogin
          requestLinkUrl="/api/admin/request-link"
          emailLabel="Admin email"
          sentMessage={community ? 'an authorized admin for this community' : 'an authorized superadmin'}
          community={community}
        />
      </AdminShell>
    )
  }

  // authorized === null: the whoami check hasn't come back yet — same
  // loading treatment as `!ready`, rather than flashing `children` (or the
  // login form) for a moment before the real answer arrives.
  if (authorized !== true) {
    return (
      <AdminShell title={shellTitle} subtitle={shellSubtitle}>
        <p className="text-sm text-muted">Loading…</p>
      </AdminShell>
    )
  }

  return (
    <AdminShell title={shellTitle} subtitle={shellSubtitle}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted">
          Signed in as <span className="font-medium text-slate-700">{session.user.email}</span>
        </p>
        <button
          onClick={() => getBrowserClient().auth.signOut()}
          className="text-sm text-muted hover:text-slate-700 underline cursor-pointer"
        >
          Sign out
        </button>
      </div>
      <AdminSessionContext.Provider value={session}>
        <IsSuperAdminContext.Provider value={isSuperAdmin}>{children}</IsSuperAdminContext.Provider>
      </AdminSessionContext.Provider>
    </AdminShell>
  )
}
