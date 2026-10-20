import { describe, expect, it } from 'vitest'
import { groupWatches, watchGroupOf } from './watchGroups'
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

describe('groupWatches', () => {
  it('lists the groups in a fixed order, leaving out empty ones', () => {
    const groups = groupWatches([page, shulPage, menu, refuah, newsletter, keystone], NOW)
    expect(groups.map((g) => g.key)).toEqual(['times', 'kosher', 'menu', 'hospital', 'other'])
    expect(groups.find((g) => g.key === 'times')?.label).toBe('Shul’s times')
    expect(groups[0].rows.map((r) => r.watch.id).sort()).toEqual([newsletter.id, shulPage.id].sort())
    expect(groupWatches([menu], NOW).map((g) => g.key)).toEqual(['menu'])
    expect(groupWatches([], NOW)).toEqual([])
  })

  it('puts what needs a look first, then paused, then the rest by name, and not-a-shul senders last', () => {
    const working = [
      watch({ id: 'b', label: 'Bar Bombon menu', createdBy: 'menu links' }),
      watch({ id: 'a', label: 'Ants Pants menu', createdBy: 'menu links' }),
    ]
    const broken = watch({ id: 'broken', label: 'Zevi’s menu', createdBy: 'menu links', failingSince: ago(2), lastError: 'The page answered 404' })
    const stale = watch({ id: 'stale', label: 'Yum menu', createdBy: 'menu links', lastRunAt: ago(4) })
    const paused = watch({ id: 'paused', label: 'Mia’s menu', createdBy: 'menu links', active: false })
    const [menus] = groupWatches([...working, paused, broken, stale], NOW)
    expect(menus.rows.map((r) => r.watch.id)).toEqual(['stale', 'broken', 'paused', 'a', 'b'])
    expect(menus.rows.map((r) => r.needsLook)).toEqual([true, true, false, false, false])

    const unlinked = watch({ id: 'unlinked', url: 'mailto:office@yi.org', createdBy: 'shul newsletters', active: false, lastRunAt: null })
    const [news] = groupWatches([notAShul, newsletter, unlinked], NOW)
    expect(news.rows.map((r) => r.watch.id)).toEqual(['unlinked', 'news', 'ignored'])
    expect(news.rows.map((r) => r.needsLook)).toEqual([true, false, false])
  })

  it('counts what each heading should say: the total, and what needs doing', () => {
    const unlinked = watch({ id: 'u', url: 'mailto:office@yi.org', createdBy: 'shul newsletters', active: false, lastRunAt: null })
    const failing = watch({ id: 'f', url: 'mailto:a@b.org', resourceId: 's2', createdBy: 'shul newsletters', failingSince: ago(1), lastError: 'No newsletter for a month' })
    const paused = watch({ id: 'p', url: 'mailto:c@d.org', resourceId: 's3', createdBy: 'shul newsletters', active: false })
    const [news] = groupWatches([newsletter, unlinked, failing, paused, notAShul], NOW)
    expect(news.label).toBe('Shul’s times')
    expect(news.rows).toHaveLength(5)
    expect(news.counts).toEqual({ toLink: 1, notWorking: 1, paused: 1 })
    // A sender marked not a shul is switched off, but isn't "paused".
    expect(groupWatches([notAShul], NOW)[0].counts).toEqual({ toLink: 0, notWorking: 0, paused: 0 })
  })

  // A row the admin just acted on (linked, paused) keeps the place it had,
  // so it doesn't jump away from under the pointer or vanish into a closed
  // group, and isn't counted as needing a look once it doesn't.
  it('keeps a row the admin just acted on where it was, and shown', () => {
    const rows = [
      watch({ id: 'a', label: 'A', createdBy: 'menu links' }),
      watch({ id: 'm', label: 'M', createdBy: 'menu links', active: false }),
      watch({ id: 'z', label: 'Z', createdBy: 'menu links' }),
    ]
    // Before: M is paused, so first. The admin resumes it.
    const [before] = groupWatches(rows, NOW)
    expect(before.rows.map((r) => r.watch.id)).toEqual(['m', 'a', 'z'])
    const resumed = rows.map((w) => (w.id === 'm' ? { ...w, active: true } : w))
    const [after] = groupWatches(resumed, NOW, new Map([['m', before.rows[0].rank]]))
    expect(after.rows.map((r) => [r.watch.id, r.keepShown])).toEqual([
      ['m', true],
      ['a', false],
      ['z', false],
    ])
    expect(after.counts.paused).toBe(0)
  })
})
