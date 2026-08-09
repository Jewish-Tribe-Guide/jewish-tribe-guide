import { beforeEach, describe, expect, it, vi } from 'vitest'
import { allCommunityTags, TAGS } from './cacheTags'

// ─────────────────────────────────────────────────────────────────────────────
// The other half of the caching guarantee.
//
// cacheTags.test.ts proves the tag *list* is complete; this proves the write
// path actually invalidates it. Both matter: the content reads are cached with
// `cacheLife('days')`, so anything this function fails to invalidate is a
// change an admin saves and then cannot see for a day.
//
// next/cache and communityStore are mocked because the real ones need a Next
// request context and a Supabase connection respectively — neither of which
// says anything about the logic under test here.
// ─────────────────────────────────────────────────────────────────────────────

const revalidateTag = vi.fn()
const listCommunities = vi.fn()

vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
  cacheTag: () => {},
  cacheLife: () => {},
}))

vi.mock('./communityStore', () => ({
  listCommunities: () => listCommunities(),
}))

const { revalidatePublicContent } = await import('./revalidateContent')

const community = (slug: string) => ({ slug, name: slug, isDefault: false })

beforeEach(() => {
  revalidateTag.mockClear()
  listCommunities.mockReset()
})

/** Just the tag names passed to revalidateTag, in call order. */
const invalidated = () => revalidateTag.mock.calls.map(([tag]) => tag as string)

describe('revalidatePublicContent', () => {
  it('invalidates every content tag for every community', async () => {
    listCommunities.mockResolvedValue([community('philly'), community('baltimore')])

    await revalidatePublicContent()

    expect(new Set(invalidated())).toEqual(
      new Set([TAGS.communities, ...allCommunityTags('philly'), ...allCommunityTags('baltimore')]),
    )
  })

  it('serves the stale value while the fresh one regenerates, so a save never makes a visitor wait', async () => {
    listCommunities.mockResolvedValue([community('philly')])

    await revalidatePublicContent()

    expect(revalidateTag).toHaveBeenCalled()
    for (const [, profile] of revalidateTag.mock.calls) {
      expect(profile).toBe('max')
    }
  })

  it('invalidates the community list itself, not just the content inside it', async () => {
    listCommunities.mockResolvedValue([community('philly')])

    await revalidatePublicContent()

    expect(invalidated()).toContain(TAGS.communities)
  })

  // The blunt-instrument decision in revalidateContent.ts, pinned: over-
  // invalidating costs a refetch, under-invalidating costs an admin their
  // afternoon. If this ever becomes precise, it should be a deliberate change
  // with its own tests, not a silent one.
  it('does not try to guess which community changed', async () => {
    listCommunities.mockResolvedValue([community('philly'), community('baltimore')])

    await revalidatePublicContent()

    expect(invalidated()).toEqual(expect.arrayContaining(allCommunityTags('baltimore')))
  })

  // A failed community read used to be a silent no-op that skipped every
  // invalidation — the admin's save would appear to work and the site would
  // keep serving the old content for a day.
  it('still throws away the community list when the community read fails', async () => {
    listCommunities.mockRejectedValue(new Error('supabase is down'))

    await expect(revalidatePublicContent()).resolves.toBeUndefined()
    expect(invalidated()).toContain(TAGS.communities)
  })

  it('invalidates nothing twice', async () => {
    listCommunities.mockResolvedValue([community('philly'), community('baltimore')])

    await revalidatePublicContent()

    expect(new Set(invalidated()).size).toBe(invalidated().length)
  })
})
