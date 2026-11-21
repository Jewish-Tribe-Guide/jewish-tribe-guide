import { readdirSync, readFileSync } from 'node:fs'
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

// Migration 111 first marked its writers with `alter function … set
// jpc.writes_site_state = 'on'`. Fine as a local superuser; Supabase's SQL
// editor refused it ("permission denied to set parameter", Nov 21), and the
// whole migration rolled back on dev and live. Writers turn it on with
// set_config around their update instead, which any role may.
const MIGRATIONS = 'supabase/migrations'

function migrationsFrom(n: number): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql') && Number(/^\d{8}(\d+)_/.exec(f)?.[1] ?? 0) >= n)
    .map((name) => ({ name, sql: readFileSync(`${MIGRATIONS}/${name}`, 'utf8').replace(/--.*$/gm, '') }))
}

describe('the site’s writers of its own keys', () => {
  it('no migration attaches a setting of our own to a function (Supabase refuses it)', () => {
    const attached = migrationsFrom(0).filter(({ sql }) => /\bset\s+jpc\.\w+\s*(=|to)/i.test(sql)).map(({ name }) => name)
    expect(attached).toEqual([])
  })

  it('from 111 on, every function’s update of a listing turns the flag on before and off after', () => {
    expect(migrationsFrom(111).map(({ name }) => name)).toContain('20240101000111_patch_resource_details.sql')
    const bare: string[] = []
    for (const { name, sql } of migrationsFrom(111)) {
      const statements = sql.split(';')
      statements.forEach((stmt, i) => {
        // An update anywhere in the statement, after a `begin` too.
        const at = stmt.search(/^\s*update\s+(public\.)?resource\b/im)
        if (at === -1) return
        const before = `${statements[i - 1] ?? ''};${stmt.slice(0, at)}`
        const on = /set_config\('jpc\.writes_site_state', 'on', true\)\s*;\s*$/.test(before)
        // `x := found` may come first: turning the flag off resets FOUND.
        const next = /^\s*\w+\s*:=\s*found\s*$/i.test(statements[i + 1] ?? '') ? statements[i + 2] : statements[i + 1]
        const off = /^\s*(perform|select)\s+set_config\('jpc\.writes_site_state', '', true\)\s*$/.test(next ?? '')
        if (!on || !off) bare.push(`${name}: ${stmt.slice(at).trim().split('\n')[0]}`)
      })
    }
    expect(bare).toEqual([])
  })
})
