import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CONFIG_COMMUNITY_SLUG } from '@/lib/configCommunity'
import { SEED_COMMUNITY } from '../../scripts/seedCommunity.mjs'

// community_id defaulted to 'philly' (migration 027), so a write that never
// said which community was filed under Philly without a word. Migration 104
// drops it (Nov 20, the health sweep).

const DIR = 'supabase/migrations'
const TABLES = ['resource', 'category', 'form', 'home_section', 'site_settings', 'submission', 'form_response', 'hospital', 'tag']
const migrations = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
/** A migration's statements, without its comments. */
const sqlOf = (f: string) => readFileSync(join(DIR, f), 'utf8').replace(/--.*$/gm, '')

describe('community_id has no default', () => {
  it('a migration drops the default on every table 027 gave one', () => {
    const drop = migrations.find((f) => /community_id drop default/.test(sqlOf(f)))
    expect(drop, 'no migration drops community_id’s default').toBeDefined()
    const sql = sqlOf(drop!)
    for (const t of TABLES) expect(sql).toContain(`'${t}'`)
  })

  it('no migration after it puts a default back', () => {
    const dropAt = migrations.findIndex((f) => /community_id drop default/.test(sqlOf(f)))
    // A column given one, or one set on it after.
    const setsOne = /community_id\s+text[^,;]*\bdefault\b|community_id\s+set\s+default/i
    const later = migrations.slice(dropAt + 1).filter((f) => setsOne.test(sqlOf(f)))
    expect(later).toEqual([])
  })
})

describe('the setup and import scripts name their community', () => {
  it('default to the config’s community', () => {
    expect(SEED_COMMUNITY).toBe(CONFIG_COMMUNITY_SLUG)
  })

  // A script that writes one of these tables without saying which
  // community now fails on the missing value; this says so before it runs.
  it('every script that writes these tables names the community', () => {
    const writes = new RegExp(`\\.from\\(\\s*'(${TABLES.join('|')})'\\s*\\)\\s*\\.(insert|upsert)\\(`)
    const silent = readdirSync('scripts')
      .filter((f) => f.endsWith('.mjs'))
      .filter((f) => {
        const src = readFileSync(join('scripts', f), 'utf8')
        return writes.test(src) && !/community_id/.test(src)
      })
    expect(silent).toEqual([])
  })
})
