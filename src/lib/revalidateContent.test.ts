import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { allCommunityTags, communityPagesTag, TAGS } from './cacheTags'
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

const order: string[] = []
const bumped: (string[] | undefined)[] = []
vi.mock('./contentStamp', () => ({
  bumpContentStamp: async (communities?: string[]) => void (order.push('bump'), bumped.push(communities)),
}))

const { revalidatePublicContent } = await import('./revalidateContent')

const community = (slug: string) => ({ slug, name: slug, isDefault: false })

beforeEach(() => {
  revalidateTag.mockClear()
  revalidatePath.mockClear()
  listCommunities.mockReset()
  afterTasks.length = 0
  bumped.length = 0
})

/** Just the tag names passed to revalidateTag, in call order. */
const invalidated = () => revalidateTag.mock.calls.map(([tag]) => tag as string)

describe('revalidatePublicContent', () => {
  // Nov 16: an open tab asks whether anything changed; the stored stamp is
  // the answer, so every save moves it, and before the invalidation, so a
  // page regenerated after it is built with the new one.
  it('moves the content stamp before invalidating anything', async () => {
    order.length = 0
    listCommunities.mockResolvedValue([community('philly')])
    revalidateTag.mockImplementation(() => void order.push('tag'))
    await revalidatePublicContent()
    revalidateTag.mockReset()
    expect(order[0]).toBe('bump')
    expect(order).toContain('tag')
  })

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

  // A new community's address read the stale list and 404'd until a
  // background refresh landed (community-editor.spec.ts in CI, PR 387).
  it('expires the community list outright when a community was just added', async () => {
    listCommunities.mockResolvedValue([community('philly')])

    await revalidatePublicContent({ newCommunity: 'fresh' })

    expect(revalidateTag).toHaveBeenCalledWith(TAGS.communities, { expire: 0 })
    for (const [tag, profile] of revalidateTag.mock.calls) {
      if (tag !== TAGS.communities) expect(profile).toBe('max')
    }
  })

  // Expiring wasn't enough (Nov 18, community-editor.spec.ts:61, 1 run in 4
  // on two workers): Next hands a read the result of a fill another request
  // already started, without checking whether it began before the
  // invalidation (use-cache-wrapper's cross-request join). A fill begun
  // before the insert still answered after the expiry, without the new
  // community, and its address 404'd. The next read after that fill is a
  // fresh one, so asking again until the list has it settles it before the
  // admin is sent there.
  it('waits until the community list holds the new community', async () => {
    let expired = false
    revalidateTag.mockImplementation((tag) => {
      if (tag === TAGS.communities) expired = true
    })
    const reads: boolean[] = []
    let afterExpiry = 0
    listCommunities.mockImplementation(async () => {
      reads.push(expired)
      if (!expired) return [community('philly')]
      // The first read after the expiry joins the fill already running.
      afterExpiry += 1
      return afterExpiry === 1 ? [community('philly')] : [community('philly'), community('fresh')]
    })

    await revalidatePublicContent({ newCommunity: 'fresh' })
    revalidateTag.mockReset()

    expect(reads.filter(Boolean)).toHaveLength(2)
  })

  it('gives up waiting for a new community after a few reads rather than hanging the save', async () => {
    listCommunities.mockResolvedValue([community('philly')])

    await revalidatePublicContent({ newCommunity: 'fresh' })

    expect(listCommunities.mock.calls.length).toBeLessThanOrEqual(6)
  })

  it('invalidates the community list itself, not just the content inside it', async () => {
    listCommunities.mockResolvedValue([community('philly')])

    await revalidatePublicContent()

    expect(invalidated()).toContain(TAGS.communities)
  })

  // Named nothing (a nightly job, the site owner's console): every
  // community, rather than a guess at which one changed.
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

// Nov 20: every save made every community's pages stale, and every open
// tab of every community re-render on its return. A community admin's save
// names its community now; only the site owner's routes and the nightly
// jobs reach them all.
describe('one community’s save', () => {
  it('invalidates that community’s content and no other’s', async () => {
    listCommunities.mockResolvedValue([community('philly'), community('ues')])

    await revalidatePublicContent({ communities: ['philly'] })

    expect(new Set(invalidated())).toEqual(new Set(allCommunityTags('philly')))
    for (const [, profile] of revalidateTag.mock.calls) expect(profile).toBe('max')
  })

  // Every page of every community carries `communities`: touching it would
  // make them all stale again. The default location's route, the one
  // community save that changes that list, invalidates it itself.
  it('leaves the community list alone', async () => {
    await revalidatePublicContent({ communities: ['philly'] })
    expect(invalidated()).not.toContain(TAGS.communities)
  })

  it('moves that community’s stamp only', async () => {
    listCommunities.mockResolvedValue([community('philly')])
    await revalidatePublicContent({ communities: ['philly'] })
    await revalidatePublicContent()
    expect(bumped).toEqual([['philly'], undefined])
  })

  it('invalidates that community’s pages again once in-flight renders have finished', async () => {
    vi.useFakeTimers()
    try {
      await revalidatePublicContent({ communities: ['philly'] })
      expect(afterTasks).toHaveLength(1)
      revalidateTag.mockClear()

      const task = afterTasks[0]()
      await vi.advanceTimersByTimeAsync(IN_FLIGHT_RENDER_GRACE_MS)
      await task
      // Expired outright, as the pattern pass was, on a tag the first pass
      // didn't use (Next drops a repeat within one request).
      expect(revalidateTag).toHaveBeenCalledExactlyOnceWith(communityPagesTag('philly'), { expire: 0 })
      expect(allCommunityTags('philly')).not.toContain(communityPagesTag('philly'))
      expect(revalidatePath).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

// The pages carry the tag the second pass expires because the one cached
// read every public screen makes, the layout's site settings, is tagged
// with it. Built pages are checked by e2e-cache; this pins the wiring.
describe('communityPagesTag', () => {
  it('is on the site settings every public page reads', () => {
    const src = readFileSync('src/lib/siteSettingsStore.ts', 'utf-8')
    const fn = src.slice(src.indexOf('export async function getSiteSettings('))
    expect(fn.slice(0, fn.indexOf('\n}\n'))).toMatch(/cacheTag\(.*communityPagesTag\(community\)/)
  })

  it('is one community’s', () => {
    expect(communityPagesTag('philly')).not.toBe(communityPagesTag('ues'))
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
    // Most admin routes invalidate through their wrapper now (adminRoute.ts),
    // so the callers are it, the cron jobs, and the few routes with their own.
    expect(callers, 'the scan should find the wrapper').toContain('src/lib/adminRoute.ts')
    expect(callers.length, 'the scan should find the cron jobs and routes that call it too').toBeGreaterThan(3)
    const others = callers.filter(
      // adminRoute.ts is the admin routes' own wrapper, held to them below.
      (f) => !/^src\/app\/api\/(admin|cron)\//.test(f) && f !== 'src/lib/adminRoute.ts',
    )
    expect(others, 'a public route calling this holds a function open for every visitor request').toEqual([])
  })

  it('reaches no public route through the admin routes’ wrapper', () => {
    const wrapped = files('src').filter((f) => /from\s*'@\/lib\/adminRoute'/.test(readFileSync(f, 'utf-8')))
    expect(wrapped.length, 'the scan should find the routes that use it').toBeGreaterThan(10)
    expect(wrapped.filter((f) => !/^src\/app\/api\/admin\//.test(f))).toEqual([])
  })
})

describe('creating a community', () => {
  // The route is the only caller that adds a community; without the flag its
  // page reads the stale list and 404s for the first visitor.
  it('expires the community list outright, so the new address works at once', () => {
    const src = readFileSync('src/app/api/admin/communities/route.ts', 'utf-8')
    expect(src).toContain('revalidatePublicContent({ newCommunity: community.slug })')
  })
})
