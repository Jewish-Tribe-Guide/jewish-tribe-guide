'use client'

import { useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'

// Redirects the browser straight to Google's consent screen via Supabase's
// OAuth flow — same implicit-flow browser client MagicLinkLogin's magic
// link already relies on (see client.ts's own comment), so the return trip
// lands back here with the session in the URL hash and no server callback
// route to write. AdminAuthGate's existing getSession()/onAuthStateChange
// effect picks it up exactly the way it already does for a clicked magic
// link — this button only changes how the session gets established, not
// what happens with it afterward (the per-community/superadmin allowlist
// check in /api/admin/whoami runs the same either way).
export default function GoogleSignInButton() {
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  async function handleClick() {
    setError(null)
    setStarting(true)
    const supabase = getBrowserClient()
    // redirectTo: back to this exact page (query string included, e.g. the
    // per-community admin URL) so sign-in lands wherever it was started
    // from, same as the magic-link flow.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    })
    if (error) {
      setError(error.message)
      setStarting(false)
    }
    // On success the browser is already navigating away to Google — nothing
    // left to do here.
  }

  return (
    <div>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      <button
        type="button"
        onClick={handleClick}
        disabled={starting}
        className="w-full flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
      >
        <svg aria-hidden width="18" height="18" viewBox="0 0 18 18">
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.09-1.8 2.73v2.27h2.92c1.7-1.57 2.68-3.88 2.68-6.64z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.47-.8 5.96-2.17l-2.92-2.27c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.34C2.44 15.98 5.48 18 9 18z"
          />
          <path
            fill="#FBBC05"
            d="M3.97 10.71c-.18-.54-.28-1.11-.28-1.71s.1-1.17.28-1.71V4.95H.96A8.996 8.996 0 000 9c0 1.45.35 2.83.96 4.05l3.01-2.34z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.95l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"
          />
        </svg>
        {starting ? 'Redirecting…' : 'Sign in with Google'}
      </button>
    </div>
  )
}
