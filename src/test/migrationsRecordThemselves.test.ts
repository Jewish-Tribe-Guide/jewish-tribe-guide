import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Nothing recorded which migrations ran where (the health sweep, Nov 20).
// Migration 105 made `migration_ran`, and each migration from it on writes
// its own name there, which `npm run migrations:report` reads. One that
// forgets is a migration the report can't vouch for.

const DIR = join(process.cwd(), 'supabase', 'migrations')
const FIRST_RECORDED = '20240101000105_migration_ran'
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()

describe('every migration records that it ran', () => {
  it('a migration makes the record', () => {
    expect(files).toContain(`${FIRST_RECORDED}.sql`)
    expect(readFileSync(join(DIR, `${FIRST_RECORDED}.sql`), 'utf8')).toMatch(/create table if not exists public\.migration_ran/)
  })

  it('each from that one on writes its own name, as its file is named', () => {
    const recorded = files.filter((f) => f.replace(/\.sql$/, '') >= FIRST_RECORDED)
    for (const f of recorded) {
      const name = f.replace(/\.sql$/, '')
      const sql = readFileSync(join(DIR, f), 'utf8')
      expect(sql, `${f} doesn’t write its name into migration_ran`).toContain(`insert into public.migration_ran (name) values ('${name}') on conflict (name) do nothing;`)
    }
  })
})
