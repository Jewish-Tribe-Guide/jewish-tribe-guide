import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// A store whose table or column isn't there yet (a migration not run) carries
// on without it, and until Nov 20 said nothing: a feature was just off on
// live, and nobody knew why (the health sweep). Every such check now goes
// through src/lib/supabase/schemaMissing.ts, which tells Sentry. One that
// reads Postgres' "does not exist" or "schema cache" itself would be silent
// again.

const SRC = join(process.cwd(), 'src')
const HELPER = 'lib/supabase/schemaMissing.ts'
const OWN_CHECK = /does not exist\|schema cache|schema cache\|does not exist|includes\(\s*['"`](does not exist|schema cache)/

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return walk(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe('a missed migration reaches Sentry', () => {
  it('no store checks for a missing table or column except through schemaMissing', () => {
    const own = walk(SRC)
      .map((path) => relative(SRC, path))
      .filter((file) => file !== HELPER)
      .flatMap((file) =>
        readFileSync(join(SRC, file), 'utf8')
          .split('\n')
          .flatMap((line, i) => (OWN_CHECK.test(line) ? [`${file}:${i + 1}`] : [])),
      )
    expect(own, 'use schemaMissing() from src/lib/supabase/schemaMissing.ts').toEqual([])
  })

  it('the helper is what reports', () => {
    expect(readFileSync(join(SRC, HELPER), 'utf8')).toMatch(/reportServerError\(/)
  })
})
