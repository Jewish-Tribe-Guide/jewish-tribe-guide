import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Which address visitors' emails give as Reply-To (confirmationEmail.ts).
const rows = vi.hoisted(() => ({ community: null as unknown, setup: null as unknown }))
vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === 'community' ? rows.community : rows.setup, error: null }) }) }),
    }),
  }),
}))

const { getCommunityEmail } = await import('./communityEmailStore')

beforeEach(() => {
  rows.community = { contact_email: null }
  rows.setup = { account: 'phillyguide@gmail.com', checked_at: null }
})
afterEach(() => vi.unstubAllEnvs())

describe('getCommunityEmail', () => {
  it('is the script’s Gmail while the site receives no mail of its own', async () => {
    expect((await getCommunityEmail('philly')).email).toBe('phillyguide@gmail.com')
  })

  // Tracker 100 (Nov 27): a reply to a visitor's email reaches the site,
  // which passes it to the admins.
  it('is the community’s own address once the site receives mail', async () => {
    vi.stubEnv('INBOUND_EMAIL_DOMAIN', 'in.example.org')
    expect((await getCommunityEmail('philly')).email).toBe('philly@in.example.org')
  })

  it('is still the one an admin saved', async () => {
    vi.stubEnv('INBOUND_EMAIL_DOMAIN', 'in.example.org')
    rows.community = { contact_email: 'office@example.org' }
    expect((await getCommunityEmail('philly')).email).toBe('office@example.org')
  })
})
