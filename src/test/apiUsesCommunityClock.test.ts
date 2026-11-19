import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// No API route reads the deployment's community config (Nov 18 review,
// item 33).
//
// src/community.config.ts is the bootstrap community, one per deployment.
// Five routes took their clock from it (zmanim, the zmanim batch, festivals,
// a shul's times and special schedules, and the schedule reader), so a
// second community's "today", its festivals' days and its shuls' sunsets
// were all Philadelphia's. A route asks for the community it is serving
// instead: the listing's own (its row's community_id) or the request's
// (communitySlugFromRequest), through resolveCommunity.
// ─────────────────────────────────────────────────────────────────────────────

const API = join(process.cwd(), 'src/app/api')

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name)
    if (e.isDirectory()) return routeFiles(path)
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [path] : []
  })
}

describe('API routes', () => {
  it('take their community from the request or the listing, never the deployment config', () => {
    const offenders = routeFiles(API)
      .filter((f) => /from ['"]@\/community\.config['"]/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(process.cwd(), f))
    expect(offenders).toEqual([])
  })
})
