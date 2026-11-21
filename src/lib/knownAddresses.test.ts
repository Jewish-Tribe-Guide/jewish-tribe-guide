import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMMUNITY_SCREENS, TOP_LEVEL, isKnownAddress, type KnownAddresses } from './knownAddresses'

// The proxy turns away an address whose first segment isn't a community or
// one of TOP_LEVEL, and a community's second segment that isn't a category,
// a form or one of COMMUNITY_SCREENS. A new top-level route, a file in
// public/ or a new screen under [community] missing from those lists would
// answer 404 on the live site and pass every page test that doesn't visit
// it. So the lists are checked against the folders.

const APP = join(process.cwd(), 'src/app')
const folders = (dir: string) => readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory() && !/^[[(@_]/.test(n))

describe('the proxy’s lists of addresses that aren’t categories', () => {
  it('TOP_LEVEL has every top-level route, metadata file and public file', () => {
    const metadata = readdirSync(APP)
      .filter((n) => /^(robots|sitemap|manifest)\.ts$/.test(n))
      .map((n) => ({ robots: 'robots.txt', sitemap: 'sitemap.xml', manifest: 'manifest.webmanifest' })[n.replace('.ts', '') as 'robots'])
    const expected = [...folders(APP), ...metadata, ...readdirSync(join(process.cwd(), 'public'))]
    expect(expected.length).toBeGreaterThan(5)
    expect(expected.filter((n) => !TOP_LEVEL.has(n))).toEqual([])
  })

  it('COMMUNITY_SCREENS has every screen under [community]', () => {
    const screens = folders(join(APP, '[community]'))
    expect(screens).toContain('about')
    expect(screens.filter((n) => !COMMUNITY_SCREENS.has(n))).toEqual([])
  })
})

describe('isKnownAddress', () => {
  const known: KnownAddresses = {
    communities: new Set(['philly']),
    slugs: new Set(['philly/food']),
    listings: new Set(['philly/food/goldi-a1b2c3', 'philly/food/0b1c2d3e-0000-0000-0000-000000000000']),
  }

  it('knows a listing by its friendly slug or its bare id', () => {
    expect(isKnownAddress('/philly/food/goldi-a1b2c3', known)).toBe(true)
    expect(isKnownAddress('/philly/food/0b1c2d3e-0000-0000-0000-000000000000', known)).toBe(true)
    expect(isKnownAddress('/philly/food/goldi-ffffff', known)).toBe(false)
  })

  it('reads an encoded segment as its letters', () => {
    expect(isKnownAddress('/philly/%66ood', known)).toBe(true)
    expect(isKnownAddress('/philly/%E0%A4%A', known)).toBe(false)
  })

  it('leaves an address deeper than any route to the router', () => {
    expect(isKnownAddress('/philly/food/goldi-a1b2c3/extra', known)).toBe(true)
  })

  it('a fixed view has no listings under it', () => {
    expect(isKnownAddress('/philly/eruv', known)).toBe(true)
    expect(isKnownAddress('/philly/eruv/anything', known)).toBe(false)
  })
})
