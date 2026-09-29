import { describe, expect, it } from 'vitest'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import type { DirectoryResource } from '@/types'
import { groupByFromKey, groupByKey, groupByOptions, groupListings, parseGroupBy } from './listGroups'

// Monday, noon.
const NOON_MONDAY = new Date(2026, 7, 31, 12, 0)
const MON_9_TO_5 = { mon: { open: '09:00', close: '17:00' } }
const names = (items: readonly DirectoryResource[]) => items.map((i) => i.name)
const summary = (g: ReturnType<typeof groupListings>) => g?.groups.map((x) => [x.label, names(x.items)])

describe('groupListings: open now, then not open now', () => {
  const food = makeCategory({
    id: 'restaurant',
    groupBy: { kind: 'open' },
    detailFields: [{ key: 'hours', label: 'Hours', type: 'hours', filterable: true }],
  })

  it('puts places open now first and keeps the list’s own order inside each group', () => {
    const items = [
      makeListing({ id: 'a', name: 'Shut', hours: { mon: { open: '18:00', close: '22:00' } } }),
      makeListing({ id: 'b', name: 'Grill', hours: MON_9_TO_5 }),
      makeListing({ id: 'c', name: 'No hours' }),
      makeListing({ id: 'd', name: 'Cafe', hours: MON_9_TO_5 }),
    ]
    const g = groupListings(items, food, NOON_MONDAY)
    expect(g?.closed).toBe(false)
    expect(summary(g)).toEqual([
      ['Open now', ['Grill', 'Cafe']],
      // "Not open now", never "Closed": one here has no hours at all.
      ['Not open now', ['Shut', 'No hours']],
    ])
  })

  it('never counts a temporarily closed business as open, whatever hours it still has', () => {
    const items = [makeListing({ id: 'a', name: 'Paused', hours: MON_9_TO_5, businessStatusOverride: 'CLOSED_TEMPORARILY' })]
    expect(summary(groupListings(items, food, NOON_MONDAY))).toEqual([['Not open now', ['Paused']]])
  })

  it('leaves out a group with nothing in it', () => {
    const items = [makeListing({ id: 'a', name: 'Grill', hours: MON_9_TO_5 })]
    expect(summary(groupListings(items, food, NOON_MONDAY))).toEqual([['Open now', ['Grill']]])
  })

  it('is no grouping at all once the category has no hours to go by', () => {
    expect(groupListings([makeListing()], { ...food, detailFields: [] }, NOON_MONDAY)).toBeNull()
  })
})

describe('groupListings: within 2 mi, then further', () => {
  const grocery = makeCategory({ id: 'grocery', groupBy: { kind: 'distance', miles: 2 }, detailFields: [] })

  it('measures the way the rows do: from the visitor, else from the community’s centre', () => {
    const items = [
      makeListing({ id: 'a', name: 'Near', milesFromAddress: 0.4 }),
      makeListing({ id: 'b', name: 'Far', milesFromAddress: 5 }),
      makeListing({ id: 'c', name: 'Near the centre', milesFromCenter: 1.9 }),
      makeListing({ id: 'd', name: 'No address' }),
    ]
    expect(summary(groupListings(items, grocery, NOON_MONDAY))).toEqual([
      ['Within 2 mi', ['Near', 'Near the centre']],
      ['Further', ['Far', 'No address']],
    ])
  })

  it('is no grouping for a category without addresses', () => {
    expect(groupListings([makeListing()], { ...grocery, hasAddress: false }, NOON_MONDAY)).toBeNull()
  })
})

describe('groupListings: a yes/no', () => {
  it('says "Doesn’t say" for the rest, never "no": an unticked box isn’t a no', () => {
    const hotels = makeCategory({
      id: 'hotel',
      groupBy: { kind: 'field', key: 'shabbatFriendly' },
      detailFields: [{ key: 'shabbatFriendly', label: 'Shabbat friendly', type: 'boolean', filterable: true }],
    })
    const items = [
      makeListing({ id: 'a', name: 'Cambria', shabbatFriendly: true }),
      makeListing({ id: 'b', name: 'Marriott' }),
      makeListing({ id: 'c', name: 'Loews', shabbatFriendly: false }),
    ]
    expect(summary(groupListings(items, hotels, NOON_MONDAY))).toEqual([
      ['Shabbat friendly', ['Cambria']],
      ['Doesn’t say', ['Marriott', 'Loews']],
    ])
  })
})

describe('groupListings: a pick-list, as closed groups', () => {
  const shuls = makeCategory({
    id: 'synagogue',
    groupBy: { kind: 'field', key: 'denomination' },
    detailFields: [
      {
        key: 'denomination',
        label: 'Denomination',
        type: 'select',
        filterable: true,
        // The admin's order: Orthodox first. The groups don't follow it.
        options: [
          { value: 'Orthodox', label: 'Orthodox' },
          { value: 'Other', label: 'Other' },
          { value: 'Conservative', label: 'Conservative' },
          { value: 'Reform', label: 'Reform' },
        ],
      },
    ],
  })

  it('makes one closed group per value, alphabetical with Other last, whatever order the admin gave', () => {
    const items = [
      makeListing({ id: 'a', name: 'Mekor', denomination: 'Orthodox', milesFromCenter: 0.2 }),
      makeListing({ id: 'b', name: 'Minyan', denomination: 'Other' }),
      makeListing({ id: 'c', name: 'Beth Zion', denomination: 'Conservative' }),
      makeListing({ id: 'd', name: 'Rodeph', denomination: 'Reform' }),
      makeListing({ id: 'e', name: 'Unlabelled' }),
    ]
    const g = groupListings(items, shuls, NOON_MONDAY)
    expect(g?.closed).toBe(true)
    expect(g?.title).toBe('By denomination')
    expect(g?.groups.map((x) => x.label)).toEqual(['Conservative', 'Orthodox', 'Reform', 'Other', 'Doesn’t say'])
  })

  it('gives each group its nearest place, from the rows’ own distances', () => {
    const items = [
      makeListing({ id: 'a', name: 'Sons of Israel', denomination: 'Orthodox', milesFromCenter: 8.2 }),
      makeListing({ id: 'b', name: 'Mekor Habracha', denomination: 'Orthodox', milesFromCenter: 0.21 }),
      makeListing({ id: 'c', name: 'Beth Zion', denomination: 'Conservative' }),
    ]
    const g = groupListings(items, shuls, NOON_MONDAY)
    expect(g?.groups.map((x) => x.nearest)).toEqual(['Beth Zion', 'Mekor Habracha · 0.2 mi'])
  })

  it('puts a place listed under two values in both', () => {
    const items = [makeListing({ id: 'a', name: 'Both', denomination: ['Orthodox', 'Conservative'] })]
    expect(summary(groupListings(items, shuls, NOON_MONDAY))).toEqual([
      ['Conservative', ['Both']],
      ['Orthodox', ['Both']],
    ])
  })
})

describe('what can be stored', () => {
  it('reads an unknown or broken grouping as none, never an error', () => {
    for (const raw of [null, undefined, 'open', {}, { kind: 'colour' }, { kind: 'field' }, { kind: 'field', key: '' }]) {
      expect(parseGroupBy(raw)).toBeNull()
    }
    const cat = makeCategory({ groupBy: { kind: 'field', key: 'deleted' }, detailFields: [] })
    expect(groupListings([makeListing()], cat, NOON_MONDAY)).toBeNull()
  })

  it('round-trips each grouping through the editor’s select value', () => {
    for (const g of [{ kind: 'open' }, { kind: 'distance', miles: 2 }, { kind: 'field', key: 'denomination' }] as const) {
      expect(groupByFromKey(groupByKey(g))).toEqual(g)
    }
    expect(groupByFromKey('')).toBeNull()
  })

  it('offers the admin only the groupings the category’s own fields make possible', () => {
    const labels = (c: Parameters<typeof groupByOptions>[0]) => groupByOptions(c).map((o) => groupByKey(o.value))
    expect(labels(makeCategory({ hasAddress: false, detailFields: [] }))).toEqual([])
    expect(
      labels(
        makeCategory({
          detailFields: [
            { key: 'hours', label: 'Hours', type: 'hours' },
            { key: 'kosher', label: 'Kosher', type: 'boolean' },
            { key: 'denomination', label: 'Denomination', type: 'select', options: [] },
            { key: 'notes', label: 'Notes', type: 'text' },
          ],
        }),
      ),
    ).toEqual(['open', 'distance', 'field:kosher', 'field:denomination'])
  })
})
