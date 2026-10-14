import { describe, expect, it } from 'vitest'
import { hrefFiltered, lineSearch, makeSavedSearch, parseSavedSearches, restoreSavedSearch, searchKey, toggleSavedSearch } from './savedSearches'

describe('searchKey: what makes two searches the same', () => {
  it('ignores capitals, spacing and the order of the address’s parts', () => {
    expect(searchKey('/philly/grocery?q=Challah%20%20Rolls&openNow=1')).toBe(searchKey('/philly/grocery?openNow=1&q=challah rolls'))
  })

  it('ignores the order and capitals of a list of items', () => {
    expect(searchKey('/philly/grocery?q=x&has_m=Wine,Challah')).toBe(searchKey('/philly/grocery?has_m=challah,wine&q=x'))
  })

  // "Next mincha" opens on whichever day is next: the day it was saved on
  // isn't part of it.
  it('leaves out the day a minyan search happened to open on', () => {
    expect(searchKey('/philly/synagogue?davening=1&day=wed&q=mincha')).toBe(searchKey('/philly/synagogue?davening=1&q=mincha'))
  })

  it('keeps a Filter: the same words with Open now is another search', () => {
    expect(searchKey('/philly/grocery?q=challah&openNow=1')).not.toBe(searchKey('/philly/grocery?q=challah'))
  })
})

describe('lineSearch: what a home line’s bookmark saves', () => {
  it('a kind of place saves the words its page’s box will hold', () => {
    const s = lineSearch({ kind: 'category', href: '/philly/grocery?q=challah', categoryId: 'grocery' }, 'where can I buy challah')
    expect(s).toMatchObject({ words: 'challah', kind: 'category', categoryId: 'grocery', key: '/philly/grocery?q=challah', filtered: false })
  })

  it('a minyan saves what was typed', () => {
    const s = lineSearch({ kind: 'minyanim', href: '/philly/synagogue?davening=1&day=thu&q=mincha%20tomorrow', categoryId: 'synagogue' }, 'mincha tomorrow')
    expect(s).toMatchObject({ words: 'mincha tomorrow', kind: 'minyanim', key: '/philly/synagogue?davening=1&q=mincha+tomorrow' })
  })

  it('a question the reader read keeps its Filters', () => {
    const s = lineSearch({ kind: 'category', href: '/philly/grocery?q=something+to+drink&has_m=Wine&read=1', categoryId: 'grocery' }, 'something to drink')
    expect(s?.filtered).toBe(true)
  })

  it('the eruv, About, + Add and a card save nothing', () => {
    expect(lineSearch({ kind: 'eruv', href: '/philly/eruv', categoryId: 'eruv' }, 'eruv')).toBeNull()
    expect(lineSearch({ kind: 'about', href: '/philly/about' }, 'about')).toBeNull()
    expect(lineSearch({ kind: 'add', href: null }, 'add')).toBeNull()
    expect(lineSearch({ kind: 'card', href: '/philly/map', categoryId: 'map' }, 'map')).toBeNull()
  })
})

describe('the saved list', () => {
  const challah = makeSavedSearch({ words: 'challah', kind: 'category', categoryId: 'grocery', href: '/philly/grocery?q=challah' })
  const wine = makeSavedSearch({ words: 'wine', kind: 'category', categoryId: 'grocery', href: '/philly/grocery?q=wine' })
  const mincha = makeSavedSearch({ words: 'mincha', kind: 'minyanim', categoryId: 'synagogue', href: '/philly/synagogue?davening=1&q=mincha' })

  it('adds, and the same search again takes it off', () => {
    const once = toggleSavedSearch([], challah)
    expect(once).toEqual([challah])
    expect(toggleSavedSearch(once, { ...challah, words: 'Challah' })).toEqual([])
  })

  it('Undo puts one back where it was', () => {
    const list = [challah, wine, mincha]
    const without = toggleSavedSearch(list, wine)
    expect(restoreSavedSearch(without, wine, 1)).toEqual(list)
    expect(restoreSavedSearch(list, wine, 1)).toEqual(list)
  })

  it('reads back only well-formed entries, and nothing from garbage', () => {
    expect(parseSavedSearches(JSON.stringify([challah, { words: 'x' }, null]))).toEqual([challah])
    expect(parseSavedSearches('{nope')).toEqual([])
    expect(parseSavedSearches(null)).toEqual([])
  })

  it('knows an address with Filters from one with only words', () => {
    expect(hrefFiltered('/philly/grocery?q=challah')).toBe(false)
    expect(hrefFiltered('/philly/grocery?q=challah&sel_type=Bakery')).toBe(true)
  })
})
