import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/communityStore', () => ({
  listCommunities: async () => [
    { slug: 'philly', name: 'Philly Jewish Guide' },
    { slug: 'riverton', name: 'Riverton Jewish Guide' },
  ],
}))
vi.mock('@/lib/loadCommunityContent', () => ({ loadCommunityContent: vi.fn() }))
vi.mock('@/components/admin/AdminAuthGate', () => ({ default: () => null }))

const { generateMetadata } = await import('./layout')
const meta = (community: string) =>
  generateMetadata({ params: Promise.resolve({ community }) } as Parameters<typeof generateMetadata>[0])

describe('admin tab title', () => {
  it('names the community whose admin it is', async () => {
    expect((await meta('riverton')).title).toBe('Admin · Riverton Jewish Guide')
    expect((await meta('philly')).title).toBe('Admin · Philly Jewish Guide')
  })

  it('leaves an unknown community to the 404', async () => {
    expect(await meta('nowhere')).toEqual({})
  })
})
