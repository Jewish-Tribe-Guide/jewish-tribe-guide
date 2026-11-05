import { describe, expect, it } from 'vitest'
import { canShareRow, cardRows, fromCardRows } from './homeSections'

const c = (kind: string, sharesRow = false) => ({ kind, sharesRow })
const kinds = (rows: { kind: string }[][]) => rows.map((row) => row.map((x) => x.kind))

describe('cardRows', () => {
  it('starts a row at each card that shares none, and joins the rest to the row before', () => {
    expect(kinds(cardRows([c('davening'), c('listings', true), c('suggest', true), c('subscribe'), c('jewishTimes', true)]))).toEqual([
      ['davening', 'listings', 'suggest'],
      ['subscribe', 'jewishTimes'],
    ])
  })

  it('a first card that says it shares has no row to share, and starts one', () => {
    expect(kinds(cardRows([c('subscribe', true), c('jewishTimes')]))).toEqual([['subscribe'], ['jewishTimes']])
  })

  it('caps a row at three: a fourth starts the next row', () => {
    expect(kinds(cardRows([c('a'), c('b', true), c('c', true), c('d', true), c('e', true)]))).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e'],
    ])
  })

  it('keeps Categories alone, before and after', () => {
    expect(kinds(cardRows([c('davening'), c('browse', true), c('listings', true)]))).toEqual([['davening'], ['browse'], ['listings']])
  })
})

describe('fromCardRows', () => {
  it('is cardRows backwards: the first card of each row shares none, the rest do', () => {
    const cards = [c('davening'), c('listings', true), c('browse'), c('subscribe'), c('jewishTimes', true)]
    expect(fromCardRows(cardRows(cards))).toEqual(cards)
  })

  it('corrects what a saved order said to what the page draws', () => {
    expect(fromCardRows(cardRows([c('browse'), c('davening', true)]))).toEqual([c('browse'), c('davening')])
  })
})

describe('canShareRow', () => {
  it('takes a card into a row under three that holds no Categories', () => {
    expect(canShareRow([c('davening'), c('listings')], c('suggest'))).toBe(true)
    expect(canShareRow([c('davening'), c('listings'), c('suggest')], c('subscribe'))).toBe(false)
    expect(canShareRow([c('browse')], c('subscribe'))).toBe(false)
    expect(canShareRow([c('subscribe')], c('browse'))).toBe(false)
  })
})
