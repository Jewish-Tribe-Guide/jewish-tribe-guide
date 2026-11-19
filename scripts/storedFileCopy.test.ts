import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pointAt, storedPathsOn, withOwnFiles } from './storedFileCopy.mjs'

// sync-dev-from-prod used to copy live's rows with their photo addresses
// as they were, so the test project showed live's files, and broke when
// live cleared one it no longer used (dev's Philly logo, Nov 19).

const LIVE = 'https://live.supabase.co'
const DEV = 'https://dev.supabase.co'
const file = (base: string, path: string) => `${base}/storage/v1/object/public/site-assets/${path}`
const resized = (base: string, path: string) => `${base}/storage/v1/render/image/public/site-assets/${path}?width=600`

describe('storedPathsOn', () => {
  it('finds live’s files anywhere in a row, plain or resized, once each', () => {
    const row = { logo_url: file(LIVE, 'logo/1-a.webp'), details: { photo: resized(LIVE, 'listing-photo/2-b.jpg'), again: file(LIVE, 'logo/1-a.webp') } }
    expect(storedPathsOn(row, LIVE)).toEqual(['logo/1-a.webp', 'listing-photo/2-b.jpg'])
  })
  it('never another project’s', () => {
    expect(storedPathsOn({ a: file(DEV, 'logo/1-a.webp') }, LIVE)).toEqual([])
  })
})

describe('pointAt', () => {
  it('points each copied file at the test project, keeping how it was asked for', () => {
    const row = { logo_url: file(LIVE, 'logo/1-a.webp'), body: `<img src="${resized(LIVE, 'hero/3-c.jpg')}">` }
    expect(pointAt(row, LIVE, DEV, new Set(['logo/1-a.webp', 'hero/3-c.jpg']))).toEqual({
      logo_url: file(DEV, 'logo/1-a.webp'),
      body: `<img src="${resized(DEV, 'hero/3-c.jpg')}">`,
    })
  })
  it('leaves a file that wasn’t copied on live', () => {
    const row = { a: file(LIVE, 'logo/1-a.webp') }
    expect(pointAt(row, LIVE, DEV, new Set())).toBe(row)
  })
})

describe('withOwnFiles', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('copies what the test project lacks, then points the rows at it; a file live lacks stays as it was', async () => {
    const uploaded: string[] = []
    const dest = { storage: { from: () => ({ upload: async (path: string) => (uploaded.push(path), { error: null }) }) } }
    vi.stubGlobal('fetch', async (url: string, init?: { method?: string }) => {
      if (init?.method === 'HEAD') return new Response(null, { status: url === file(DEV, 'hero/have.jpg') ? 200 : 400 })
      if (url === file(LIVE, 'logo/gone.webp')) return new Response(null, { status: 400 })
      return new Response('bytes', { headers: { 'content-type': 'image/webp' } })
    })
    const rows = [{ logo_url: file(LIVE, 'logo/1-a.webp') }, { hero: file(LIVE, 'hero/have.jpg'), old: file(LIVE, 'logo/gone.webp') }]
    const out = await withOwnFiles(rows, LIVE, DEV, dest)
    expect(uploaded).toEqual(['logo/1-a.webp'])
    expect(out.rows).toEqual([{ logo_url: file(DEV, 'logo/1-a.webp') }, { hero: file(DEV, 'hero/have.jpg'), old: file(LIVE, 'logo/gone.webp') }])
    expect(out.failed).toEqual([expect.stringMatching(/logo\/gone\.webp: live answered 400/)])
  })
})

// The sync itself: every write it makes to the test project goes through
// withOwnFiles (its ownFiles) first, so no row it copies keeps a live address.
describe('sync-dev-from-prod', () => {
  const script = readFileSync('scripts/sync-dev-from-prod.mjs', 'utf-8')
  it('copies each table’s files before writing its rows', () => {
    const writes = [...script.matchAll(/dest\.from\([^)]*\)\.upsert\((\w+)/g)].map((m) => m[1])
    expect(writes.length).toBeGreaterThan(1)
    for (const rows of writes) expect(script, `${rows} is written without its files`).toMatch(new RegExp(`const ${rows} = await (?:withOwnFiles|ownFiles)\\(`))
  })
})
