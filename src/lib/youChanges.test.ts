import { describe, expect, it } from 'vitest'
import { changeWords, changedSince } from './youChanges'
import type { Change } from './whatChanged'

const change = (over: Partial<Change> & { id: string; listingId: string; at: string }): Change => ({
  rowIds: [1],
  kind: 'edited',
  items: [],
  parts: [],
  hidden: false,
  ...over,
  listing: { id: over.listingId, name: over.listingId, category: 'grocery' },
})

describe('the words beside the dot', () => {
  it('the first thing it changed: "New hours"', () => {
    expect(changeWords(change({ id: 'a', listingId: 'tj', at: '2026-10-14T10:00:00Z', parts: [{ key: 'hours', label: 'Hours', value: 'Sunday 9 AM – 9 PM' }] }))).toBe('New hours')
  })
  it('a label that already says New stays as it is', () => {
    expect(changeWords(change({ id: 'a', listingId: 'tj', at: '2026-10-14T10:00:00Z', parts: [{ key: 'photo', label: 'New photo', value: '', quiet: true }] }))).toBe('New photo')
  })
  it('items added: "New items"; an edit from before the log said what: "Updated"', () => {
    expect(changeWords(change({ id: 'a', listingId: 'tj', at: '2026-10-14T10:00:00Z', kind: 'items', items: ['Challah'] }))).toBe('New items')
    expect(changeWords(change({ id: 'a', listingId: 'tj', at: '2026-10-14T10:00:00Z' }))).toBe('Updated')
  })
})

describe('which saved places get a dot', () => {
  const since = Date.parse('2026-10-13T12:00:00Z')
  const changes = [
    change({ id: 'c3', listingId: 'tj', at: '2026-10-14T10:00:00Z', parts: [{ key: 'hours', label: 'Hours', value: '…' }] }),
    change({ id: 'c2', listingId: 'tj', at: '2026-10-13T18:00:00Z', kind: 'items', items: ['Wine'] }),
    change({ id: 'c1', listingId: 'mx', at: '2026-10-12T10:00:00Z' }),
    change({ id: 'c0', listingId: 'other', at: '2026-10-14T10:00:00Z' }),
  ]

  it('a saved place changed since the last look, said by its newest change; not one changed before, nor a place not saved', () => {
    expect(changedSince(changes, new Set(['tj', 'mx']), since)).toEqual(new Map([['tj', 'New hours']]))
  })

  it('none the first time You is opened, and none without the log', () => {
    expect(changedSince(changes, new Set(['tj']), null).size).toBe(0)
    expect(changedSince(null, new Set(['tj']), since).size).toBe(0)
  })
})
