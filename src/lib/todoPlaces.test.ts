import { describe, expect, it } from 'vitest'
import { dayToIso, firstThing, placeLine, shownPlaces, shownThing, todoPlaceCount, todoPlaces } from './todoPlaces'
import { GOOGLE_SUBMITTER_NAME } from './activity'
import { KEYSTONE_WATCH_NAME } from './keystoneWatch'
import type { CategoryConfig } from './categories'
import type { EnrichedSubmission } from '@/types'

const SHUL = { id: 'synagogue', detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] } as unknown as CategoryConfig
const cats = new Map([['synagogue', SHUL]])
const weekday = { id: 's', tefillah: 'shacharis', days: ['mon'], time: '7:00am' }
const shabbos = { id: 'b', tefillah: 'shacharis', days: ['sat'], time: '9:00am' }

const sub = (over: Partial<EnrichedSubmission> & { payload?: object }): EnrichedSubmission =>
  ({ id: 'x', operation: 'update', target_type: 'listing', target_id: 'p1', status: 'pending', created_at: '2026-10-22T12:00:00Z', payload: { name: 'Sons of Israel', category: 'synagogue', details: {} }, ...over }) as unknown as EnrichedSubmission

const timesChange = sub({
  id: 'e1',
  payload: { name: 'Sons of Israel', category: 'synagogue', address: '', phone: '', details: { minyanim: [{ ...weekday, time: '6:45am' }, { ...shabbos, time: '8:45am' }] } },
  current: { id: 'p1', name: 'Sons of Israel', category: 'synagogue', address: '', phone: '', details: { minyanim: [weekday, shabbos] } } as never,
})

describe('todoPlaces', () => {
  it('one row per place: its changes and broken checks together, changes first, dated by the oldest', () => {
    const places = todoPlaces(
      {
        submissions: [timesChange],
        responses: [],
        unmatched: [],
        notRead: [{ id: 'p1', name: 'Sons of Israel', line: 'Website didn’t load' }],
      },
      cats,
    )
    expect(places).toHaveLength(1)
    expect(placeLine(places[0])).toBe('Usual weekday times · Usual Shabbos times · Website didn’t load')
    expect(places[0].at).toBe('2026-10-22T12:00:00Z')
  })

  it('the nav counts places, not what waits at them; a job’s reading leaves its date to the row', () => {
    const data = {
      submissions: [timesChange],
      responses: [{ id: 'r', title: 'Feedback', line: 'hi', createdAt: '2026-11-01T12:00:00Z' }],
      unmatched: [{ id: 'p1', name: 'Sons of Israel', category: 'synagogue' }],
      waiting: [{ id: 'p2', name: 'Rita’s', kind: 'Food', line: 'Closed for now, says Google · Oct 17' }],
      notRead: [{ id: 'p1', name: 'Sons of Israel', line: 'Website didn’t load · Menu didn’t load' }],
    }
    expect(todoPlaceCount(data)).toBe(3)
    expect(placeLine(todoPlaces(data, cats).find((p) => p.key === 'p2')!)).toBe('Closed for now, says Google')
  })

  // N1List, P1Every: every row is dated. A broken check by when it started
  // failing, Google not found by when Google was asked, a job's reading by
  // the day its line ends with.
  it('dates a place with only broken checks, and a job’s reading', () => {
    const places = todoPlaces(
      {
        submissions: [],
        responses: [],
        unmatched: [{ id: 'p3', name: 'Mike’s Chicken', category: 'food', at: '2026-10-30T07:00:00Z' }],
        waiting: [{ id: 'p2', name: 'Rita’s', kind: 'Food', line: 'Closed for now, says Google · Oct 17' }],
        notRead: [{ id: 'p1', name: '20th Street Pizza', line: 'Website didn’t load · Menu didn’t load', since: ['2026-10-25T07:00:00Z', '2026-10-22T07:00:00Z'] }],
      },
      cats,
      Date.parse('2026-11-02T12:00:00Z'),
    )
    expect(places.map((p) => [p.name, p.at])).toEqual([
      ['Rita’s', '2026-10-17T12:00:00.000Z'],
      ['20th Street Pizza', '2026-10-22T07:00:00Z'],
      ['Mike’s Chicken', '2026-10-30T07:00:00Z'],
    ])
  })

  // Sababa, Nov 2: "Oct 17 · Google stopped answering Oct 17". The row's
  // corner has the date; the line doesn't say it again.
  it('says a broken check’s date once, in the corner', () => {
    const [p] = todoPlaces({ submissions: [], responses: [], unmatched: [], notRead: [{ id: 's', name: 'Sababa', line: 'Google stopped answering Oct 17', since: ['2026-10-17T07:00:00Z'] }] }, cats)
    expect(placeLine(p)).toBe('Google stopped answering')
  })

  it('a line’s "Dec 30" read in January is last year', () => {
    expect(dayToIso('Dec 30', Date.parse('2027-01-03T12:00:00Z'))).toBe('2026-12-30T12:00:00.000Z')
  })

  it('says each kind in the board’s words', () => {
    const places = todoPlaces(
      {
        submissions: [
          sub({ id: 'n', operation: 'create', target_id: null, payload: { name: 'Shalom Pizzeria' } }),
          sub({ id: 'g', operation: 'delete', target_id: 'p2', payload: { name: 'Rita’s' }, submitted_by: { name: GOOGLE_SUBMITTER_NAME } as never }),
          sub({ id: 'v', operation: 'delete', target_id: 'p3', payload: { name: 'Primo' }, submitted_by: { name: 'Sam' } as never }),
          sub({ id: 'k', operation: 'delete', target_id: 'p4', payload: { name: 'Sweet Lucy’s' }, submitted_by: { name: KEYSTONE_WATCH_NAME } as never }),
          sub({ id: 'c', operation: 'create', target_type: 'category', target_id: null, payload: { label: 'Bakeries' } }),
        ],
        responses: [{ id: 'r', title: 'Feedback', line: 'this website is cool', createdAt: '2026-11-01T12:00:00Z' }],
        unmatched: [{ id: 'p5', name: 'Mike’s Chicken', category: 'restaurant' }],
      },
      cats,
    )
    expect(places.map((p) => [p.name, placeLine(p)])).toEqual([
      ['Shalom Pizzeria', 'New place'],
      ['Rita’s', 'Closed, says Google'],
      ['Primo', 'Closed, says a visitor'],
      ['Sweet Lucy’s', 'Off Keystone-K’s list'],
      ['Bakeries', 'New category'],
      ['Mike’s Chicken', 'Google not found'],
      ['Feedback', 'this website is cool'],
    ])
  })

  it('search, filter and sort: the filter keeps a place with anything of its kind, and picks where it opens', () => {
    const places = todoPlaces(
      {
        submissions: [timesChange, sub({ id: 'n', operation: 'create', target_id: null, created_at: '2026-10-30T12:00:00Z', payload: { name: 'Shalom Pizzeria' } })],
        responses: [],
        unmatched: [],
        notRead: [{ id: 'p1', name: 'Sons of Israel', line: 'Website didn’t load' }, { id: 'p9', name: 'Abe’s', line: 'Website didn’t load' }],
      },
      cats,
    )
    const names = (o: Parameters<typeof shownPlaces>[1]) => shownPlaces(places, o).map((p) => p.name)
    expect(names({ query: '', filters: [], sort: 'oldest' })).toEqual(['Sons of Israel', 'Shalom Pizzeria', 'Abe’s'])
    expect(names({ query: '', filters: [], sort: 'newest' })).toEqual(['Shalom Pizzeria', 'Sons of Israel', 'Abe’s'])
    expect(names({ query: '', filters: [], sort: 'name' })).toEqual(['Abe’s', 'Shalom Pizzeria', 'Sons of Israel'])
    expect(names({ query: 'shal', filters: [], sort: 'oldest' })).toEqual(['Shalom Pizzeria'])
    expect(names({ query: '', filters: ['broken'], sort: 'oldest' })).toEqual(['Sons of Israel', 'Abe’s'])
    expect(firstThing(places[0], ['broken']).label).toBe('Website didn’t load')
    expect(firstThing(places[0], []).label).toBe('Usual weekday times')
  })
})

describe('shownThing', () => {
  const ids = (...xs: string[]) => xs.map((id) => ({ id }))
  const order = ids('menu-broken', 'closure', 'hours')

  it('stays on the one picked while it waits', () => {
    expect(shownThing(order, ids('menu-broken', 'closure', 'hours', 'menu-reading'), 'closure')?.id).toBe('closure')
  })

  it('once answered, opens what that answer brought (Read it again’s new reading), not the next in line', () => {
    expect(shownThing(order, ids('closure', 'hours', 'menu-reading'), 'menu-broken')?.id).toBe('menu-reading')
  })

  it('with nothing new, the next one still waiting, wrapping round', () => {
    expect(shownThing(order, ids('closure', 'hours'), 'menu-broken')?.id).toBe('closure')
    expect(shownThing(order, ids('menu-broken'), 'hours')?.id).toBe('menu-broken')
  })
})
