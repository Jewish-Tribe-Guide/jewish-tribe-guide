import { describe, expect, it } from 'vitest'
import { diffLines, flatListing, isMultiline } from './submissionDiff'

// The moderation card struck through all ten of a shul's minyanim in red and
// repeated all ten in green because one Kabbalas Shabbos time gained a
// "(not after 7:00 PM)" clamp. Twenty lines to read to find one changed word
// is the same "approving blind" problem the field-level diff was built for,
// one level down.
describe('diffLines', () => {
  const before = ['Shacharis · Mon · 6:45am', 'Mincha · Sat · 12:20pm', 'Maariv · Sun–Thu · 6:30pm'].join('\n')

  it('marks only the line that changed, leaving the rest as context', () => {
    const after = ['Shacharis · Mon · 6:45am', 'Mincha · Sat · 12:30pm', 'Maariv · Sun–Thu · 6:30pm'].join('\n')
    const out = diffLines(before, after)
    expect(out.filter((l) => l.kind === 'same').map((l) => l.text)).toEqual([
      'Shacharis · Mon · 6:45am',
      'Maariv · Sun–Thu · 6:30pm',
    ])
    expect(out.filter((l) => l.kind === 'removed').map((l) => l.text)).toEqual(['Mincha · Sat · 12:20pm'])
    expect(out.filter((l) => l.kind === 'added').map((l) => l.text)).toEqual(['Mincha · Sat · 12:30pm'])
  })

  it('puts the removed line immediately above the one that replaced it', () => {
    const after = before.replace('12:20pm', '12:30pm')
    const kinds = diffLines(before, after).map((l) => l.kind)
    expect(kinds).toEqual(['same', 'removed', 'added', 'same'])
  })

  it('reports nothing changed when nothing changed', () => {
    expect(diffLines(before, before).every((l) => l.kind === 'same')).toBe(true)
  })

  it('handles a pure addition without inventing a removal', () => {
    const after = `${before}\nMincha & Maariv · Fri · At Candle Lighting`
    const out = diffLines(before, after)
    expect(out.filter((l) => l.kind === 'removed')).toEqual([])
    expect(out.filter((l) => l.kind === 'added').map((l) => l.text)).toEqual([
      'Mincha & Maariv · Fri · At Candle Lighting',
    ])
  })

  it('handles a pure deletion, keeping the removed line visible', () => {
    const after = ['Shacharis · Mon · 6:45am', 'Maariv · Sun–Thu · 6:30pm'].join('\n')
    const out = diffLines(before, after)
    expect(out.filter((l) => l.kind === 'added')).toEqual([])
    expect(out.filter((l) => l.kind === 'removed').map((l) => l.text)).toEqual(['Mincha · Sat · 12:20pm'])
  })

  // Minyanim sort by tefillah then time, so an edit that moves one earlier
  // shifts every line below it. Pairing by position would call the whole tail
  // changed; matching by content keeps it to the one line that actually moved.
  it('does not report a reorder as a change to every line after it', () => {
    const reordered = ['Mincha · Sat · 12:20pm', 'Shacharis · Mon · 6:45am', 'Maariv · Sun–Thu · 6:30pm'].join('\n')
    const out = diffLines(before, reordered)
    expect(out.every((l) => l.kind === 'same')).toBe(true)
  })
})

describe('isMultiline', () => {
  it('is true when either side has more than one line', () => {
    expect(isMultiline('a\nb', 'a')).toBe(true)
    expect(isMultiline('a', 'a\nb')).toBe(true)
  })

  it('is false for ordinary single-line values, which read better as before → after', () => {
    expect(isMultiline('(215) 555-0100', '(215) 555-0199')).toBe(false)
  })
})

// A grocery's items that are only sometimes there are stored beside the
// field ("m_sometimes"), not as one of the category's own fields, so the
// queue printed the raw key as their label.
describe('flatListing', () => {
  it('labels a tags field’s “sometimes” items under the field’s own name', () => {
    const fields = [{ key: 'm', label: 'Kosher items available', type: 'tags' as const }]
    const rows = flatListing({ name: 'Trader Joe’s', details: { m: ['Chicken'], m_sometimes: ['Steak', 'Turkey'] } } as never, fields)
    expect(rows.map((r) => [r.label, r.value])).toContainEqual(['Kosher items available: sometimes', 'Steak, Turkey'])
    expect(rows.map((r) => r.label)).not.toContain('m_sometimes')
  })
})
