import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SITE_STATE_KEYS, SYNC_INTERNAL_FIELDS } from './syncFields'

// The keys moving out of `details` are listed twice: here for the site, and
// in migration 110's site_state_keys() for the trigger that copies them. A
// key in one and not the other is a key the site reads from `state` that the
// database never put there, or the reverse.
const MIGRATION = 'supabase/migrations/20240101000110_resource_state.sql'

function migrationKeys(): string[] {
  const sql = readFileSync(MIGRATION, 'utf8')
  const body = /function public\.site_state_keys\(\)[\s\S]*?array\[([\s\S]*?)\]::text\[\]/.exec(sql)
  if (!body) throw new Error('site_state_keys() not found in migration 110')
  return [...body[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

describe('the site’s own keys', () => {
  it('are the same in the site and in migration 110', () => {
    expect([...migrationKeys()].sort()).toEqual([...SITE_STATE_KEYS].sort())
  })

  it('leave in `details` what a person may write', () => {
    expect(SITE_STATE_KEYS).not.toContain('googleDescription')
    expect(SITE_STATE_KEYS).not.toContain('menuUrl')
    expect(SITE_STATE_KEYS).toContain('googleFields')
  })

  it('cover every other key the app keeps for itself', () => {
    for (const k of SYNC_INTERNAL_FIELDS) if (k !== 'googleDescription' && k !== 'menuUrl') expect(SITE_STATE_KEYS).toContain(k)
  })
})
