import { describe, expect, it } from 'vitest'
import { dayNumber, inTurn } from './inTurn'

describe('inTurn', () => {
  it('starts at the turn’s place and goes round, whatever the turn', () => {
    expect(inTurn(['a', 'b', 'c'], 0)).toEqual(['a', 'b', 'c'])
    expect(inTurn(['a', 'b', 'c'], 4)).toEqual(['b', 'c', 'a'])
    expect(inTurn(['a', 'b', 'c'], -1)).toEqual(['c', 'a', 'b'])
    expect(inTurn([], 3)).toEqual([])
  })

  it('counts a day as one more than the day before', () => {
    expect(dayNumber(Date.parse('2026-11-18T23:00:00Z')) - dayNumber(Date.parse('2026-11-17T01:00:00Z'))).toBe(1)
  })
})
