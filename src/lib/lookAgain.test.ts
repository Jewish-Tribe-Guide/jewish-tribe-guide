import { describe, expect, it } from 'vitest'
import { dueQueue, lookAgainFix, lookItems, lookView, menuWhy, pickFound, pickPage, LOOK_AGAIN_MS, type LookInput, type LookItem } from './lookAgain'
import { nextRunAt, NIGHTLY_JOBS, type JobRun } from './jobRuns'

// Look again (board XSuFCMdLQmBYNJqfWaEM3A, Oct 27): each one tried again a
// month after its last try, a few a night; what it finds offered, never set.

const NOW = Date.parse('2026-11-03T18:00:00Z')
const NEXT = nextRunAt(NIGHTLY_JOBS.find((j) => j.id === 'look-again')!, NOW)

const input = (over: Partial<LookInput> = {}): LookInput => ({ eruvim: [], menus: [], google: [], rows: [], ...over })
const menu = (id: string, name: string, note: string, readAt: string, status = 'failed') => ({ id, name, reading: { status, note, readAt } })
const unmatched = (id: string, name: string, over: Partial<LookInput['google'][number]> = {}) => ({ id, name, matched: false, notOnGoogle: null, ...over })

describe('menuWhy: a failed reading’s note in the drawing’s few words', () => {
  it.each([
    ['Couldn’t read a menu on its website: it turned the reader away (403).', 'Turned the reader away'],
    ['The provided text is a cookie-consent notice, not a menu, and it names no dishes.', 'Only a cookie notice'],
    ['The provided page text does not include a menu or name any dishes.', 'No dishes named'],
    ['An online grocery catalog, not a menu of prepared dishes.', 'Not a menu'],
    ['Its menu took too long to read.', 'Took too long to read'],
    ['Saved as its menu link, but it couldn’t be read: its address doesn’t lead to a public website.', 'Its menu link doesn’t open'],
    ['Couldn’t read a menu on its website.', 'No menu found on its website'],
    [null, 'Couldn’t be read'],
  ])('%s', (note, why) => expect(menuWhy(note)).toBe(why))
})

describe('lookItems: what it tries', () => {
  it('an eruv with nowhere to read its status, a menu that couldn’t be read, a place Google has no match for', () => {
    const items = lookItems(
      input({
        eruvim: [
          { id: 'ep', name: 'Elkins Park Eruv', website: 'https://www.yiep.org/eruv-map', statusUrl: null, statusEmail: null },
          { id: 'cc', name: 'Center City Eruv', website: 'https://centercityeruv.com', statusUrl: 'https://centercityeruv.com', statusEmail: null },
          { id: 'ne', name: 'Northeast Eruv', website: 'https://jcor.org', statusUrl: null, statusEmail: 'ne@groups.io' },
          { id: 'off', name: 'Hidden Eruv', website: 'https://x.org', statusUrl: null, active: false },
          { id: 'none', name: 'No Site Eruv', website: null, statusUrl: null },
        ],
        menus: [menu('m1', '20th Street Pizza', 'it turned the reader away (403)', '2026-10-22T14:00:00Z'), menu('m2', 'Read Fine', '', '2026-10-22T14:00:00Z', 'proposed')],
        google: [
          unmatched('g1', 'The Kosher Grill'),
          unmatched('g2', 'Sababa Falafel', { notOnGoogle: '2026-10-26T12:00:00Z' }),
          { id: 'g3', name: 'Matched', matched: true, notOnGoogle: null },
        ],
      }),
    )
    expect(items.map((i) => [i.kind, i.name, i.why, i.lastTry])).toEqual([
      ['eruv', 'Elkins Park Eruv', 'No status page on yiep.org', null],
      ['menu', '20th Street Pizza', 'Turned the reader away', '2026-10-22T14:00:00Z'],
      ['google', 'The Kosher Grill', 'Never looked for', null],
      ['google', 'Sababa Falafel', 'You said Not on Google', '2026-10-26T12:00:00Z'],
    ])
  })

  it('its own row: its last try, what it found, and Stop trying', () => {
    const found = { placeId: 'P', name: 'The Kosher Grill', address: '3601 S Broad St', at: '2026-11-01T09:00:00Z' }
    const [grill, sababa] = lookItems(
      input({
        google: [unmatched('g1', 'The Kosher Grill'), unmatched('g2', 'Sababa Falafel', { notOnGoogle: '2026-10-26T12:00:00Z' })],
        rows: [
          { kind: 'google', targetId: 'g1', triedAt: '2026-11-01T09:00:00Z', found, notThese: [], stoppedAt: null },
          { kind: 'google', targetId: 'g2', triedAt: null, found: null, notThese: [], stoppedAt: '2026-11-02T12:00:00Z' },
        ],
      }),
    )
    // Found, its row says so (Leyv Ha-Ir on dev, Nov 3, said "Not found on
    // Google · Found Nov 3").
    expect(grill).toMatchObject({ why: 'Found on Google', lastTry: '2026-11-01T09:00:00Z', found })
    expect(sababa).toMatchObject({ stopped: '2026-11-02T12:00:00Z', lastTry: '2026-10-26T12:00:00Z' })
  })
})

describe('when each is tried', () => {
  const item = (name: string, lastTry: string | null, over: Partial<LookItem> = {}): LookItem => ({ kind: 'google', id: name, name, why: '', note: null, lastTry, found: null, stopped: null, ...over })

  it('a month after its last try, never tried first, and nothing found or stopped', () => {
    const items = [
      item('Tried Oct 22', '2026-10-22T09:00:00Z'),
      item('Never', null),
      item('Tried Sep 1', '2026-09-01T09:00:00Z'),
      item('Found', null, { found: { placeId: 'p', name: 'Found', address: '', at: '2026-11-01T09:00:00Z' } }),
      item('Stopped', null, { stopped: '2026-11-01T09:00:00Z' }),
    ]
    expect(dueQueue(items, NOW).map((i) => i.name)).toEqual(['Never', 'Tried Sep 1'])
    expect(dueQueue(items, Date.parse('2026-10-22T09:00:00Z') + LOOK_AGAIN_MS).map((i) => i.name)).toEqual(['Never', 'Tried Sep 1', 'Tried Oct 22'])
  })

  it('the page: tonight’s run and how many, each row’s when, a few a night', () => {
    const never = ['A', 'B', 'C', 'D', 'E', 'F'].map((n) => item(n, null))
    const view = lookView([...never, item('Tried', '2026-10-22T14:00:00Z'), item('Stopped', null, { stopped: '2026-11-02T12:00:00Z' })], NEXT)
    expect(view.tonight).toBe('Tonight, 4:00 AM · 5 due')
    expect(view.total).toBe(7)
    expect(view.groups.map((g) => g.title)).toEqual(['Not on Google'])
    expect(view.groups[0].rows.map((r) => [r.name, r.when, r.next])).toEqual([
      ['A', 'Not tried yet · tonight', 'Tonight'],
      ['B', 'Not tried yet · tonight', 'Tonight'],
      ['C', 'Not tried yet · tonight', 'Tonight'],
      ['D', 'Not tried yet · tonight', 'Tonight'],
      ['E', 'Not tried yet · tonight', 'Tonight'],
      ['F', 'Not tried yet · tomorrow', 'Tomorrow'],
      ['Tried', 'Oct 22 · next Nov 21', 'Nov 21'],
    ])
    expect(view.stopped.map((r) => [r.name, r.when, r.next])).toEqual([['Stopped', 'Stopped Nov 2', null]])
  })
})

describe('what it offers', () => {
  it('a Google result only under the listing’s own name', () => {
    const overlap = (a: string, b: string) => a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase())
    expect(pickFound([{ name: 'Wawa' }, { name: 'The Kosher Grill at the Park' }], 'The Kosher Grill', overlap)).toEqual({ name: 'The Kosher Grill at the Park' })
    expect(pickFound([{ name: 'Wawa' }], 'The Kosher Grill', overlap)).toBeNull()
  })

  it('a page an admin said wasn’t it is never offered again', () => {
    expect(pickPage([{ url: 'https://yiep.org/a' }, { url: 'https://yiep.org/b' }], ['https://yiep.org/a'])).toEqual({ url: 'https://yiep.org/b' })
    expect(pickPage([{ url: 'https://yiep.org/a' }], ['https://yiep.org/a'])).toBeNull()
  })
})

describe('lookAgainFix', () => {
  const run = (over: Partial<JobRun>): JobRun => ({ id: 'r', job: 'look-again', startedAt: '2026-11-03T09:00:00Z', finishedAt: '2026-11-03T09:01:00Z', ok: true, summary: 'Tried 5 again', warning: null, error: null, ...over })
  it('needs fixing when its last run failed or it stopped running, not when it worked', () => {
    expect(lookAgainFix([run({})], NOW)).toBeNull()
    expect(lookAgainFix([run({ ok: false, error: 'boom' })], NOW)).toEqual({ name: 'Look again', why: 'Last run failed', page: 'job/look-again' })
    expect(lookAgainFix([run({ startedAt: '2026-10-30T09:00:00Z', finishedAt: '2026-10-30T09:01:00Z' })], NOW)?.why).toBe('Didn’t run since Oct 30')
  })
})
