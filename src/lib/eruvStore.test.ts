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
        is: self,
        not: self,
        order: self,
        then: (resolve: (v: unknown) => void) => resolve(result),
      })
      return builder
    },
  }),
}))

import { eruvMapsVersion, listEmailedEruvim, listEruvMapSources, listEruvim, listEruvimForAdmin, saveEmailRead, updateEruv } from './eruvStore'

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

// Oct 19: an eruv's status by email (migration 084). The code goes out
// before the migration is run: the Eruv page must still load, and no eruv
// is read from email until it is.
describe('the eruv table before migration 084', () => {
  it('the public list still loads, every eruv read from its page', async () => {
    table.missing = new Set(['status_email', 'status_email_kept'])
    table.rows = [{ ...NE, status_url: 'https://www.centercityeruv.com/' }]
    const { eruvim, available } = await listEruvim('philly')
    expect(available).toBe(true)
    expect(eruvim[0]).toMatchObject({ id: 'northeast', statusEmailed: false })
    expect(table.selects.at(-1)).not.toMatch(/status_email/)
  })

  it('no eruv’s emails are read, and the admin tab still loads', async () => {
    table.missing = new Set(['status_email', 'status_email_kept'])
    table.rows = [NE]
    expect(await listEmailedEruvim('philly')).toEqual([])
    expect((await listEruvimForAdmin('philly')).eruvim[0]).toMatchObject({ statusEmail: null, statusEmailKept: null })
  })

  it('an address it can’t keep fails the save, rather than being dropped', async () => {
    table.missing = new Set(['status_email', 'status_email_kept'])
    await expect(updateEruv('philly', 'northeast', { statusEmail: 'eruv@example.org' }, stored)).rejects.toThrow(/status_email/)
  })
})

describe('the eruv table after 084', () => {
  it('the public list says which eruvim are emailed, never the address', async () => {
    table.rows = [{ ...NE, status_email: 'jcor-ne-philadelphia@groups.io' }]
    const { eruvim } = await listEruvim('philly')
    expect(eruvim[0].statusEmailed).toBe(true)
    expect(JSON.stringify(eruvim)).not.toContain('groups.io')
    expect(await listEmailedEruvim('philly')).toMatchObject([{ id: 'northeast', statusEmail: 'jcor-ne-philadelphia@groups.io' }])
  })

  it('an email’s read saves its status as a page read does, and what’s kept', async () => {
    await saveEmailRead('philly', 'northeast', { ok: true, status: 'down', words: 'The eruv is down', postedOn: '2026-10-09', at: '2026-10-09T17:30:00Z' }, null)
    expect(table.updates.at(-1)).toMatchObject({ status: 'down', status_posted_on: '2026-10-09', status_checked_at: '2026-10-09T17:30:00Z', status_error: null, status_email_kept: null })
    const kept = { messageId: 'g1', subject: 'Eruv dinner', sentAt: '2026-10-09T17:30:00Z', text: 'Thank our volunteers.', words: null }
    await saveEmailRead('philly', 'northeast', null, kept)
    expect(table.updates.at(-1)).toMatchObject({ status_email_kept: kept })
    expect(table.updates.at(-1)).not.toHaveProperty('status')
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

// Oct 15: a colour changed in the admin was still the old one on the map,
// since /api/eruv/maps is kept at the CDN for an hour. The maps are asked
// for under this fingerprint of what an admin chose about them.
describe('eruvMapsVersion', () => {
  it('changes with what an admin chose about a map, and only that', async () => {
    table.rows = [{ ...NE, status: 'up', status_checked_at: '2026-10-15T10:00:00Z' }]
    const before = await eruvMapsVersion('philly')
    expect(before).toMatch(/^[0-9a-f]{12}$/)
    // Its status read again (every few hours): the same maps, the same address.
    table.rows = [{ ...NE, status: 'down', status_checked_at: '2026-10-15T13:00:00Z' }]
    expect(await eruvMapsVersion('philly')).toBe(before)
    for (const chosen of [{ line_color: '#1d4ed8' }, { line_leave_out: ['Old border'] }, { line_hide_points: true }, { active: false }, { line_url: 'https://www.google.com/maps/d/viewer?mid=new' }]) {
      table.rows = [{ ...NE, ...chosen }]
      expect(await eruvMapsVersion('philly'), JSON.stringify(chosen)).not.toBe(before)
    }
    // An eruv removed is a change too.
    table.rows = []
    expect(await eruvMapsVersion('philly')).not.toBe(before)
  })

  it('before migration 081, still one; without the table, none', async () => {
    table.missing.add('line_color')
    table.rows = [NE]
    expect(await eruvMapsVersion('philly')).toMatch(/^[0-9a-f]{12}$/)
    table.missing.add('id')
    expect(await eruvMapsVersion('philly')).toBeNull()
  })
})
