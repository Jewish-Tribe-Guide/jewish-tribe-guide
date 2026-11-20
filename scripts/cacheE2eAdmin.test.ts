import { describe, expect, it, vi } from 'vitest'
import { ADMIN_WRITE_TEST_ADMIN_EMAIL, CACHE_TEST_ADMIN_EMAIL } from './cacheE2eAdmin.mjs'

// cache-roundtrip and admin-write sign in at the same moment in CI, and
// generateLink cancels any link still outstanding for that user, so the two
// must never be the same person. Both are listed on the community they
// change (writeSuiteCommunity.mjs), so neither borrows a real admin's.
describe('the write suites\' admins', () => {
  it('are two different people, both on the write community\'s own list', async () => {
    const { WRITE_SUITE_ADMINS } = await import('./writeSuiteCommunity.mjs')
    expect(CACHE_TEST_ADMIN_EMAIL).not.toBe(ADMIN_WRITE_TEST_ADMIN_EMAIL)
    expect(WRITE_SUITE_ADMINS).toEqual([CACHE_TEST_ADMIN_EMAIL, ADMIN_WRITE_TEST_ADMIN_EMAIL])
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
