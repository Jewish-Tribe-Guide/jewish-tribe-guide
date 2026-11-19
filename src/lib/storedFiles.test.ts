import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const BASE = 'https://proj.supabase.co'
const url = (path: string) => `${BASE}/storage/v1/object/public/site-assets/${path}`

// A database of tables (rows) and a bucket of files, behind the same calls
// storedFiles.ts makes.
const db = vi.hoisted(() => ({
  tables: {} as Record<string, { key: string[]; rows: Record<string, unknown>[]; error?: string }>,
  files: {} as Record<string, { name: string; id: string | null; created_at?: string; metadata?: { size: number } }[]>,
  removed: [] as string[],
}))

vi.mock('next/server', () => ({ after: (fn: () => unknown) => fn() }))
vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({
    from: (name: string) => {
      const q = {
        select: () => q,
        order: () => q,
        match: () => q,
        maybeSingle: async () => ({ data: db.tables[name]?.rows[0] ?? null, error: null }),
        range: async (from: number, to: number) => {
          const t = db.tables[name]
          if (t.error) return { data: null, error: { message: t.error }, count: null }
          return { data: t.rows.slice(from, to + 1), error: null, count: t.rows.length }
        },
      }
      return q
    },
    storage: {
      from: () => ({
        list: async (folder: string) => ({
          data: folder === '' ? Object.keys(db.files).map((name) => ({ name, id: null })) : db.files[folder],
          error: null,
        }),
        remove: async (paths: string[]) => {
          db.removed.push(...paths)
          return { data: paths.map((name) => ({ name })), error: null }
        },
      }),
    },
  }),
}))

import { isMentioned, removeIfUnused, storedPaths, sweepUnusedFiles, SWEEP_AFTER_DAYS } from './storedFiles'

const NOW = Date.parse('2026-11-19T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString()

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', BASE)
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service')
  db.removed = []
  db.tables = {
    site_settings: { key: ['community_id'], rows: [{ community_id: 'philly', logo_url: url('logo/1-new.png') }] },
    submission: { key: ['id'], rows: [{ id: 's1', details: { photo: url('listing-photo/2-history.jpg') } }] },
    resource: { key: ['id'], rows: [{ id: 'r1', body: `<img src="${url('listing-photo/3-live.jpg')}?width=600">` }] },
  }
  db.files = {
    logo: [
      { name: '1-new.png', id: 'a', created_at: daysAgo(90), metadata: { size: 1000 } },
      { name: '0-old.png', id: 'b', created_at: daysAgo(90), metadata: { size: 2_500_000 } },
    ],
    'listing-photo': [
      { name: '2-history.jpg', id: 'c', created_at: daysAgo(90), metadata: { size: 1 } },
      { name: '3-live.jpg', id: 'd', created_at: daysAgo(90), metadata: { size: 1 } },
      { name: '4-unsaved-today.jpg', id: 'e', created_at: daysAgo(1), metadata: { size: 1 } },
      { name: '5-unsaved-long-ago.jpg', id: 'f', created_at: daysAgo(SWEEP_AFTER_DAYS + 1), metadata: { size: 400_000 } },
    ],
  }
  vi.stubGlobal('fetch', async () =>
    new Response(JSON.stringify({
      definitions: Object.fromEntries(
        Object.entries(db.tables).map(([name, t]) => [name, { properties: Object.fromEntries(t.key.map((k) => [k, { description: 'Note:\nThis is a Primary Key.<pk/>' }])) }]),
      ),
    })),
  )
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('storedPaths: the files a value mentions', () => {
  it('reads this project’s addresses, anywhere in the value, once each', () => {
    expect(storedPaths({ a: url('hero/1-a.jpg'), b: [url('hero/1-a.jpg'), `x ${url('category-band/2-b.jpeg')}?width=300`] })).toEqual(['hero/1-a.jpg', 'category-band/2-b.jpeg'])
  })
  it('never another site’s files', () => {
    expect(storedPaths({ a: 'https://other.supabase.co/storage/v1/object/public/site-assets/hero/1-a.jpg' })).toEqual([])
    expect(storedPaths(null)).toEqual([])
  })
})

describe('isMentioned', () => {
  it('by its file name, plain or encoded', () => {
    expect(isMentioned('hero/1-a.jpg', `{"x":"${url('hero/1-a.jpg')}"}`)).toBe(true)
    expect(isMentioned('hero/my photo.jpg', 'https://x/render/image/public/site-assets/hero/my%20photo.jpg')).toBe(true)
    expect(isMentioned('hero/1-a.jpg', '{"x":"hero/1-b.jpg"}')).toBe(false)
  })
})

describe('removeIfUnused: after a save replaces a file', () => {
  it('deletes the old file, keeps one still in use anywhere', async () => {
    expect(await removeIfUnused(['logo/0-old.png', 'listing-photo/2-history.jpg', 'listing-photo/3-live.jpg'])).toEqual(['logo/0-old.png'])
    expect(db.removed).toEqual(['logo/0-old.png'])
  })
  it('deletes nothing when any table can’t be read', async () => {
    db.tables.submission.error = 'timeout'
    await expect(removeIfUnused(['logo/0-old.png'])).rejects.toThrow(/submission/)
    expect(db.removed).toEqual([])
  })
})

describe('sweepUnusedFiles: the weekly sweep', () => {
  it('clears files nothing mentions once they’re old enough', async () => {
    expect(await sweepUnusedFiles(NOW)).toEqual({ cleared: 2, bytes: 2_900_000 })
    expect(db.removed.sort()).toEqual(['listing-photo/5-unsaved-long-ago.jpg', 'logo/0-old.png'])
  })
  it('reads every page of a big table before deciding', async () => {
    db.tables.submission.rows = [
      ...Array.from({ length: 1500 }, (_, i) => ({ id: `s${i}` })),
      { id: 'last', details: { photo: url('logo/0-old.png') } },
    ]
    await sweepUnusedFiles(NOW)
    expect(db.removed).not.toContain('logo/0-old.png')
  })
  it('deletes nothing when a big table has no key to page it by', async () => {
    db.tables.submission = { key: [], rows: Array.from({ length: 1001 }, (_, i) => ({ id: `s${i}` })) }
    expect(await sweepUnusedFiles(NOW)).toEqual({ error: expect.stringMatching(/no key/) })
    expect(db.removed).toEqual([])
  })
  it('deletes nothing, and says why, when a table can’t be read', async () => {
    db.tables.resource.error = 'timeout'
    expect(await sweepUnusedFiles(NOW)).toEqual({ error: expect.stringMatching(/resource/) })
    expect(db.removed).toEqual([])
  })
  it('deletes nothing when the database lists no tables', async () => {
    db.tables = {}
    expect(await sweepUnusedFiles(NOW)).toEqual({ error: expect.any(String) })
    expect(db.removed).toEqual([])
  })
})
