import { afterEach, describe, expect, it, vi } from 'vitest'

// The eruv table as it is before a later migration is run: Postgres refuses
// a select or update naming a column it doesn't have, one column at a time,
// the way PostgREST reports it. Each call is recorded, so a test can see
// what was asked for, not only what came back.
const table = vi.hoisted(() => ({
  missing: new Set<string>(),
  rows: [] as Record<string, unknown>[],
  selects: [] as string[],
  updates: [] as Record<string, unknown>[],
}))
const refuse = (cols: string[]) => {
  const gone = cols.find((c) => table.missing.has(c))
  return gone ? { data: null, error: { message: `column eruv.${gone} does not exist` } } : null
}
vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => {
      let result: { data: unknown; error: { message: string } | null } = { data: null, error: null }
      const builder: Record<string, unknown> = {}
      const self = () => builder
      Object.assign(builder, {
        select: (cols: string) => {
          table.selects.push(cols)
          const names = cols.split(',').map((c) => c.trim())
          result = refuse(names) ?? { data: table.rows.map((r) => Object.fromEntries(names.map((n) => [n, r[n] ?? null]))), error: null }
          return builder
        },
        update: (patch: Record<string, unknown>) => {
          table.updates.push(patch)
          result = refuse(Object.keys(patch)) ?? { data: null, error: null }
          return builder
        },
        eq: self,
        not: self,
        order: self,
        then: (resolve: (v: unknown) => void) => resolve(result),
      })
      return builder
    },
  }),
}))

import { listEruvMapSources, listEruvimForAdmin, updateEruv } from './eruvStore'

afterEach(() => {
  table.missing.clear()
  table.rows = []
  table.selects.length = 0
  table.updates.length = 0
})

const NE = { community_id: 'philly', id: 'northeast', name: 'Northeast Eruv', line_url: 'https://www.google.com/maps/d/viewer?mid=abc', line: null, line_leave_out: [], sort_order: 4, active: true }
const stored = { statusUrl: null, lineUrl: NE.line_url }

// Oct 15: an admin-set line colour (migration 081). The code goes out before
// the migration is run, so the guide has to work without the column.
describe('the eruv table before migration 081', () => {
  it('reads every eruv, in its own colours', async () => {
    table.missing.add('line_color')
    table.rows = [{ ...NE, line_hide_points: true }]
    const [source] = await listEruvMapSources('philly')
    expect(source).toMatchObject({ id: 'northeast', lineColor: null, lineHidePoints: true })
    const { eruvim } = await listEruvimForAdmin('philly')
    expect(eruvim[0]).toMatchObject({ id: 'northeast', lineColor: null, lineHidePoints: true })
  })

  it('and before 076 too, one missing column at a time', async () => {
    table.missing = new Set(['line_hide_points', 'line_missing', 'line_color'])
    table.rows = [NE]
    const [source] = await listEruvMapSources('philly')
    expect(source).toMatchObject({ id: 'northeast', lineColor: null, lineHidePoints: false, lineMissing: [] })
    expect(table.selects.at(-1)).not.toMatch(/line_hide_points|line_missing|line_color/)
  })

  it('saves an edit that leaves the colour alone', async () => {
    table.missing.add('line_color')
    await updateEruv('philly', 'northeast', { name: 'Northeast', lineColor: null }, stored)
    expect(table.updates.at(-1)).toMatchObject({ name: 'Northeast' })
    expect(table.updates.at(-1)).not.toHaveProperty('line_color')
  })

  it('fails a colour it can’t keep, rather than dropping it without a word', async () => {
    table.missing.add('line_color')
    await expect(updateEruv('philly', 'northeast', { lineColor: '#1d4ed8' }, stored)).rejects.toThrow(/line_color/)
  })
})

describe('the eruv table after it', () => {
  it('reads and saves the colour', async () => {
    table.rows = [{ ...NE, line_color: '#1d4ed8' }]
    const [source] = await listEruvMapSources('philly')
    expect(source.lineColor).toBe('#1d4ed8')
    await updateEruv('philly', 'northeast', { lineColor: '#1d4ed8' }, stored)
    expect(table.updates.at(-1)).toMatchObject({ line_color: '#1d4ed8' })
  })
})
