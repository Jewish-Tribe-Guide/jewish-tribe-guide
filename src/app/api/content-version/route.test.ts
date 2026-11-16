import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The defect (Nov 16): this route answered from a fingerprint each server
// cached for itself, the live servers held different copies, and a tab
// coming back was told "changed" on nearly every return when nothing had.
// Per-server caches can't be set up in a unit test, so this pins the shape
// that rules it out: the route reads the current version fresh, and the
// function it reads it through is not cached.
const here = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('/api/content-version', () => {
  it('answers from the version read fresh, never a cached one', () => {
    const route = here('src/app/api/content-version/route.ts')
    expect(route).toMatch(/\bcurrentContentVersion\(/)
    expect(route).not.toMatch(/[^t]contentVersion\(/)
  })

  it('reads it without a cache', () => {
    const source = here('src/lib/contentVersion.ts')
    const body = source.slice(source.indexOf('export async function currentContentVersion'))
    const fn = body.slice(0, body.indexOf('\n}\n'))
    expect(fn).toContain('readContentStamp()')
    expect(fn).not.toContain("'use cache'")
  })
})
