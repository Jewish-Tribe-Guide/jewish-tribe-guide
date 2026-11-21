import { describe, expect, it } from 'vitest'
import { CHUNK, columnsFrom, fitRows, inPasses, movedFiles, refuseTarget, restoreTables } from './restore.mjs'

describe('refuseTarget', () => {
  const backupFrom = 'https://live.supabase.co'
  const prodUrl = 'https://live.supabase.co'

  it('refuses the project the backup came from, and live, however written', () => {
    expect(refuseTarget('https://live.supabase.co/', { backupFrom, prodUrl })).toMatch(/came from/)
    expect(refuseTarget('https://live.supabase.co', { backupFrom: 'https://dev.supabase.co', prodUrl })).toMatch(/live project/)
  })

  it('refuses no target at all', () => {
    expect(refuseTarget(undefined, { backupFrom, prodUrl })).toMatch(/RESTORE_URL/)
  })

  it('allows a new project', () => {
    expect(refuseTarget('https://new.supabase.co', { backupFrom, prodUrl })).toBeNull()
  })
})

describe('movedFiles', () => {
  it('points a row’s file addresses at the new project, nested ones too', () => {
    const row = { logo: 'https://live.supabase.co/storage/v1/object/public/site-assets/logo/a.png', details: { photos: ['https://live.supabase.co/storage/v1/object/public/site-assets/p/b.jpg'] }, website: 'https://live.supabase.co.example.org' }
    expect(movedFiles(row, 'https://live.supabase.co', 'https://new.supabase.co')).toEqual({
      logo: 'https://new.supabase.co/storage/v1/object/public/site-assets/logo/a.png',
      details: { photos: ['https://new.supabase.co/storage/v1/object/public/site-assets/p/b.jpg'] },
      website: 'https://live.supabase.co.example.org',
    })
  })

  it('leaves a row with no file of the old project as it is', () => {
    const row = { name: 'Kosher Mart' }
    expect(movedFiles(row, 'https://live.supabase.co', 'https://new.supabase.co')).toBe(row)
  })
})

describe('restoreTables', () => {
  const t = (name: string, n = 1) => ({ name, rows: Array.from({ length: n }, (_, i) => ({ id: i })) })

  it('waits a table held back by a foreign key until what it points at is in', async () => {
    const inserted: string[] = []
    const { done, left } = await restoreTables([t('resource'), t('category')], async (name: string) => {
      if (name === 'resource' && !inserted.includes('category')) return { code: '23503', message: 'violates foreign key' }
      inserted.push(name)
      return null
    })
    expect(done).toEqual(['category', 'resource'])
    expect(left).toEqual([])
  })

  it('stops when a pass makes no progress, and says which and why', async () => {
    const { done, left } = await restoreTables([t('a'), t('b')], async (name: string) => (name === 'a' ? null : { code: '23503', message: 'points at nothing' }))
    expect(done).toEqual(['a'])
    expect(left).toEqual([{ name: 'b', why: 'points at nothing' }])
  })

  it('stops at once on any other error', async () => {
    const asked: string[] = []
    const { left } = await restoreTables([t('a'), t('b')], async (name: string) => {
      asked.push(name)
      return name === 'a' ? { code: '42703', message: 'column x does not exist' } : null
    })
    expect(asked).toEqual(['a'])
    expect(left).toEqual([{ name: 'a', why: 'column x does not exist' }])
  })

  it('sends a big table in chunks', async () => {
    const sizes: number[] = []
    await restoreTables([t('submission', CHUNK * 2 + 5)], async (_: string, rows: unknown[]) => {
      sizes.push(rows.length)
      return null
    })
    expect(sizes).toEqual([CHUNK, CHUNK, 5])
  })
})

describe('inPasses', () => {
  it('empties a table others point at only once they are empty', async () => {
    const emptied: string[] = []
    const { done, left } = await inPasses([{ name: 'community' }, { name: 'eruv' }], async ({ name }: { name: string }) => {
      if (name === 'community' && !emptied.includes('eruv')) return { code: '23503', message: 'still referenced' }
      emptied.push(name)
      return null
    })
    expect(done).toEqual(['eruv', 'community'])
    expect(left).toEqual([])
  })
})

describe('fitRows', () => {
  // A backup from before a migration dropped a column (Nov 21: the first
  // live backup, then 106 dropped site_settings.contribution_note).
  it('leaves out a column the new project lacks, and says if it held anything', () => {
    const { rows, dropped } = fitRows([{ id: 'philly', title: 'Philly', contribution_note: 'Thanks' }, { id: 'ues', title: 'UES', contribution_note: null }], new Set(['id', 'title']))
    expect(rows).toEqual([{ id: 'philly', title: 'Philly' }, { id: 'ues', title: 'UES' }])
    expect([...dropped]).toEqual([['contribution_note', 1]])
  })

  it('reads the columns from the project’s own description', () => {
    expect(columnsFrom({ definitions: { page: { properties: { slug: {}, body: {} } } } }).get('page')).toEqual(new Set(['slug', 'body']))
  })
})
