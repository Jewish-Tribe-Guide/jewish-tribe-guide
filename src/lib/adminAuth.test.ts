import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import {
  getAdminUser,
  getAdminUserForCommunity,
  getAllowedAdminEmails,
  isAllowedAdminEmail,
  isAllowedForCommunity,
} from './adminAuth'
import { getCommunityAdminEmails } from './communityStore'

// A bug here either locks every admin out or, far worse, lets someone in who
// shouldn't be — so both the allowlist parsing and the token-to-email path
// get direct coverage, not just "does it run."

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))
vi.mock('./communityStore', () => ({ getCommunityAdminEmails: vi.fn() }))

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

describe('getAllowedAdminEmails', () => {
  it('splits, trims, and lowercases the comma-separated list', () => {
    vi.stubEnv('ADMIN_EMAILS', ' Admin@Example.com, second@example.com ,third@example.com')
    expect(getAllowedAdminEmails()).toEqual([
      'admin@example.com',
      'second@example.com',
      'third@example.com',
    ])
  })

  it('drops empty entries from stray commas', () => {
    vi.stubEnv('ADMIN_EMAILS', 'a@example.com,,b@example.com,')
    expect(getAllowedAdminEmails()).toEqual(['a@example.com', 'b@example.com'])
  })

  it('is empty when the env var is unset', () => {
    vi.stubEnv('ADMIN_EMAILS', '')
    expect(getAllowedAdminEmails()).toEqual([])
  })
})

describe('isAllowedAdminEmail', () => {
  beforeEach(() => vi.stubEnv('ADMIN_EMAILS', 'admin@example.com'))

  it('matches case-insensitively', () => {
    expect(isAllowedAdminEmail('ADMIN@EXAMPLE.COM')).toBe(true)
  })

  it('matches with surrounding whitespace', () => {
    expect(isAllowedAdminEmail('  admin@example.com  ')).toBe(true)
  })

  it('rejects an email not on the list', () => {
    expect(isAllowedAdminEmail('stranger@example.com')).toBe(false)
  })
})

describe('getAdminUser', () => {
  beforeEach(() => {
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
  })

  it('returns null with no Authorization header', async () => {
    expect(await getAdminUser(req())).toBeNull()
  })

  it('returns null when Supabase config is missing, even with a token', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    expect(await getAdminUser(req('Bearer sometoken'))).toBeNull()
  })

  it('returns null when the token is invalid', async () => {
    mockSupabaseUser({ error: new Error('invalid token') })
    expect(await getAdminUser(req('Bearer badtoken'))).toBeNull()
  })

  it('returns null when the token is valid but the email is not allowlisted', async () => {
    mockSupabaseUser({ email: 'stranger@example.com' })
    expect(await getAdminUser(req('Bearer goodtoken'))).toBeNull()
  })

  it('returns the email when the token is valid and allowlisted', async () => {
    mockSupabaseUser({ email: 'admin@example.com' })
    expect(await getAdminUser(req('Bearer goodtoken'))).toEqual({ email: 'admin@example.com' })
  })

  it('strips the "Bearer " prefix before validating', async () => {
    mockSupabaseUser({ email: 'admin@example.com' })
    await getAdminUser(req('Bearer  goodtoken'))
    const client = vi.mocked(createClient).mock.results[0]!.value
    expect(client.auth.getUser).toHaveBeenCalledWith('goodtoken')
  })
})

// The check that actually stops one community's admin from acting on
// another's data once their emails diverge — see adminAuth.ts's own comment
// on what ADMIN_EMAILS means now that this exists.
describe('isAllowedForCommunity', () => {
  beforeEach(() => vi.stubEnv('ADMIN_EMAILS', 'super@example.com'))

  it('admits an email on the community\'s own configured admin_emails list, case-insensitively', async () => {
    vi.mocked(getCommunityAdminEmails).mockResolvedValue(['philly-admin@example.com'])
    expect(await isAllowedForCommunity('PHILLY-ADMIN@example.com', 'philly')).toBe(true)
    expect(await isAllowedForCommunity('ues-admin@example.com', 'philly')).toBe(false)
  })

  it('admits any email on a multi-person admin_emails list', async () => {
    vi.mocked(getCommunityAdminEmails).mockResolvedValue(['jane@example.com', 'sam@example.com'])
    expect(await isAllowedForCommunity('sam@example.com', 'philly')).toBe(true)
    expect(await isAllowedForCommunity('jane@example.com', 'philly')).toBe(true)
    expect(await isAllowedForCommunity('stranger@example.com', 'philly')).toBe(false)
  })

  it('rejects the global superadmin list once a community has its own admin_emails set', async () => {
    vi.mocked(getCommunityAdminEmails).mockResolvedValue(['philly-admin@example.com'])
    expect(await isAllowedForCommunity('super@example.com', 'philly')).toBe(false)
  })

  it('falls back to the global ADMIN_EMAILS list when the community has no admin_emails configured yet', async () => {
    vi.mocked(getCommunityAdminEmails).mockResolvedValue([])
    expect(await isAllowedForCommunity('super@example.com', 'philly')).toBe(true)
    expect(await isAllowedForCommunity('stranger@example.com', 'philly')).toBe(false)
  })
})

describe('getAdminUserForCommunity', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
  })

  it('returns null with no Authorization header', async () => {
    expect(await getAdminUserForCommunity(req(), 'philly')).toBeNull()
  })

  it('returns null when the token is valid but the email is not this community\'s admin', async () => {
    vi.mocked(getCommunityAdminEmails).mockResolvedValue(['philly-admin@example.com'])
    mockSupabaseUser({ email: 'ues-admin@example.com' })
    expect(await getAdminUserForCommunity(req('Bearer goodtoken'), 'philly')).toBeNull()
  })

  // The actual scenario this whole check exists for: a real, valid session —
  // proven identity — that just isn't authorized for the community being
  // asked about.
  it('returns null for a session that is a valid admin of a DIFFERENT community', async () => {
    vi.mocked(getCommunityAdminEmails).mockImplementation(async (slug) =>
      slug === 'ues' ? ['ues-admin@example.com'] : ['philly-admin@example.com'],
    )
    mockSupabaseUser({ email: 'ues-admin@example.com' })
    expect(await getAdminUserForCommunity(req('Bearer goodtoken'), 'philly')).toBeNull()
  })

  it('returns the email when the token is valid and matches this community\'s admin', async () => {
    vi.mocked(getCommunityAdminEmails).mockResolvedValue(['philly-admin@example.com'])
    mockSupabaseUser({ email: 'philly-admin@example.com' })
    expect(await getAdminUserForCommunity(req('Bearer goodtoken'), 'philly')).toEqual({
      email: 'philly-admin@example.com',
    })
  })
})
