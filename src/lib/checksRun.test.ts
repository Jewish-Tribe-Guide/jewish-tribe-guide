import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import { checksRun, watchCheckKind } from './checksRun'
import { MENU_WATCH_CREATOR, type Watch } from './watches'
import { LISTING_PAGE_FOUND_CREATOR, LISTING_PAGE_WATCH_CREATOR } from './listingPageWatch'
import { NEWSLETTER_WATCH_CREATOR } from './newsletter'
import { ERUV_WEBSITE_CREATOR } from './eruvWebsite'

// The user, Oct 23: the trust sheet said only "Menus and eruv status" while
// every shul's and mikvah's page, Refuah and both kosher lists were read
// each morning. Read off the listings' dates alone, a check that ran and
// found a difference dated nothing.

const SHULS = makeCategory({ id: 'synagogue', detailFields: [{ key: 'minyanim', label: 'Davening Times', type: 'minyanim' }] })
const MIKVAH = makeCategory({
  id: 'mikvah',
  detailFields: [
    { key: 'womenTevillah', label: 'Women', type: 'boolean' },
    { key: 'womenHours', label: 'Women’s hours', type: 'hours', audienceKey: 'womenTevillah' },
  ],
})
const FOOD = makeCategory({ id: 'restaurant', detailFields: [{ key: 'hours', label: 'Hours', type: 'hours' }] })
const CATEGORIES = [SHULS, MIKVAH, FOOD]
const LISTINGS = [
  { id: 'shul', category: 'synagogue' },
  { id: 'mik', category: 'mikvah' },
  { id: 'food', category: 'restaurant' },
  { id: 'hosp', category: 'hospital' },
]

type W = Parameters<typeof checksRun>[0][number]
const w = (over: Partial<W>): W => ({ kind: 'website', url: 'https://example.org/', resourceId: null, createdBy: 'admin@example.org', active: true, lastOkAt: '2026-10-22T07:00:00Z', ...over })

describe('what kind of check a watch is', () => {
  const kind = (over: Partial<Watch>) => watchCheckKind(w(over), CATEGORIES.find((c) => c.id === LISTINGS.find((l) => l.id === over.resourceId)?.category))
  it('the kosher lists, Refuah, an eruv’s website and a menu', () => {
    expect(kind({ kind: 'keystone_list' })).toBe('kosher')
    expect(kind({ url: 'https://www.mekorhabracha.org/center-city' })).toBe('kosher')
    expect(kind({ url: 'https://refuah.com/hospitals/jx77h9d00qztqgbbe8e0rfj1r589mgf5', resourceId: 'hosp' })).toBe('hospitals')
    expect(kind({ createdBy: ERUV_WEBSITE_CREATOR })).toBe('eruv')
    expect(kind({ createdBy: MENU_WATCH_CREATOR, resourceId: 'food' })).toBe('menus')
  })

  it('a shul’s page or newsletter is its times; a mikvah’s page its hours', () => {
    expect(kind({ createdBy: LISTING_PAGE_WATCH_CREATOR, resourceId: 'shul' })).toBe('times')
    expect(kind({ createdBy: LISTING_PAGE_FOUND_CREATOR, resourceId: 'shul' })).toBe('times')
    expect(kind({ createdBy: NEWSLETTER_WATCH_CREATOR, url: 'mailto:office@shul.org', resourceId: 'shul' })).toBe('times')
    expect(kind({ createdBy: LISTING_PAGE_FOUND_CREATOR, resourceId: 'mik' })).toBe('mikvah')
  })

  it('names nothing for a restaurant’s own hours, a plain page, or a sender tied to no shul', () => {
    expect(kind({ createdBy: LISTING_PAGE_FOUND_CREATOR, resourceId: 'food' })).toBeNull()
    expect(kind({})).toBeNull()
    expect(kind({ createdBy: NEWSLETTER_WATCH_CREATOR, url: 'mailto:someone@example.org' })).toBeNull()
  })
})

describe('the checks that ran', () => {
  it('each kind once, at its latest proper read', () => {
    const got = checksRun(
      [
        w({ createdBy: LISTING_PAGE_FOUND_CREATOR, resourceId: 'shul', lastOkAt: '2026-10-21T07:00:00Z' }),
        w({ createdBy: LISTING_PAGE_WATCH_CREATOR, resourceId: 'shul', lastOkAt: '2026-10-23T07:00:00Z' }),
        w({ kind: 'keystone_list' }),
      ],
      LISTINGS,
      CATEGORIES,
    )
    expect(got).toEqual([
      { kind: 'times', at: '2026-10-23T07:00:00Z' },
      { kind: 'kosher', at: '2026-10-22T07:00:00Z' },
    ])
  })

  it('claims nothing for a watch switched off or never read properly', () => {
    expect(checksRun([w({ kind: 'keystone_list', active: false }), w({ kind: 'keystone_list', lastOkAt: null })], LISTINGS, CATEGORIES)).toEqual([])
  })
})
