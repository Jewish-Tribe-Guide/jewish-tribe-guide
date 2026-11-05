import { describe, expect, it } from 'vitest'
import { dropIndex, moveItem } from './reorder'

describe('moveItem', () => {
  it('moves one item, down or up, and leaves the list it was given alone', () => {
    const list = ['a', 'b', 'c', 'd']
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(list, 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(list).toEqual(['a', 'b', 'c', 'd'])
  })

  it('past either end lands at that end; a missing item changes nothing', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 9)).toEqual(['b', 'c', 'a'])
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['c', 'a', 'b'])
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b'])
  })
})

describe('dropIndex', () => {
  it('a row lands after every other row whose middle it has passed', () => {
    const middles = [26, 78, 130]
    expect(dropIndex(middles, 10)).toBe(0)
    expect(dropIndex(middles, 80)).toBe(2)
    expect(dropIndex(middles, 200)).toBe(3)
  })
})
