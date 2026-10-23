import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compareKeystone, keystoneAgrees, parseKeystoneList, type WatchedListing } from './keystoneWatch'
import { compareMekor, MEKOR_LIST_URL, mekorAgrees, parseMekorList, type GuideListing } from './mekorWatch'

// The kosher lists' runs date the listings their list agrees with (the
// user, Oct 19: they ran every day, and the dates sat at the last
// approval). Each run here reads its list from a saved copy and the guide
// from a stand-in, and is checked for what it dated. Refuah's run is
// checked in refuahRun.test.ts.

const m = vi.hoisted(() => ({
  resources: [] as unknown[],
  confirmFromSource: vi.fn(async () => 0),
}))
vi.mock('@/lib/sourceConfirm', () => ({ confirmFromSource: m.confirmFromSource }))
vi.mock('@/lib/email', () => ({ sendWatchDigest: vi.fn(async () => {}) }))
vi.mock('@/lib/submissionStore', () => ({ submitListingCreate: vi.fn(), submitListingUpdate: vi.fn(), submitListingDelete: vi.fn() }))
vi.mock('@/lib/googlePlaces', () => ({ canAskGoogle: () => false, findPlaceStatus: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      const result = { data: table === 'resource' ? m.resources : [], error: null }
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        then: (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok),
      }
      return q
    },
  }),
}))

const { runKeystoneWatch } = await import('./keystoneRun')
const { runMekorWatch } = await import('./mekorRun')

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, '__fixtures__', name), 'utf8')
const serve = (body: string) => vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })))

beforeEach(() => {
  m.confirmFromSource.mockClear()
  vi.unstubAllGlobals()
})

describe('Keystone-K’s run', () => {
  // The saved page is trimmed to 9 places, and a run reading fewer than 30
  // refuses the page as changed shape: places that aren't food, to pad it.
  const filler = Array.from({ length: 25 }, (_, i) => `<article ><h2 class="entry-title"><a href="https://keystone-k.org/kosher/filler-${i}/">Filler ${i}</a></h2></article>`)
  const html = fixture('keystone-establishments.html') + filler.join('')
  const grill = { id: 'grill', category: 'restaurant', name: 'Cherry Grill', address: null, phone: null, anchor_id: 'community', distance: null, details: { kosherCert: ['Keystone-K'], k: 'https://keystone-k.org/kosher/cherry-grill/', t: ['Meat'] } }
  const bagel = { ...grill, id: 'bagel', name: 'New York Bagel Bakery', details: { kosherCert: 'Keystone-K', k: 'https://keystone-k.org/kosher/new-york-bagel/' } }

  it('dates the listings the list agrees with, by Keystone-K', async () => {
    m.resources = [grill, bagel]
    serve(html)
    const run = await runKeystoneWatch('philly', 'https://keystone-k.org/establishments/')
    expect(run).toMatchObject({ ok: true })
    const entries = parseKeystoneList(html)
    const expected = keystoneAgrees(entries, m.resources as WatchedListing[], compareKeystone(entries, m.resources as WatchedListing[]))
    expect(expected).toEqual(['grill'])
    expect(m.confirmFromSource).toHaveBeenCalledWith('philly', ['grill'], 'Keystone-K', ['kosher'])
  })

  it('a dry run dates nothing', async () => {
    m.resources = [grill]
    serve(html)
    await runKeystoneWatch('philly', 'https://keystone-k.org/establishments/', { dry: true })
    expect(m.confirmFromSource).not.toHaveBeenCalled()
  })
})

describe('Mekor Habracha’s run', () => {
  it('dates the live listings the list agrees with, by Mekor Habracha', async () => {
    const html = fixture('mekor-center-city.html')
    const guide = JSON.parse(fixture('mekor-guide-listings.json')) as GuideListing[]
    m.resources = guide
    serve(html)
    const run = await runMekorWatch('philly', MEKOR_LIST_URL)
    expect(run.ok).toBe(true)
    const { entries } = parseMekorList(html)
    const expected = mekorAgrees(entries, guide, compareMekor(entries, guide, []))
    expect(expected.length).toBeGreaterThan(0)
    expect(m.confirmFromSource).toHaveBeenCalledWith('philly', expected, 'Mekor Habracha', ['kosher'])
  })
})
