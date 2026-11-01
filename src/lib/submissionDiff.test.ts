import { describe, expect, it } from 'vitest'
import { diffListing, diffLines, flatListing, isMultiline } from './submissionDiff'

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

// The user, Oct 31: every change to a shul said hours and last confirmed went
// to none. Nobody proposed that: the editor doesn't send either.
describe('diffListing, what nobody proposed', () => {
  const fields = [{ key: 'notes', label: 'Notes', type: 'text' as const }]
  const current = { name: 'Mekor', details: { notes: 'a', confirmedAt: '2026-10-12T00:00:00Z', hours: { mon: { open: '09:00', close: '17:00' } } } } as never
  const proposed = { name: 'Mekor', details: { notes: 'b' } } as never
  const changed = (f: typeof fields) => diffListing(current, proposed, f).filter((r) => r.changed).map((r) => r.key)

  it('a change doesn’t say last confirmed or hidden hours went to none', () => {
    expect(changed(fields)).toEqual(['notes'])
  })

  it('hours are still a change where the category has them', () => {
    expect(changed([...fields, { key: 'hours', label: 'Hours', type: 'hours' as never }])).toContain('hours')
  })
})
