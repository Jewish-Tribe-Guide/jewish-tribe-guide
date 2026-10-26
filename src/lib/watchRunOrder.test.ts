import { describe, expect, it } from 'vitest'
import { orderForRun, runSideBySide, sideBySideKeys, watchPriority, WATCHES_AT_ONCE } from './watchRunOrder'
import { MENU_WATCH_CREATOR, type Watch } from './watches'
import { KEYSTONE_LIST_URL } from './keystoneWatch'
import { MEKOR_LIST_URL } from './mekorWatch'
import { ERUV_WEBSITE_CREATOR } from './eruvWebsite'
import { LISTING_PAGE_FOUND_CREATOR, LISTING_PAGE_WATCH_CREATOR } from './listingPageWatch'

const NOW = Date.parse('2026-10-24T07:47:00Z')
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()

type W = Pick<Watch, 'id' | 'active' | 'kind' | 'url' | 'createdBy' | 'lastRunAt'>
const w = (id: string, over: Partial<W> = {}): W => ({ id, active: true, kind: 'website', url: `https://${id}.example/`, createdBy: null, lastRunAt: hoursAgo(24), ...over })

const KOSHER = w('kosher', { kind: 'keystone_list', url: KEYSTONE_LIST_URL })
const MEKOR = w('mekor', { url: MEKOR_LIST_URL })
const HOSPITAL = w('hospital', { url: 'https://refuah.com/hospitals/jx77h9d00qztqgbbe8e0rfj1r589mgf5' })
const ERUV = w('eruv', { createdBy: ERUV_WEBSITE_CREATOR })
const SHUL = w('shul', { createdBy: LISTING_PAGE_WATCH_CREATOR })
const MIKVAH = w('mikvah', { createdBy: LISTING_PAGE_FOUND_CREATOR })
const SITE = w('site')
const MENU = w('menu', { createdBy: MENU_WATCH_CREATOR })

describe('watchPriority', () => {
  it('sorts each kind of watch into its place', () => {
    expect([KOSHER, MEKOR, HOSPITAL, ERUV, SHUL, MIKVAH, SITE, MENU].map(watchPriority)).toEqual(['kosher', 'kosher', 'hospital', 'eruv', 'times', 'times', 'website', 'menu'])
  })
})

const ids = (ws: readonly W[]) => ws.map((x) => x.id)

describe('orderForRun: the order the night’s run checks the watches in', () => {
  it('most important first when all ran last night, whatever order they were added in', () => {
    expect(ids(orderForRun([MENU, SITE, MIKVAH, ERUV, HOSPITAL, KOSHER], NOW))).toEqual(['kosher', 'hospital', 'eruv', 'mikvah', 'site', 'menu'])
  })

  // Oct 24: the newest 35 had never run, because the run always stopped
  // at the same place.
  it('a watch that never ran, or missed a night, goes ahead of the rest, most important first', () => {
    const neverRan = w('new-menu', { createdBy: MENU_WATCH_CREATOR, lastRunAt: null })
    const missed = w('missed-site', { lastRunAt: hoursAgo(48) })
    expect(ids(orderForRun([SITE, ERUV, neverRan, missed], NOW))).toEqual(['missed-site', 'new-menu', 'eruv', 'site'])
  })

  // Oct 25: a backlog of 33 filled the night, and the kosher list and the
  // Refuah pages, read the night before, were left over.
  it('the kosher lists and hospitals go ahead of a backlog', () => {
    const missed = w('missed-site', { lastRunAt: hoursAgo(48) })
    const neverRan = w('new-menu', { createdBy: MENU_WATCH_CREATOR, lastRunAt: null })
    expect(ids(orderForRun([missed, neverRan, HOSPITAL, MEKOR, KOSHER], NOW))).toEqual(['mekor', 'kosher', 'hospital', 'missed-site', 'new-menu'])
  })

  // Vercel starts the cron any time in its hour: two nights apart can be
  // just under 48 hours.
  it('47 hours since a check is a missed night', () => {
    expect(ids(orderForRun([SITE, w('missed', { createdBy: MENU_WATCH_CREATOR, lastRunAt: hoursAgo(47) })], NOW))).toEqual(['missed', 'site'])
  })

  it('last night late in the hour is not a missed night', () => {
    expect(ids(orderForRun([w('late-last-night', { createdBy: MENU_WATCH_CREATOR, lastRunAt: hoursAgo(23.2) }), SITE], NOW))).toEqual(['site', 'late-last-night'])
  })

  it('the one checked longest ago first, within its place', () => {
    const a = w('a', { lastRunAt: hoursAgo(20) })
    const b = w('b', { lastRunAt: hoursAgo(26) })
    expect(ids(orderForRun([a, b], NOW))).toEqual(['b', 'a'])
  })

  it('leaves out paused watches', () => {
    expect(ids(orderForRun([KOSHER, w('paused', { active: false })], NOW))).toEqual(['kosher'])
  })
})

// Oct 25: one at a time, six slow AI reads held up the rest and 33 of 107
// were left for the next night.
describe('runSideBySide: six at once, never two on one site or for one place', () => {
  type J = { id: string; url: string; resourceId?: string | null }
  const keysOf = (j: J) => sideBySideKeys({ url: j.url, resourceId: j.resourceId ?? null })
  const flush = () => new Promise((r) => setTimeout(r, 0))

  /** Runs `jobs`, each read finishing only when the test says. */
  function controlled(jobs: J[], mayStart = () => true) {
    const open = new Map<string, () => void>()
    let most = 0
    const run = runSideBySide(jobs, {
      keysOf,
      mayStart,
      run: (j) =>
        new Promise<string>((resolve) => {
          open.set(j.id, () => resolve(j.id))
          most = Math.max(most, open.size)
        }),
    })
    const finish = async (id: string) => {
      const done = open.get(id)!
      open.delete(id)
      done()
      await flush()
    }
    return { run, open, finish, most: () => most }
  }

  it('reads six at once, and starts the next as one finishes', async () => {
    const jobs = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, url: `https://site${i}.example/` }))
    const c = controlled(jobs)
    await flush()
    expect([...c.open.keys()]).toEqual(['s0', 's1', 's2', 's3', 's4', 's5'])
    await c.finish('s3')
    expect([...c.open.keys()]).toContain('s6')
    for (const id of ['s0', 's1', 's2', 's4', 's5', 's6']) await c.finish(id)
    await c.finish('s7')
    expect(await c.run).toEqual({ results: jobs.map((j) => j.id), left: 0 })
    expect(c.most()).toBe(WATCHES_AT_ONCE)
  })

  it('one site a page at a time: the next in line on another site goes ahead meanwhile', async () => {
    const jobs = [
      { id: 'refuah1', url: 'https://refuah.com/hospitals/a' },
      { id: 'refuah2', url: 'https://refuah.com/hospitals/b' },
      { id: 'other', url: 'https://www.bzbi.org/' },
    ]
    const c = controlled(jobs)
    await flush()
    expect([...c.open.keys()]).toEqual(['refuah1', 'other'])
    await c.finish('refuah1')
    expect([...c.open.keys()]).toEqual(['other', 'refuah2'])
  })

  it('one place a reading at a time, even on two sites', async () => {
    const jobs = [
      { id: 'menu', url: 'https://judah.example/menu', resourceId: 'r1' },
      { id: 'hours', url: 'https://judah-hours.example/', resourceId: 'r1' },
    ]
    const c = controlled(jobs)
    await flush()
    expect([...c.open.keys()]).toEqual(['menu'])
  })

  it('www. and capitals are the same site; a newsletter is its own', () => {
    expect(sideBySideKeys({ url: 'https://WWW.Refuah.com/x', resourceId: null })).toEqual(sideBySideKeys({ url: 'https://refuah.com/y', resourceId: null }))
    expect(sideBySideKeys({ url: 'mailto:info@kol-tzedek.org', resourceId: 'p' })).toEqual(['site:mailto:info@kol-tzedek.org', 'place:p'])
  })

  it('starts nothing once told to stop, waits for what’s being read, and says how many never started', async () => {
    let open = true
    const jobs = Array.from({ length: 9 }, (_, i) => ({ id: `s${i}`, url: `https://site${i}.example/` }))
    const c = controlled(jobs, () => open)
    await flush()
    open = false
    for (const id of ['s0', 's1', 's2', 's3', 's4', 's5']) await c.finish(id)
    expect(await c.run).toEqual({ results: ['s0', 's1', 's2', 's3', 's4', 's5'], left: 3 })
  })

  it('nothing to read', async () => {
    expect(await runSideBySide([], { keysOf: () => [], mayStart: () => true, run: async () => 1 })).toEqual({ results: [], left: 0 })
  })
})
