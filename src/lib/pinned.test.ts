import { describe, expect, it } from 'vitest'
import { isPinned, parsePinned, togglePinned, type PinnedListing } from './pinned'

describe('parsePinned', () => {
  it('parses a valid saved list', () => {
    const raw = JSON.stringify([{ id: 'a', categoryId: 'food' }])
    expect(parsePinned(raw)).toEqual([{ id: 'a', categoryId: 'food' }])
  })

  it('returns an empty list for null (nothing saved yet)', () => {
    expect(parsePinned(null)).toEqual([])
  })

  it('returns an empty list for garbage JSON rather than throwing', () => {
    expect(parsePinned('not json')).toEqual([])
  })

  it('returns an empty list for valid JSON that is not an array', () => {
    expect(parsePinned(JSON.stringify({ id: 'a', categoryId: 'food' }))).toEqual([])
  })

  it('drops entries missing id or categoryId instead of failing the whole list', () => {
    const raw = JSON.stringify([
      { id: 'a', categoryId: 'food' },
      { id: 'b' },
      { categoryId: 'grocery' },
      null,
      'not an object',
      { id: 'c', categoryId: 'synagogue' },
    ])
    expect(parsePinned(raw)).toEqual([
      { id: 'a', categoryId: 'food' },
      { id: 'c', categoryId: 'synagogue' },
    ])
  })
})

describe('isPinned', () => {
  const pins: PinnedListing[] = [{ id: 'a', categoryId: 'food' }]

  it('is true for a pinned id', () => {
    expect(isPinned(pins, 'a')).toBe(true)
  })

  it('is false for an unpinned id', () => {
    expect(isPinned(pins, 'b')).toBe(false)
  })
})

describe('togglePinned', () => {
  it('adds a listing that is not yet pinned', () => {
    const next = togglePinned([], { id: 'a', categoryId: 'food' })
    expect(next).toEqual([{ id: 'a', categoryId: 'food' }])
  })

  it('removes a listing that is already pinned', () => {
    const pins: PinnedListing[] = [{ id: 'a', categoryId: 'food' }, { id: 'b', categoryId: 'grocery' }]
    expect(togglePinned(pins, { id: 'a', categoryId: 'food' })).toEqual([{ id: 'b', categoryId: 'grocery' }])
  })

  it('never mutates the array passed in', () => {
    const pins: PinnedListing[] = [{ id: 'a', categoryId: 'food' }]
    const next = togglePinned(pins, { id: 'b', categoryId: 'grocery' })
    expect(pins).toEqual([{ id: 'a', categoryId: 'food' }])
    expect(next).not.toBe(pins)
  })

  it('drops the oldest pin once the cap is reached, rather than refusing', () => {
    const pins: PinnedListing[] = Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, categoryId: 'food' }))
    const next = togglePinned(pins, { id: 'new', categoryId: 'food' })
    expect(next).toHaveLength(200)
    expect(isPinned(next, 'p0')).toBe(false)
    expect(isPinned(next, 'new')).toBe(true)
  })
})
