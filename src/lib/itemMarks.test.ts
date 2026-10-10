import { describe, expect, it } from 'vitest'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import type { CategoryField } from './categories'
import {
  additionSubmission,
  alreadyListed,
  cleanItemName,
  dayText,
  itemDateFor,
  itemMarks,
  itemPhrase,
  itemSuggestions,
  itemWording,
  lastSeenText,
  pickItemToAsk,
  removalSubmission,
  seenLabel,
} from './itemMarks'

const TZ = 'America/New_York'
const m: CategoryField = { key: 'm', label: 'Kosher items here', type: 'tags' }
const now = Date.parse('2026-10-09T17:30:00Z') // Fri Oct 9, 1:30 PM in Philadelphia
const day = 86_400_000

describe('itemMarks', () => {
  it('reads each item’s dates, matching names without case, and ignores anything that isn’t a date', () => {
    const item = makeListing({
      m: ['Challah', 'Wine'],
      m_sometimes: ['Steak'],
      itemSeen: { m: { challah: '2026-10-01T10:00:00Z', Wine: 'yesterday' } },
      itemGone: { m_sometimes: { Steak: '2026-10-08T10:00:00Z' } },
      itemMenu: { m: { wine: '2026-10-02T10:00:00Z' } },
    })
    expect(itemMarks(item, m)).toEqual([
      { name: 'Challah', key: 'm', sometimes: false, seenAt: '2026-10-01T10:00:00Z', goneAt: null, menuAt: null },
      { name: 'Wine', key: 'm', sometimes: false, seenAt: null, goneAt: null, menuAt: '2026-10-02T10:00:00Z' },
      { name: 'Steak', key: 'm_sometimes', sometimes: true, seenAt: null, goneAt: '2026-10-08T10:00:00Z', menuAt: null },
    ])
  })
})

describe('a dish read from its menu (agreed Oct 1)', () => {
  const mark = { name: 'Shawarma', key: 'dishes', sometimes: false, goneAt: null }
  const menuAt = '2026-10-02T15:00:00Z'

  it('says "on its menu", never "seen", until someone has seen it since', () => {
    expect(seenLabel({ ...mark, seenAt: null, menuAt }, now, TZ)?.text).toBe('on its menu Oct 2')
    expect(lastSeenText({ ...mark, seenAt: null, menuAt }, now, TZ)).toBe('On its menu Oct 2.')
    // Seen since: a person's word, newer.
    expect(seenLabel({ ...mark, seenAt: new Date(now).toISOString(), menuAt }, now, TZ)?.text).toBe('seen today')
    expect(lastSeenText({ ...mark, seenAt: new Date(now).toISOString(), menuAt }, now, TZ)).toBe('Last seen today.')
    // Seen before the menu was read: the menu is the newer word.
    expect(seenLabel({ ...mark, seenAt: '2026-09-01T15:00:00Z', menuAt }, now, TZ)?.text).toBe('on its menu Oct 2')
    expect(lastSeenText({ ...mark, seenAt: null, menuAt: null }, now, TZ)).toBe('No one has said yet.')
  })

  it('finds the date by the dish’s name, without case', () => {
    const item = makeListing({ dishes: ['Shawarma'], itemMenu: { dishes: { shawarma: menuAt } }, itemSeen: { dishes: {} } })
    expect(itemDateFor(item, 'Shawarma')).toEqual({ kind: 'menu', at: menuAt })
    expect(itemDateFor(item, 'Falafel')).toBeNull()
  })
})

describe('a list’s words', () => {
  it('a store’s items are still here; a place’s dishes still served', () => {
    const items = itemWording({ countLabel: 'kosher item' })
    expect([items.still, items.add, items.sometimes, items.nouns]).toEqual(['Still here', 'Add an item', 'not always in stock', 'items'])
    expect(items.question('kosher steak')).toBe('Kosher steak here today?')
    const dishes = itemWording({ countLabel: 'dish' })
    expect([dishes.still, dishes.add, dishes.addFirst, dishes.sometimes, dishes.nouns]).toEqual([
      'Still served',
      'Add a dish',
      'Add the first dish',
      'not always on the menu',
      'dishes',
    ])
    expect(dishes.question('shawarma')).toBe('Still serving shawarma?')
    // No count label: items.
    expect(itemWording({}).still).toBe('Still here')
  })
})

describe('how a date reads', () => {
  it('today and yesterday in the community’s own days, then the date', () => {
    expect(dayText('2026-10-09T04:30:00Z', now, TZ)).toBe('today') // 12:30 AM there
    expect(dayText('2026-10-09T03:30:00Z', now, TZ)).toBe('yesterday') // 11:30 PM the night before
    expect(dayText('2026-09-30T15:00:00Z', now, TZ)).toBe('Sep 30')
    expect(dayText('2025-09-30T15:00:00Z', now, TZ)).toBe('Sep 30, 2025')
    // Before the page knows the time: the date alone.
    expect(dayText('2026-10-09T15:00:00Z', null, TZ)).toBe('Oct 9')
  })

  it('amber after 90 days with no one seeing it', () => {
    const mark = { name: 'Wine', key: 'm', sometimes: false, goneAt: null }
    expect(seenLabel({ ...mark, seenAt: new Date(now - 89 * day).toISOString() }, now, TZ)?.old).toBe(false)
    expect(seenLabel({ ...mark, seenAt: new Date(now - 90 * day).toISOString() }, now, TZ)?.old).toBe(true)
    expect(seenLabel({ ...mark, seenAt: null }, now, TZ)).toBeNull()
  })
})

describe('the item asked about', () => {
  const mark = (name: string, o: { sometimes?: boolean; seen?: number; gone?: boolean } = {}) => ({
    name,
    key: o.sometimes ? 'm_sometimes' : 'm',
    sometimes: !!o.sometimes,
    seenAt: o.seen === undefined ? null : new Date(now - o.seen * day).toISOString(),
    goneAt: o.gone ? new Date(now).toISOString() : null,
  })

  it('one only sometimes there first, then the longest unseen, never seen counting longest', () => {
    expect(pickItemToAsk([mark('Challah'), mark('Steak', { sometimes: true, seen: 30 })], now)?.name).toBe('Steak')
    expect(pickItemToAsk([mark('Challah', { seen: 30 }), mark('Wine', { seen: 60 }), mark('Beef')], now)?.name).toBe('Beef')
    expect(pickItemToAsk([mark('Challah', { seen: 30 }), mark('Wine', { seen: 60 })], now)?.name).toBe('Wine')
  })

  it('not one seen this week, nor one already reported gone; nothing when nothing’s left', () => {
    expect(pickItemToAsk([mark('Steak', { sometimes: true, seen: 2 }), mark('Wine', { seen: 20 })], now)?.name).toBe('Wine')
    expect(pickItemToAsk([mark('Steak', { sometimes: true, gone: true }), mark('Wine', { seen: 1 })], now)).toBeNull()
  })

  it('says what the items are before the name, where the list says so', () => {
    expect(itemPhrase(m, 'Steak')).toBe('kosher steak')
    expect(itemPhrase(m, 'Stew Meat')).toBe('kosher stew meat')
    expect(itemPhrase(m, 'IKC Challah')).toBe('kosher IKC Challah')
    expect(itemPhrase({ ...m, label: 'Menu' }, 'Shawarma')).toBe('shawarma')
    expect(itemPhrase({ ...m, label: 'Items' }, 'Wine')).toBe('wine')
  })
})

describe('the removal "Not anymore" files', () => {
  it('is the listing as it stands with that one item taken off', () => {
    const grocery = makeCategory({ id: 'grocery', detailFields: [m] })
    const item = makeListing({ m: ['Challah', 'Chicken'], m_sometimes: ['Steak'], itemSeen: { m: { Challah: '2026-10-01T10:00:00Z' } } })
    const sub = removalSubmission(grocery, item, 'm', 'chicken')
    expect(sub.details).toEqual({ m: ['Challah'], m_sometimes: ['Steak'] })
    expect(removalSubmission(grocery, item, 'm_sometimes', 'Steak').details).toEqual({ m: ['Challah', 'Chicken'], m_sometimes: [] })
  })
})

describe('add a dish', () => {
  it('suggests dishes for a list of dishes, and items for any other', () => {
    expect(itemSuggestions('bur', [], 4, { dishes: true }).map((x) => x.name)).toEqual(['Burgers', 'Burritos'])
    expect(itemSuggestions('bur', []).map((x) => x.name)).toEqual([])
    expect(itemSuggestions('chal', [], 4, { dishes: true }).map((x) => x.name)).toEqual([])
  })
})

describe('add an item', () => {
  const mark = (name: string, key = 'm') => ({ name, key, sometimes: key !== 'm', seenAt: null, goneAt: null })
  const marks = [mark('Challah'), mark('Some Sliced Cheese'), mark('Steak', 'm_sometimes')]

  it('tidies a typed name, and refuses what can’t be one', () => {
    expect(cleanItemName('  goat   cheese ')).toBe('goat cheese')
    for (const bad of ['x', 'me@example.com', 'www.spam.example', '215-555-0100', 'a'.repeat(61), null]) expect(cleanItemName(bad)).toBeNull()
  })

  it('knows an item the store has under another of its names', () => {
    expect(alreadyListed(marks, 'sliced cheeses')?.name).toBe('Some Sliced Cheese')
    expect(alreadyListed(marks, 'Goat Cheese')).toBeNull()
  })

  it('suggests from the item names as it’s typed, the store’s own first', () => {
    const s = itemSuggestions('chee', marks)
    // The store's own first, then names that start with it, then ones with a
    // word that does; Brie (only as "Brie Cheese") doesn't make the four.
    expect(s).toEqual([
      { name: 'Some Sliced Cheese', listed: marks[1] },
      { name: 'Cheese', listed: null },
      { name: 'Cheese Sticks', listed: null },
      { name: 'Cheddar Cheese', listed: null },
    ])
    expect(itemSuggestions('ground', marks).map((x) => x.name)).toEqual(['Ground Turkey', 'Hamburger Meat'])
    expect(itemSuggestions('c', marks)).toEqual([])
  })

  it('files the listing with one item more, in the always or sometimes list, under the list’s name', () => {
    const grocery = makeCategory({ id: 'grocery', detailFields: [m] })
    const item = makeListing({ m: ['Challah'], m_sometimes: ['Steak'] })
    expect(additionSubmission(grocery, item, 'm', 'ground beef', false).details).toEqual({ m: ['Challah', 'Hamburger Meat'], m_sometimes: ['Steak'] })
    expect(additionSubmission(grocery, item, 'm', 'Rugelach', true).details).toEqual({ m: ['Challah'], m_sometimes: ['Steak', 'Rugelach'] })
  })
})
