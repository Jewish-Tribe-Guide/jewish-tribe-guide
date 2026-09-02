// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import AdminAuthGate from './AdminAuthGate'

// ─────────────────────────────────────────────────────────────────────────────
// Covers a real production bug: an expired/already-used magic link (or any
// other Supabase /verify failure) redirects back with
// #error=...&error_description=... on the URL HASH, not the query string the
// existing OAuth-decline handling already covered — so it used to sit there
// completely unread, showing a bare login form with no explanation. Worse,
// the leftover hash (or, on a successful sign-in, the bare trailing "#"
// Supabase's own client leaves behind — see the second describe block below)
// went on to corrupt the NEXT sign-in attempt: GoogleSignInButton's
// redirectTo is window.location.href, so Supabase's redirect construction
// appended a fresh #access_token=... directly onto a redirect_to that
// already ended in "#", producing a literal "...##access_token=..." that
// failed too. Confirmed both ends of this by hand against a real Supabase
// project before fixing it — see AdminAuthGate.tsx's own comments.
// ─────────────────────────────────────────────────────────────────────────────

const mockGetSession = vi.fn()
const mockOnAuthStateChange = vi.fn()
const mockSignOut = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  getBrowserClient: () => ({
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
      signOut: mockSignOut,
    },
  }),
}))

function setUrl(pathname: string, search = '', hash = '') {
  window.history.replaceState(null, '', pathname + search + hash)
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  setUrl('/philly/admin')
})

function mockNoSession() {
  mockGetSession.mockResolvedValue({ data: { session: null } })
  mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
}

describe('AdminAuthGate — hash-based sign-in errors', () => {
  it('shows the error and clears the hash when a magic link is expired/already used', async () => {
    mockNoSession()
    setUrl('/philly/admin', '', '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')

    render(
      <AdminAuthGate community="philly">
        <div>children</div>
      </AdminAuthGate>,
    )

    expect(await screen.findByText('Sign-in failed: Email link is invalid or has expired')).toBeInTheDocument()
    // Left in place would poison the NEXT sign-in attempt's redirectTo
    // (window.location.href) — see this file's own top comment.
    await waitFor(() => expect(window.location.hash).toBe(''))
  })

  it('leaves the hash alone when it holds a real access_token (nothing to report, Supabase reads it itself)', async () => {
    mockNoSession()
    setUrl('/philly/admin', '', '#access_token=tok&refresh_token=ref&type=magiclink')

    render(
      <AdminAuthGate community="philly">
        <div>children</div>
      </AdminAuthGate>,
    )

    await screen.findByText('Loading…')
    expect(screen.queryByText(/Sign-in failed/)).not.toBeInTheDocument()
  })

  it('does not confuse a query-string OAuth-decline error for a hash error, or vice versa', async () => {
    mockNoSession()
    setUrl('/philly/admin', '?error=access_denied&error_description=User+cancelled')

    render(
      <AdminAuthGate community="philly">
        <div>children</div>
      </AdminAuthGate>,
    )

    expect(await screen.findByText('Sign-in failed: User cancelled')).toBeInTheDocument()
  })
})

describe('AdminAuthGate — stray trailing "#" cleanup', () => {
  it('strips a leftover bare "#" once the initial session check settles, even with no error in it', async () => {
    mockNoSession()
    setUrl('/philly/admin', '', '#')

    render(
      <AdminAuthGate community="philly">
        <div>children</div>
      </AdminAuthGate>,
    )

    await screen.findByText('Loading…')
    // NOT window.location.hash — a bare trailing "#" with nothing after it
    // normalizes to an EMPTY .hash by itself (confirmed directly, including
    // in jsdom), even though it's still literally sitting in .href/the
    // address bar. That's exactly the gap that let this bug through the
    // first time: the fix's own guard used to check .hash too, and so
    // silently never fired.
    await waitFor(() => expect(window.location.href).toBe('http://localhost:3000/philly/admin'))
  })
})
