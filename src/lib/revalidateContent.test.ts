import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { allCommunityTags, TAGS } from './cacheTags'
import { IN_FLIGHT_RENDER_GRACE_MS } from './inFlightRenderGrace'

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
const revalidatePath = vi.fn()
const listCommunities = vi.fn()
const afterTasks: (() => Promise<void>)[] = []

vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
  cacheTag: () => {},
  cacheLife: () => {},
}))

vi.mock('next/server', () => ({
  after: (task: () => Promise<void>) => void afterTasks.push(task),
}))

vi.mock('./communityStore', () => ({
  listCommunities: () => listCommunities(),
}))

const { revalidatePublicContent } = await import('./revalidateContent')

const community = (slug: string) => ({ slug, name: slug, isDefault: false })

beforeEach(() => {
  revalidateTag.mockClear()
  revalidatePath.mockClear()
  listCommunities.mockReset()
  afterTasks.length = 0
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

  // The race behind e2e-cache's "two admin saves in quick succession" test: a
  // regeneration already running at the save read the old rows, and Next
  // stores it stamped with its finish time, so the first pass alone misses it.
  it('invalidates every public screen again once in-flight renders have finished', async () => {
    vi.useFakeTimers()
    try {
      listCommunities.mockResolvedValue([community('philly'), community('baltimore')])

      await revalidatePublicContent()
      expect(revalidatePath, 'the second pass waits for after() and the grace period').not.toHaveBeenCalled()
      expect(afterTasks).toHaveLength(1)

      const task = afterTasks[0]()
      await vi.advanceTimersByTimeAsync(IN_FLIGHT_RENDER_GRACE_MS)
      await task
      // The pattern as a layout: one call reaches every screen of every
      // community, through a tag (_N_T_/[community]/layout) the first pass did
      // not use — Next drops a repeat within one request.
      expect(revalidatePath).toHaveBeenCalledExactlyOnceWith('/[community]', 'layout')
      expect(invalidated()).not.toContain('_N_T_/[community]/layout')
    } finally {
      vi.useRealTimers()
    }
  })

  it('schedules the second pass even when the community read fails', async () => {
    listCommunities.mockRejectedValue(new Error('supabase is down'))

    await revalidatePublicContent()

    expect(afterTasks).toHaveLength(1)
  })
})

// The second pass keeps the function alive for IN_FLIGHT_RENDER_GRACE_MS after
// the response. Fine for an admin save or a cron run; not for a route any
// visitor can call in a loop, which is why the public write routes (confirm,
// item, item/gone) invalidate their one tag directly instead. A new public
// caller has to be a decision, not an import someone reached for.
describe('who may call revalidatePublicContent', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
    )
  // By import, not by name: several files mention it in a comment ("does NOT
  // call revalidatePublicContent()"), and an import is what a call needs.
  const callers = files('src').filter((f) =>
    /import\s*\{[^}]*\brevalidatePublicContent\b[^}]*\}\s*from\s*'@\/lib\/revalidateContent'/.test(readFileSync(f, 'utf-8')),
  )

  it('is only admin routes and cron jobs', () => {
    expect(callers.length, 'the scan should find the admin routes that do call it').toBeGreaterThan(10)
    const others = callers.filter(
      (f) => !/^src\/app\/api\/(admin|cron)\//.test(f),
    )
    expect(others, 'a public route calling this holds a function open for every visitor request').toEqual([])
  })
})
