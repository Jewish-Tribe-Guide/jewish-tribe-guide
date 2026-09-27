// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { MAX_SEEN, markTipDone, parseTipState, takeTipVisit, tipCandidates, tipStillOffered } from './browsingTips'

const grocery = makeCategory({
  id: 'grocery',
  label: 'Grocery',
  pluralLabel: 'Grocery Stores',
  detailFields: [
    { key: 'm', label: 'Kosher items', type: 'tags' },
    { key: 'hours', label: 'Hours', type: 'hours' },
  ],
})
const school = makeCategory({ id: 'school', label: 'School', pluralLabel: 'Schools', detailFields: [{ key: 'hours', label: 'Hours', type: 'hours' }] })
const synagogue = makeCategory({ id: 'synagogue', label: 'Synagogue', pluralLabel: 'Synagogues', detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] })
const all = [grocery, school, synagogue]

describe('tipCandidates', () => {
  it('asks about the item most places carry, when two or more do', () => {
    const items = [
      makeListing({ id: 'a', m: ['Challah', 'Wine'] }),
      makeListing({ id: 'b', m: ['Challah', 'Milk'] }),
      makeListing({ id: 'c', m: ['Wine', 'Challah'] }),
    ]
    expect(tipCandidates(grocery, items, all)[0]).toBe('Where can I get challah?')
  })

  it('skips an item only one place has, and one nobody would type', () => {
    const items = [
      makeListing({ id: 'a', m: ['Prepared Shabbos food from the deli', 'Kugel'] }),
      makeListing({ id: 'b', m: ['Prepared Shabbos food from the deli'] }),
    ]
    expect(tipCandidates(grocery, items, all).some((q) => q.startsWith('Where can I get'))).toBe(false)
  })

  it('asks what’s open only where people walk in, not at a school', () => {
    expect(tipCandidates(grocery, [], all)).toContain('Grocery stores open now')
    expect(tipCandidates(school, [], all)).toEqual([])
  })

  it('asks for the next minyan on a shul page whose shuls have times', () => {
    const shul = makeListing({ id: 's', category: 'synagogue', minyanim: [{ tefillah: 'mincha', time: '1:30pm', days: ['sun'] }] })
    expect(tipCandidates(synagogue, [shul], all)).toEqual(['Next minyan'])
    expect(tipCandidates(synagogue, [makeListing({ id: 't', category: 'synagogue' })], all)).toEqual([])
  })
})

describe('how often the tip shows', () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it(`shows on ${MAX_SEEN} visits, then stops`, () => {
    const shown = [takeTipVisit(), takeTipVisit(), takeTipVisit()]
    expect(shown).toEqual([true, true, false])
    expect(tipStillOffered()).toBe(false)
  })

  it('stops for good once the visitor has it', () => {
    markTipDone()
    expect(tipStillOffered()).toBe(false)
    expect(takeTipVisit()).toBe(false)
  })

  it('doesn’t show at all when storage is unavailable, rather than every time', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(takeTipVisit()).toBe(false)
    expect(tipStillOffered()).toBe(false)
  })

  it('reads a garbled value as a fresh start', () => {
    expect(parseTipState('{nope')).toEqual({ seen: 0, done: false })
    expect(parseTipState('{"seen":"x"}')).toEqual({ seen: 0, done: false })
  })
})
