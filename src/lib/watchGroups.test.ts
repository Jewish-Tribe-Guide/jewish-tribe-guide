import { describe, expect, it } from 'vitest'
import { watchGroupOf } from './watchGroups'
import type { Watch } from './watches'

const NOW = Date.parse('2026-10-18T12:00:00Z')
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString()

function watch(over: Partial<Watch>): Watch {
  return {
    id: 'w',
    communityId: 'philly',
    kind: 'website',
    url: 'https://example.org/',
    resourceId: null,
    label: null,
    active: true,
    createdAt: ago(10),
    createdBy: 'admin@example.org',
    lastRunAt: ago(0.1),
    lastOkAt: ago(0.1),
    lastError: null,
    failingSince: null,
    lastFiled: null,
    pageHash: 'h',
    pageChangedAt: null,
    lastCheck: null,
    ...over,
  }
}

const keystone = watch({ id: 'keystone', kind: 'keystone_list', url: 'https://www.keystone-k.org/establishments', createdBy: 'migration 070' })
const mekor = watch({ id: 'mekor', url: 'https://www.mekorhabracha.org/center-city/' })
const refuah = watch({ id: 'refuah', url: 'https://refuah.com/hospitals/jx77h9d00qztqgbbe8e0rfj1r589mgf5', resourceId: 'h1' })
const menu = watch({ id: 'menu', url: 'https://judah.example/menu', resourceId: 'f1', createdBy: 'menu links' })
const newsletter = watch({ id: 'news', url: 'mailto:info@lms.org', resourceId: 's1', createdBy: 'shul newsletters' })
const notAShul = watch({ id: 'ignored', url: 'mailto:no-reply@accounts.google.com', createdBy: 'shul newsletters: not a shul', active: false })
const page = watch({ id: 'page', url: 'https://bzbi.org/worship' })
const shulPage = watch({ id: 'shulPage', url: 'https://lms.org/davening', resourceId: 's1', createdBy: 'listing pages' })

describe('watchGroupOf', () => {
  it('sorts each watch into what it keeps current', () => {
    expect(watchGroupOf(keystone)).toBe('kosher')
    expect(watchGroupOf(mekor)).toBe('kosher')
    expect(watchGroupOf(refuah)).toBe('hospital')
    expect(watchGroupOf(menu)).toBe('menu')
    // A shul's times, from its website or its newsletter, are one (Oct 20).
    expect(watchGroupOf(newsletter)).toBe('times')
    expect(watchGroupOf(notAShul)).toBe('times')
    expect(watchGroupOf(page)).toBe('other')
    expect(watchGroupOf(shulPage)).toBe('times')
  })

  // A listing's own page goes under what it keeps current, by what its
  // listing has: a mikvah's hours page with Hours, a shul's with its times.
  it('puts a listing’s own page with times or hours by what its listing has', () => {
    const mikvahPage = watch({ id: 'mikvah', url: 'https://mikvah.example/hours', resourceId: 'm1', createdBy: 'listing pages' })
    const readsOf = (id: string) => (id === 'm1' ? 'hours' : id === 's1' ? 'times' : null)
    expect(watchGroupOf(mikvahPage, readsOf)).toBe('hours')
    expect(watchGroupOf(shulPage, readsOf)).toBe('times')
    // Its listing gone: the label it was given still says.
    const labelled = watch({ ...mikvahPage, resourceId: 'gone', label: 'Mikvah · hours on their website' })
    expect(watchGroupOf(labelled, readsOf)).toBe('hours')
  })

  // Only a page added as the listing's own is read for its times or hours:
  // an admin's plain watch tied to a shul is still just checked for a change.
  it('keeps a plain watch tied to a shul with the other pages', () => {
    expect(watchGroupOf(watch({ url: 'https://lms.org/davening', resourceId: 's1' }))).toBe('other')
  })

  // An admin's own watch on a menu page is an ordinary page watch: only
  // the daily run's own menu watches are "Menus" (MENU_WATCH_CREATOR).
  it('keeps an admin’s own watch on a menu page with the other pages', () => {
    expect(watchGroupOf(watch({ url: 'https://judah.example/menu' }))).toBe('other')
  })
})
