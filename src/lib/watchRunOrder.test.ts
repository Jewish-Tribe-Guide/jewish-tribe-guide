import { describe, expect, it } from 'vitest'
import { orderForRun, watchPriority } from './watchRunOrder'
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
  it('a watch that never ran, or missed a night, goes ahead of everything, most important first', () => {
    const neverRan = w('new-menu', { createdBy: MENU_WATCH_CREATOR, lastRunAt: null })
    const missed = w('missed-site', { lastRunAt: hoursAgo(48) })
    expect(ids(orderForRun([KOSHER, HOSPITAL, neverRan, missed], NOW))).toEqual(['missed-site', 'new-menu', 'kosher', 'hospital'])
  })

  // Vercel starts the cron any time in its hour: two nights apart can be
  // just under 48 hours.
  it('47 hours since a check is a missed night', () => {
    expect(ids(orderForRun([KOSHER, w('missed', { lastRunAt: hoursAgo(47) })], NOW))).toEqual(['missed', 'kosher'])
  })

  it('last night late in the hour is not a missed night', () => {
    expect(ids(orderForRun([w('late-last-night', { lastRunAt: hoursAgo(23.2) }), KOSHER], NOW))).toEqual(['kosher', 'late-last-night'])
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
