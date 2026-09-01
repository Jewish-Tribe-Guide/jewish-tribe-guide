import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { getAllowedInboxEmails, getInboxViewer, isAllowedInboxEmail } from './inboxAuth'

// Mirrors adminAuth.test.ts — same shape, deliberately separate allowlist (see
// this file's own header comment: being an admin doesn't grant inbox access).

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))

function req(authorization?: string): Request {
  return new Request('https://example.com', {
    headers: authorization ? { authorization } : {},
  })
}

function mockSupabaseUser(result: { email?: string; error?: unknown }) {
  vi.mocked(createClient).mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: result.email ? { email: result.email } : null },
        error: result.error ?? null,
      }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('getAllowedInboxEmails', () => {
  it('splits, trims, and lowercases the comma-separated list', () => {
    vi.stubEnv('INBOX_EMAILS', ' Inbox@Example.com, second@example.com')
    expect(getAllowedInboxEmails()).toEqual(['inbox@example.com', 'second@example.com'])
  })

  it('is empty when the env var is unset', () => {
    vi.stubEnv('INBOX_EMAILS', '')
    expect(getAllowedInboxEmails()).toEqual([])
  })
})

describe('isAllowedInboxEmail', () => {
  beforeEach(() => vi.stubEnv('INBOX_EMAILS', 'inbox@example.com'))

  it('matches case-insensitively with surrounding whitespace', () => {
    expect(isAllowedInboxEmail('  INBOX@EXAMPLE.COM  ')).toBe(true)
  })

  it('rejects an email not on the list', () => {
    expect(isAllowedInboxEmail('stranger@example.com')).toBe(false)
  })
})

describe('getInboxViewer', () => {
  beforeEach(() => {
    vi.stubEnv('INBOX_EMAILS', 'inbox@example.com')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
  })

  it('returns null with no Authorization header', async () => {
    expect(await getInboxViewer(req())).toBeNull()
  })

  it('returns null when the token is invalid', async () => {
    mockSupabaseUser({ error: new Error('invalid token') })
    expect(await getInboxViewer(req('Bearer badtoken'))).toBeNull()
  })

  // The whole point of having a separate list from SUPERADMIN_EMAILS — an admin
  // who is NOT also on INBOX_EMAILS must not get inbox access.
  it('returns null for a valid token whose email is admin-only, not inbox-allowlisted', async () => {
    mockSupabaseUser({ email: 'admin-only@example.com' })
    expect(await getInboxViewer(req('Bearer goodtoken'))).toBeNull()
  })

  it('returns the email when the token is valid and inbox-allowlisted', async () => {
    mockSupabaseUser({ email: 'inbox@example.com' })
    expect(await getInboxViewer(req('Bearer goodtoken'))).toEqual({ email: 'inbox@example.com' })
  })
})
