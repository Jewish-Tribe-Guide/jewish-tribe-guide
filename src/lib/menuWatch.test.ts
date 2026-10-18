import { describe, expect, it } from 'vitest'
import { changedMenuNote, listedDishes, menuHash, MENU_WATCH_CREATOR, menuWatchChanges, newDishes, wantedMenuWatches } from './menuWatch'
import { makeCategory, makeListing } from '@/test/providerFixtures'

const food = makeCategory({
  id: 'restaurant',
  detailFields: [{ key: 'dishes', label: 'Main dishes', type: 'tags', showCountInHeader: true, countLabel: 'main dish' }],
})
const grocery = makeCategory({
  id: 'grocery',
  detailFields: [{ key: 'm', label: 'Kosher items', type: 'tags', showCountInHeader: true, countLabel: 'kosher item' }],
})

describe('wantedMenuWatches', () => {
  it('one per food place with a menu link; none for an ordering app, a grocery, or a place without one', () => {
    const wanted = wantedMenuWatches(
      [food, grocery],
      [
        makeListing({ id: 'a', category: 'restaurant', name: 'Judah', menuUrl: 'https://judah.example/menu' }),
        makeListing({ id: 'b', category: 'restaurant', name: 'Order Here', menuUrl: 'https://www.doordash.com/store/x' }),
        makeListing({ id: 'c', category: 'restaurant', name: 'No Link' }),
        makeListing({ id: 'd', category: 'grocery', name: 'Acme', menuUrl: 'https://acme.example/menu' }),
        makeListing({ id: 'e', category: 'restaurant', name: 'Bad', menuUrl: 'javascript:alert(1)' }),
      ],
    )
    expect(wanted).toEqual([{ url: 'https://judah.example/menu', resourceId: 'a', label: 'Menu · Judah' }])
  })

  it('two branches sharing a menu share its watch', () => {
    const wanted = wantedMenuWatches([food], [
      makeListing({ id: 'a', category: 'restaurant', name: 'Rita’s 1', menuUrl: 'https://ritas.example/menu' }),
      makeListing({ id: 'b', category: 'restaurant', name: 'Rita’s 2', menuUrl: 'https://ritas.example/menu' }),
    ])
    expect(wanted.map((w) => w.resourceId)).toEqual(['a'])
  })
})

describe('menuWatchChanges', () => {
  const wanted = [{ url: 'https://judah.example/menu', resourceId: 'a', label: 'Menu · Judah' }]

  it('adds a missing one, and takes away its own on a link nobody has now', () => {
    const changes = menuWatchChanges(wanted, [{ id: 'w1', url: 'https://judah.example/old-menu', resourceId: 'a', createdBy: MENU_WATCH_CREATOR }])
    expect(changes).toEqual({ add: wanted, remove: ['w1'] })
  })

  it('leaves alone an admin’s watch, even on the same page', () => {
    expect(menuWatchChanges(wanted, [{ id: 'w2', url: 'https://judah.example/menu', resourceId: null, createdBy: 'me@x.co' }])).toEqual({ add: [], remove: [] })
    expect(menuWatchChanges([], [{ id: 'w3', url: 'https://shul.example/times', resourceId: 'z', createdBy: 'me@x.co' }])).toEqual({ add: [], remove: [] })
  })

  it('nothing to do when they agree', () => {
    expect(menuWatchChanges(wanted, [{ id: 'w1', url: 'https://judah.example/menu', resourceId: 'a', createdBy: MENU_WATCH_CREATOR }])).toEqual({ add: [], remove: [] })
  })
})

describe('menuHash', () => {
  it('the same words are the same menu, however spaced; other words aren’t', () => {
    const a = menuHash({ url: 'u', text: 'Falafel  plate\n$12', pdf: null })
    expect(menuHash({ url: 'u', text: ' Falafel plate $12 ', pdf: null })).toBe(a)
    expect(menuHash({ url: 'u', text: 'Falafel plate $13', pdf: null })).not.toBe(a)
    expect(menuHash({ url: 'u', text: null, pdf: 'JVBERi0x' })).not.toBe(menuHash({ url: 'u', text: null, pdf: 'JVBERi0y' }))
  })
})

describe('newDishes', () => {
  const read = [
    { name: 'Falafel', quote: 'Falafel plate', checked: true },
    { name: 'Shawarma', quote: 'Shawarma laffa', checked: true },
    { name: 'Burgers', quote: 'Classic burger', checked: true },
  ]

  it('the dishes the listing doesn’t have yet, always or not always', () => {
    const listing = makeListing({ category: 'restaurant', dishes: ['falafel'], dishes_sometimes: ['Burgers'] })
    expect(newDishes(read, listedDishes(listing, food)).map((d) => d.name)).toEqual(['Shawarma'])
  })

  it('none when it has them all', () => {
    expect(newDishes(read, ['Falafel', 'Shawarma', 'Burgers'])).toEqual([])
  })

  it('says what’s new on the Main dishes tab', () => {
    expect(changedMenuNote([read[1]])).toBe('Its menu changed. One dish isn’t on the listing yet: Shawarma.')
    expect(changedMenuNote(read.slice(1))).toBe('Its menu changed. 2 dishes aren’t on the listing yet: Shawarma, Burgers.')
  })
})
