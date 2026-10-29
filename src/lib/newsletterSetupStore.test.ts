import { beforeEach, describe, expect, it, vi } from 'vitest'

// The newsletter_setup table, faked: a key made once and kept, looked up
// for the community it's good for, and the hourly check-in.
const db = vi.hoisted(() => ({
  rows: new Map<string, { key: string; checked_at: string | null; account: string | null }>(),
  missing: false,
}))
const MISSING = { message: 'relation "public.newsletter_setup" does not exist' }

vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => ({
      upsert: async (row: { community_id: string; key: string }, opts: { ignoreDuplicates: boolean }) => {
        if (db.missing) return { error: MISSING }
        if (!db.rows.has(row.community_id) || !opts.ignoreDuplicates) db.rows.set(row.community_id, { key: row.key, checked_at: null, account: null })
        return { error: null }
      },
      select: () => {
        let where: [string, string] = ['', '']
        const q = {
          eq: (col: string, v: string) => ((where = [col, v]), q),
          single: async () => ({ data: db.rows.get(where[1]) ?? null, error: null }),
          maybeSingle: async () => {
            if (db.missing) return { data: null, error: MISSING }
            const found = [...db.rows].find(([, r]) => r.key === where[1])
            return { data: found ? { community_id: found[0] } : null, error: null }
          },
        }
        return q
      },
      update: (values: { checked_at: string; account?: string }) => ({
        eq: async (_col: string, community: string) => {
          const row = db.rows.get(community)!
          db.rows.set(community, { ...row, ...values })
          return { error: null }
        },
      }),
    }),
  }),
}))

const { communityOfNewsletterKey, getNewsletterSetup, recordNewsletterCheck } = await import('./newsletterSetupStore')

beforeEach(() => {
  db.rows.clear()
  db.missing = false
})

describe('newsletterSetupStore', () => {
  it('makes a community’s key once, and keeps it', async () => {
    const first = await getNewsletterSetup('riverton')
    expect(first).toMatchObject({ key: expect.stringMatching(/^nl_[A-Za-z0-9_-]{32}$/), checkedAt: null, account: null })
    expect((await getNewsletterSetup('riverton'))?.key).toBe(first?.key)
    expect((await getNewsletterSetup('philly'))?.key).not.toBe(first?.key)
  })

  it('finds the community a key is for, and nothing for anything else', async () => {
    const { key } = (await getNewsletterSetup('riverton'))!
    expect(await communityOfNewsletterKey(key)).toBe('riverton')
    expect(await communityOfNewsletterKey('nl_nope')).toBeNull()
    expect(await communityOfNewsletterKey('a-long-test-secret')).toBeNull()
  })

  it('records the hourly check-in, a row made if there was none', async () => {
    await recordNewsletterCheck('philly', 'guide@gmail.com', new Date('2026-10-29T19:00:00Z'))
    expect(await getNewsletterSetup('philly')).toMatchObject({ checkedAt: '2026-10-29T19:00:00.000Z', account: 'guide@gmail.com' })
    // Google wouldn't say this time: the account it last said stays.
    await recordNewsletterCheck('philly', null, new Date('2026-10-29T20:00:00Z'))
    expect(await getNewsletterSetup('philly')).toMatchObject({ checkedAt: '2026-10-29T20:00:00.000Z', account: 'guide@gmail.com' })
  })

  it('without the table: no setup, no key, and a check-in that fails nothing', async () => {
    db.missing = true
    expect(await getNewsletterSetup('riverton')).toBeNull()
    expect(await communityOfNewsletterKey('nl_x')).toBeNull()
    await expect(recordNewsletterCheck('riverton', null)).resolves.toBeUndefined()
  })
})
