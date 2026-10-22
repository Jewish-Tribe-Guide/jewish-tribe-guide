import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The cache-roundtrip suite renames its fixture category mid-test. Every
// test server starts through run-test-project-server.mjs against the same
// project, and each used to put that name back as it started: the form or
// admin-write server (or a local run) starting during the test reset it,
// and the test failed reading the original name (#342, Oct 22). The script
// runs a build when imported, so this reads its source.
const script = readFileSync('scripts/run-test-project-server.mjs', 'utf-8')
const fixture = script.slice(script.indexOf('async function ensureCacheRoundtripFixtureCategory'))
const categoryUpsert = fixture.slice(fixture.indexOf(".from('category').upsert("), fixture.indexOf('if (categoryError)'))

describe('the cache-roundtrip fixture category', () => {
  it('only the cache suite’s own server puts its name back; any other only creates it', () => {
    expect(fixture).toMatch(/const ownsFixture = process\.env\.CACHE_ROUNDTRIP_OWNS_FIXTURE === '1'/)
    expect(categoryUpsert).toMatch(/\{ ignoreDuplicates: !ownsFixture \}\)\s*$/)
  })

  it('the cache suite says it owns it; the others don’t', () => {
    expect(readFileSync('playwright.cache.config.ts', 'utf-8')).toMatch(/process\.env\.CACHE_ROUNDTRIP_OWNS_FIXTURE = '1'/)
    for (const other of ['playwright.form.config.ts', 'playwright.admin-write.config.ts', 'playwright.config.ts']) {
      expect(readFileSync(other, 'utf-8')).not.toContain('CACHE_ROUNDTRIP_OWNS_FIXTURE')
    }
  })
})
