import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// The site reads a community's own centre, area name and clock, never the
// deployment config's (Nov 19).
//
// src/community.config.ts is the bootstrap community, one per deployment:
// Philly. Its mapCenter, region and timezone were read straight from it in
// the map, distances, zmanim for shuls with no address, the footer and
// wizard ("Philadelphia"), "seen today" and "last checked Oct 2" — so a
// second community was measured from Philadelphia and dated by its clock.
// Components read useCommunityPlace / useCommunityTimezone instead, which
// fall back to the config only outside a community route.
//
// API routes have their own guard (apiUsesCommunityClock.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

const SRC = join(process.cwd(), 'src')

/** Where reading the config's place or clock is the point. */
const ALLOWED = new Set([
  // The hooks' own fallback outside a community route.
  'src/lib/communityContext.tsx',
  // The communities table's defaults for the bootstrap row.
  'src/lib/communityStore.ts',
  // HOURS_TIMEZONE: the last resort when a caller passes no clock.
  'src/lib/hours.ts',
  // One policy for the whole site, so one date (see the page's comment).
  'src/app/[community]/privacy/page.tsx',
])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name)
    if (e.isDirectory()) return path === join(SRC, 'app/api') ? [] : sourceFiles(path)
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [path] : []
  })
}

/** The local names `community` is imported as from the config, e.g.
 *  `community`, or `siteCommunity` for `community as siteCommunity`. */
export function configBindings(source: string): string[] {
  const names: string[] = []
  const re = /import\s*\{([^}]*)\}\s*from\s*['"]@\/community\.config['"]/g
  for (const m of source.matchAll(re)) {
    for (const part of m[1].split(',')) {
      const [name, alias] = part.trim().split(/\s+as\s+/)
      if (name === 'community') names.push(alias ?? name)
    }
  }
  return names
}

export function readsConfigPlace(source: string): boolean {
  return configBindings(source).some((b) => new RegExp(`\\b${b}\\.(mapCenter|region|timezone)\\b`).test(source))
}

describe('readsConfigPlace', () => {
  it('sees a read through the plain name and through an alias', () => {
    expect(readsConfigPlace(`import { community } from '@/community.config'\nconst c = community.mapCenter`)).toBe(true)
    expect(readsConfigPlace(`import { community as cfg } from '@/community.config'\nx(cfg.timezone)`)).toBe(true)
  })
  it('leaves the config\'s other fields, and a community from anywhere else, alone', () => {
    expect(readsConfigPlace(`import { community } from '@/community.config'\nif (community.features.volunteer) {}`)).toBe(false)
    expect(readsConfigPlace(`const { community } = useActiveCommunity()\nconst c = community.mapCenter`)).toBe(false)
  })
})

describe('the public site and the admin', () => {
  it("read each community's own centre, region and clock, never the deployment config's", () => {
    const offenders = sourceFiles(SRC)
      .map((f) => relative(process.cwd(), f))
      .filter((f) => !ALLOWED.has(f))
      .filter((f) => readsConfigPlace(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
