import { describe, expect, it } from 'vitest'
import {
  addedItems,
  dayInTimezone,
  itemFieldKeys,
  nextItemSeen,
  normalizeEmail,
  normalizeSearchMiss,
  sourceOfSubmission,
} from './activity'

describe('normalizeEmail', () => {
  it('lowercases and trims, so one person counts once', () => {
    expect(normalizeEmail('  Rachel.K@Example.COM ')).toBe('rachel.k@example.com')
  })
  it('refuses anything that isn’t an email', () => {
    for (const bad of ['', 'rachel', 'a@b', 'a b@c.com', 42, null, undefined, `${'a'.repeat(250)}@x.com`]) {
      expect(normalizeEmail(bad)).toBeNull()
    }
  })
})

describe('sourceOfSubmission', () => {
  it('knows the Google closure reporter, and treats everyone else as a person', () => {
    expect(sourceOfSubmission({ name: 'Google Places (automated)' })).toBe('google')
    expect(sourceOfSubmission({ name: 'Google' })).toBe('submission')
    expect(sourceOfSubmission(null)).toBe('submission')
  })
})

describe('itemFieldKeys', () => {
  it('covers each tags field and its "sometimes" companion, and nothing else', () => {
    expect(
      itemFieldKeys([
        { key: 'm', type: 'tags' },
        { key: 'hours', type: 'hours' },
        { key: 'isKosher', type: 'select' },
      ]),
    ).toEqual(['m', 'm_sometimes'])
  })
})

describe('addedItems', () => {
  const keys = ['m', 'm_sometimes']
  it('finds what an edit adds, in each field', () => {
    expect(addedItems({ m: ['Challah'] }, { m: ['Challah', 'Wine'], m_sometimes: ['Sushi'] }, keys)).toEqual([
      { fieldKey: 'm', item: 'Wine' },
      { fieldKey: 'm_sometimes', item: 'Sushi' },
    ])
  })
  it('doesn’t count a change of case, stray spaces, a duplicate or a non-string as new', () => {
    expect(addedItems({ m: ['challah'] }, { m: [' Challah ', 'Challah', 7, ''] }, keys)).toEqual([])
  })
  it('treats everything on a brand-new listing as added', () => {
    expect(addedItems(null, { m: ['Challah'] }, keys)).toEqual([{ fieldKey: 'm', item: 'Challah' }])
  })
})

describe('nextItemSeen', () => {
  const keys = ['m', 'm_sometimes']
  const NOW = '2026-09-25T19:40:00.000Z'
  const OLD = '2026-08-11T00:00:00.000Z'

  it('dates what was added now, keeps what stayed, and forgets what was removed', () => {
    const next = nextItemSeen(
      { m: { Challah: OLD, Wine: OLD } },
      { m: ['Challah', 'Stew meat'] },
      keys,
      [{ fieldKey: 'm', item: 'Stew meat' }],
      NOW,
    )
    expect(next).toEqual({ m: { Challah: OLD, 'Stew meat': NOW } })
  })

  it('matches a kept item regardless of case, under its current label', () => {
    expect(nextItemSeen({ m: { challah: OLD } }, { m: ['Challah'] }, keys, [], NOW)).toEqual({ m: { Challah: OLD } })
  })

  it('drops malformed old entries instead of carrying them forward', () => {
    const next = nextItemSeen({ m: { Challah: 'soon', Wine: 5 }, m_sometimes: 'x' }, { m: ['Challah', 'Wine'] }, keys, [], NOW)
    expect(next).toEqual({})
  })

  it('leaves an item from before this existed undated rather than guessing', () => {
    expect(nextItemSeen(undefined, { m: ['Challah'] }, keys, [], NOW)).toEqual({})
  })
})

describe('normalizeSearchMiss', () => {
  it('reduces a query to lowercase with single spaces', () => {
    expect(normalizeSearchMiss('  Chalav   Yisroel MILK ')).toBe('chalav yisroel milk')
  })
  it('keeps an address-like query with a house number or a zip', () => {
    expect(normalizeSearchMiss('1500 walnut 19102')).toBe('1500 walnut 19102')
  })
  it('never stores something that looks like an email or a phone number', () => {
    expect(normalizeSearchMiss('rachel@example.com')).toBeNull()
    expect(normalizeSearchMiss('215 555 0100')).toBeNull()
    expect(normalizeSearchMiss('(215) 555-0100 mikvah')).toBeNull()
  })
  it('ignores too-short, too-long and non-text queries', () => {
    expect(normalizeSearchMiss('ab')).toBeNull()
    expect(normalizeSearchMiss('x'.repeat(61))).toBeNull()
    expect(normalizeSearchMiss({ q: 'challah' })).toBeNull()
  })
})

describe('dayInTimezone', () => {
  it('uses the community’s day, not UTC’s', () => {
    // 11:30pm Friday in Philadelphia is already Saturday in UTC.
    const lateFriday = new Date('2026-09-26T03:30:00.000Z')
    expect(dayInTimezone('America/New_York', lateFriday)).toBe('2026-09-25')
    expect(dayInTimezone('UTC', lateFriday)).toBe('2026-09-26')
  })
})
