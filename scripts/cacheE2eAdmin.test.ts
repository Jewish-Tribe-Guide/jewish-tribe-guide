import { describe, expect, it, vi } from 'vitest'
import { ADMIN_WRITE_TEST_ADMIN_EMAIL, CACHE_TEST_ADMIN_EMAIL } from './cacheE2eAdmin.mjs'

// The bug this guards against: cache-roundtrip's and admin-write's
// auth.setup.ts both used to call resolveDefaultCommunityAdminEmail with no
// way to make it return different things, so on a pristine test project
// (every community's admin_email unset — exactly CI's disposable
// TEST_SUPABASE project) they always resolved to the same hardcoded
// CACHE_TEST_ADMIN_EMAIL. Both suites then minted a magic link for that one
// identity, and generateLink invalidates whichever link was already
// outstanding for a user — so whichever suite's verifyOtp ran second in CI
// failed with "invalid or has expired" nearly every time the two jobs ran in
// parallel. ci.yml's fix was ordering (`needs: [unit, cache-roundtrip]`);
// this is the fix at the source, so that ordering could be removed.
function mockSupabaseWithCommunities(
  communities: { admin_email: string | null; is_default: boolean; sort_order: number }[],
) {
  vi.doMock('@supabase/supabase-js', () => ({
    createClient: () => ({
      from: () => ({
        select: () => ({
          order: () => Promise.resolve({ data: communities }),
        }),
      }),
    }),
  }))
}

describe('resolveDefaultCommunityAdminEmail', () => {
  it('falls back to the caller-supplied identity, not always CACHE_TEST_ADMIN_EMAIL, when admin_email is unset', async () => {
    vi.resetModules()
    mockSupabaseWithCommunities([{ admin_email: null, is_default: true, sort_order: 0 }])
    const { resolveDefaultCommunityAdminEmail: resolve } = await import('./cacheE2eAdmin.mjs')

    expect(await resolve('url', 'key', ADMIN_WRITE_TEST_ADMIN_EMAIL)).toBe(ADMIN_WRITE_TEST_ADMIN_EMAIL)
    expect(await resolve('url', 'key', CACHE_TEST_ADMIN_EMAIL)).toBe(CACHE_TEST_ADMIN_EMAIL)
  })

  it('defaults to CACHE_TEST_ADMIN_EMAIL when no fallback is passed, so cache-roundtrip did not need to change its callsite', async () => {
    vi.resetModules()
    mockSupabaseWithCommunities([{ admin_email: null, is_default: true, sort_order: 0 }])
    const { resolveDefaultCommunityAdminEmail: resolve } = await import('./cacheE2eAdmin.mjs')

    expect(await resolve('url', 'key')).toBe(CACHE_TEST_ADMIN_EMAIL)
  })

  it('cache-roundtrip and admin-write resolve to two DIFFERENT identities on a pristine project', async () => {
    vi.resetModules()
    mockSupabaseWithCommunities([{ admin_email: null, is_default: true, sort_order: 0 }])
    const { resolveDefaultCommunityAdminEmail: resolve } = await import('./cacheE2eAdmin.mjs')

    const cacheRoundtripIdentity = await resolve('url', 'key', CACHE_TEST_ADMIN_EMAIL)
    const adminWriteIdentity = await resolve('url', 'key', ADMIN_WRITE_TEST_ADMIN_EMAIL)

    expect(cacheRoundtripIdentity).not.toBe(adminWriteIdentity)
  })

  it('still prefers a real, configured admin_email over either fallback (the shared-dev-project case)', async () => {
    vi.resetModules()
    mockSupabaseWithCommunities([{ admin_email: 'real-admin@example.com', is_default: true, sort_order: 0 }])
    const { resolveDefaultCommunityAdminEmail: resolve } = await import('./cacheE2eAdmin.mjs')

    expect(await resolve('url', 'key', ADMIN_WRITE_TEST_ADMIN_EMAIL)).toBe('real-admin@example.com')
  })
})

describe('mintMagicLinkSession', () => {
  // Fakes standing in for the service-role and anon clients: each link is
  // numbered, and `redeems` says what redeeming the nth one answers.
  const clients = (redeems: ({ session: object } | { error: string })[]) => {
    let n = 0
    const admin = { auth: { admin: { generateLink: vi.fn(async () => ({ data: { properties: { hashed_token: `t${++n}` } }, error: null })) } } }
    const anon = {
      auth: {
        verifyOtp: vi.fn(async () => {
          const r = redeems[n - 1]
          return 'error' in r ? { data: { session: null }, error: { message: r.error } } : { data: { session: r.session }, error: null }
        }),
      },
    }
    return { admin, anon }
  }
  const CANCELLED = 'Email link is invalid or has expired'
  const opts = { pause: () => 0 }

  it('mints a fresh link when another suite’s sign-in cancelled the first (CI, Nov 3)', async () => {
    const { mintMagicLinkSession } = await import('./cacheE2eAdmin.mjs')
    const { admin, anon } = clients([{ error: CANCELLED }, { error: CANCELLED }, { session: { access_token: 'a' } }])
    expect(await mintMagicLinkSession(admin, anon, 'x@test.invalid', opts)).toEqual({ access_token: 'a' })
    expect(admin.auth.admin.generateLink).toHaveBeenCalledTimes(3)
  })

  it('gives up after its tries, saying how many', async () => {
    const { mintMagicLinkSession } = await import('./cacheE2eAdmin.mjs')
    const { admin, anon } = clients(Array(5).fill({ error: CANCELLED }))
    await expect(mintMagicLinkSession(admin, anon, 'x@test.invalid', opts)).rejects.toThrow(`${CANCELLED} (5 tries)`)
  })

  it('does not retry anything else', async () => {
    const { mintMagicLinkSession } = await import('./cacheE2eAdmin.mjs')
    const { admin, anon } = clients([{ error: 'User not found' }, { session: {} }])
    await expect(mintMagicLinkSession(admin, anon, 'x@test.invalid', opts)).rejects.toThrow('Could not redeem the magic link: User not found')
    expect(admin.auth.admin.generateLink).toHaveBeenCalledTimes(1)
  })
})
