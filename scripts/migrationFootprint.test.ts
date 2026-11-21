import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { footprint, probes } from './migrationFootprint.mjs'

describe('footprint: what a migration makes, to look for later', () => {
  it('the tables it creates and the columns it adds, comments aside', () => {
    const sql = `
      -- create table not_this (id int);
      create table if not exists public.watch (id uuid primary key);
      /* alter table resource add column nor_this text; */
      alter table resource add column if not exists travel jsonb, add column "Notes" text;
      alter table category add constraint category_kind check (kind in ('a'));
      alter table if exists only public.vote add votes int;
    `
    const f = footprint(sql)
    expect(f.tables).toEqual(['watch'])
    expect(f.columns).toEqual(['resource.travel', 'resource.notes', 'vote.votes'])
  })

  it('what it drops or renames away', () => {
    const f = footprint(`
      alter table resource drop column if exists travel;
      alter table resource rename column hospital_id to anchor_id;
      alter table old_name rename to new_name;
      drop table if exists a, public.b cascade;
      alter table resource alter column name drop default;
    `)
    expect(f.gone).toEqual(['resource.travel', 'resource.hospital_id', 'old_name', 'a', 'b'])
    expect(f.columns).toEqual(['resource.anchor_id'])
    expect(f.tables).toEqual(['new_name'])
  })
})

describe('probes: what tells each migration ran', () => {
  it('leaves out what a later migration took away', () => {
    const p = probes([
      { name: '1', sql: 'create table t (id int); alter table resource add column travel jsonb; alter table resource add column hospital_id text;' },
      { name: '2', sql: 'alter table resource drop column travel; alter table resource rename column hospital_id to anchor_id;' },
      { name: '3', sql: 'drop table t;' },
    ])
    expect(p).toEqual([
      { name: '1', tables: [], columns: [] },
      { name: '2', tables: [], columns: ['resource.anchor_id'] },
      { name: '3', tables: [], columns: [] },
    ])
  })

  // The real folder, so a migration written some new way doesn't quietly
  // leave the report with nothing to look for.
  it('finds something to look for in most of the real migrations', () => {
    const dir = join(__dirname, '..', 'supabase', 'migrations')
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    const p: { name: string; tables: string[]; columns: string[] }[] = probes(files.map((f) => ({ name: f, sql: readFileSync(join(dir, f), 'utf8') })))
    const withProbes = p.filter((m) => m.tables.length || m.columns.length)
    expect(withProbes.length / p.length).toBeGreaterThan(0.6)
    expect(p.find((m) => m.name.endsWith('_watch.sql'))?.tables).toContain('watch')
  })
})
