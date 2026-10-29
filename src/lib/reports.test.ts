import { describe, expect, it } from 'vitest'
import { missedSearchCount, reportRange, tallyDecided, topViewed, viewBars, type DecidedRow } from './reports'

const views = (rows: [string, string, number][]) => rows.map(([key, day, count]) => ({ key, day, count }))

describe('reportRange', () => {
  it('a week is the last seven days, today included', () => {
    const r = reportRange('week', '2026-11-03')
    expect([r.start, r.end, r.words]).toEqual(['2026-10-28', '2026-11-03', 'this week'])
    // A bar that starts a month says which.
    expect(r.buckets.map((b) => b.label)).toEqual(['Oct 28', '29', '30', '31', 'Nov 1', '2', '3'])
  })

  it('a month runs from its first day to today', () => {
    const r = reportRange('month', '2026-10-29')
    expect([r.start, r.end, r.words]).toEqual(['2026-10-01', '2026-10-29', 'in October'])
    expect(r.buckets).toHaveLength(29)
    expect(r.buckets[0].label).toBe('Oct 1')
  })

  it('a year is a bar a month, to this one', () => {
    const r = reportRange('year', '2026-03-12')
    expect([r.start, r.end, r.words]).toEqual(['2026-01-01', '2026-03-12', 'in 2026'])
    expect(r.buckets).toEqual([
      { start: '2026-01-01', end: '2026-01-31', label: 'Jan' },
      { start: '2026-02-01', end: '2026-02-28', label: 'Feb' },
      { start: '2026-03-01', end: '2026-03-12', label: 'Mar' },
    ])
  })
})

describe('viewBars', () => {
  it('adds up every listing a day, and starts where counting started', () => {
    const range = reportRange('month', '2026-10-20')
    const rows = views([
      ['a', '2026-10-17', 50],
      ['b', '2026-10-17', 43],
      ['a', '2026-10-18', 141],
      ['a', '2026-10-20', 24],
    ])
    const { bars, total, since } = viewBars(range, rows, '2026-10-17')
    expect(bars).toEqual([
      { label: 'Oct 17', count: 93 },
      { label: '18', count: 141 },
      { label: '19', count: 0 },
      { label: '20', count: 24 },
    ])
    expect(total).toBe(258)
    expect(since).toBe('2026-10-17')
  })

  it('a year’s first month counts from the first day counted', () => {
    const range = reportRange('year', '2026-11-02')
    const { bars, since } = viewBars(range, views([['a', '2026-10-17', 5], ['a', '2026-11-01', 2]]), '2026-10-17')
    expect(bars).toEqual([
      { label: 'Oct', count: 5 },
      { label: 'Nov', count: 2 },
    ])
    expect(since).toBe('2026-10-17')
  })

  it('has no bars before anything was counted', () => {
    expect(viewBars(reportRange('week', '2026-10-29'), [], null)).toEqual({ bars: [], total: 0, since: null })
  })
})

describe('topViewed', () => {
  it('adds each listing’s days, most opened first', () => {
    const rows = views([
      ['a', '2026-10-17', 3],
      ['b', '2026-10-17', 5],
      ['a', '2026-10-18', 4],
      ['c', '2026-10-18', 1],
    ])
    expect(topViewed(rows, 2)).toEqual([
      { id: 'a', count: 7 },
      { id: 'b', count: 5 },
    ])
  })
})

describe('tallyDecided', () => {
  const row = (status: DecidedRow['status'], operation: DecidedRow['operation'], reviewed_at: string, target_type: DecidedRow['target_type'] = 'listing'): DecidedRow => ({
    status,
    operation,
    target_type,
    reviewed_at,
  })

  it('counts taken and left the way To do groups them, by the community’s own day', () => {
    const range = reportRange('month', '2026-10-29')
    const rows = [
      row('approved', 'create', '2026-10-05T12:00:00Z'),
      row('rejected', 'create', '2026-10-06T12:00:00Z'),
      row('approved', 'update', '2026-10-07T12:00:00Z'),
      // A new category isn't a new place: To do lists it under Changes.
      row('approved', 'create', '2026-10-07T12:00:00Z', 'category'),
      row('approved', 'delete', '2026-10-08T12:00:00Z'),
      row('rejected', 'delete', '2026-10-08T12:00:00Z'),
      // 11pm on Sep 30 in New York, though Oct 1 in UTC: not this month.
      row('approved', 'update', '2026-10-01T03:00:00Z'),
      // Pending has nothing decided.
      row('pending', 'update', '2026-10-09T12:00:00Z'),
    ]
    expect(tallyDecided(rows, range, 'America/New_York')).toEqual({
      newPlaces: { taken: 1, left: 1 },
      changes: { taken: 2, left: 0 },
      removals: { taken: 1, left: 1 },
    })
  })
})

describe('missedSearchCount', () => {
  it('counts each search once, in the range only', () => {
    const range = reportRange('week', '2026-10-29')
    const rows = views([
      ['pizza', '2026-10-28', 3],
      ['pizza', '2026-10-29', 1],
      ['sushi', '2026-10-29', 1],
      ['bagels', '2026-10-01', 9],
    ])
    expect(missedSearchCount(rows, range)).toBe(2)
  })
})
