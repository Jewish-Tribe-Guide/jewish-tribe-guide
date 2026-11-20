import { describe, expect, it } from 'vitest'
import { groupBy } from './groupBy'

describe('groupBy', () => {
  it('groups by key in first-seen order, as Map.groupBy does', () => {
    const rows = [
      { link: 'zoom/a', t: 'Shacharis' },
      { link: 'zoom/b', t: 'Mincha' },
      { link: 'zoom/a', t: 'Maariv' },
    ]
    expect([...groupBy(rows, (r) => r.link)]).toEqual([
      ['zoom/a', [rows[0], rows[2]]],
      ['zoom/b', [rows[1]]],
    ])
  })

  it('gives an empty map for nothing', () => {
    expect(groupBy([], (x) => x).size).toBe(0)
  })
})
