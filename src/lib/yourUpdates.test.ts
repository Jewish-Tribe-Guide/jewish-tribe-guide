// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { hasLiveNews, KEEP_MAX, KEEP_MS, loadUpdates, postName, recordUpdates } from './yourUpdates'

// "Your updates" on You (Nov 27, board S4c): what this phone sent, by id.
const id = (n: number) => `00000000-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`

beforeEach(() => localStorage.clear())

describe('recordUpdates', () => {
  it('keeps what was sent, newest first, per community, leaving out ids that aren’t real', () => {
    recordUpdates('philly', 'submission', [id(1)], 'ACME', 'Changes', 1000)
    recordUpdates('philly', 'message', [id(2), 'ok', null], 'ACME has challah', 'Post', 2000)
    expect(loadUpdates('philly', 3000)).toEqual([
      { kind: 'message', id: id(2), name: 'ACME has challah', what: 'Post', at: 2000 },
      { kind: 'submission', id: id(1), name: 'ACME', what: 'Changes', at: 1000 },
    ])
    expect(loadUpdates('ues', 3000)).toEqual([])
  })

  it('forgets the old ones, keeps at most a few dozen, and never one twice', () => {
    recordUpdates('philly', 'submission', [id(1)], 'Old', 'Changes', 0)
    expect(loadUpdates('philly', KEEP_MS + 1)).toEqual([])
    for (let n = 0; n < KEEP_MAX + 5; n++) recordUpdates('philly', 'submission', [id(n)], `P${n}`, 'Changes', 10 + n)
    recordUpdates('philly', 'submission', [id(KEEP_MAX + 4)], 'Again', 'Changes', 100)
    const kept = loadUpdates('philly', 200)
    expect(kept).toHaveLength(KEEP_MAX)
    expect(kept.filter((u) => u.id === id(KEEP_MAX + 4))).toHaveLength(1)
  })

  it('reads nothing from storage that isn’t its own shape', () => {
    localStorage.setItem('jpc:your-updates:philly', '{"x":1}')
    expect(loadUpdates('philly')).toEqual([])
    localStorage.setItem('jpc:your-updates:philly', JSON.stringify([{ kind: 'message', id: 'nope', name: 'x', what: 'Post', at: Date.now() }]))
    expect(loadUpdates('philly')).toEqual([])
  })
})

describe('postName', () => {
  it('is a post’s first words, or says it was a photo', () => {
    expect(postName('  ACME   has challah ')).toBe('ACME has challah')
    expect(postName('x'.repeat(60))).toBe(`${'x'.repeat(39)}…`)
    expect(postName('')).toBe('Your photo')
  })
})

describe('hasLiveNews', () => {
  const live = (at: string) => ({ state: 'live' as const, href: null, at })
  it('is an update that went live after You was last opened, counting before it ever was', () => {
    expect(hasLiveNews({ a: live('2026-11-27T12:00:00Z') }, Date.parse('2026-11-27T10:00:00Z'))).toBe(true)
    expect(hasLiveNews({ a: live('2026-11-27T12:00:00Z') }, Date.parse('2026-11-27T13:00:00Z'))).toBe(false)
    expect(hasLiveNews({ a: live('2026-11-27T12:00:00Z') }, null)).toBe(true)
    expect(hasLiveNews({ a: { state: 'waiting' }, b: { state: 'not_changed' } }, null)).toBe(false)
  })
})
