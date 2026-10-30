import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ cacheTag: () => {}, cacheLife: () => {} }))

const { COMMUNITY_SCOPED_TABLES } = await import('./communityStore')

// deleteCommunity sweeps COMMUNITY_SCOPED_TABLES by hand, since nothing
// cascades from `community`. Twelve tables were added after the list was
// written and none of them were on it, so a deleted community left its
// watches running and its subscribers' emails behind. This reads every
// migration and fails if a table with a `community_id` column is missing.

const MIGRATIONS = join(process.cwd(), 'supabase/migrations')

function tablesWithCommunityId(): Set<string> {
  const found = new Set<string>()
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8').replace(/--.*$/gm, '')
    // create table [if not exists] [public.]name ( … community_id … );
    for (const m of sql.matchAll(/create table\s+(?:if not exists\s+)?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
      if (/^\s*community_id\s/m.test(m[2]!)) found.add(m[1]!)
    }
    // alter table [public.]name add column [if not exists] community_id
    for (const m of sql.matchAll(/alter table\s+(?:only\s+)?(?:public\.)?(\w+)\s+add column\s+(?:if not exists\s+)?community_id\b/gi)) {
      found.add(m[1]!)
    }
    // 027's loop: foreach t in array array['resource', …] … add column … community_id
    for (const m of sql.matchAll(/foreach\s+\w+\s+in\s+array\s+array\[([^\]]*)\]([\s\S]*?)end loop/gi)) {
      if (/add column[^;]*community_id/i.test(m[2]!)) {
        for (const t of m[1]!.matchAll(/'(\w+)'/g)) found.add(t[1]!)
      }
    }
  }
  return found
}

describe('COMMUNITY_SCOPED_TABLES', () => {
  it('finds the tables it should, so the check below means something', () => {
    const found = tablesWithCommunityId()
    // One from each way a migration adds the column.
    expect(found).toContain('resource') // 027's loop
    expect(found).toContain('watch') // create table
    expect(found).toContain('newsletter_setup') // create table, community_id as the primary key
  })

  it('lists every table that has a community_id column, so deleting a community clears them all', () => {
    const missing = [...tablesWithCommunityId()].filter((t) => !(COMMUNITY_SCOPED_TABLES as readonly string[]).includes(t))
    expect(missing).toEqual([])
  })

  it('lists nothing twice', () => {
    expect(new Set(COMMUNITY_SCOPED_TABLES).size).toBe(COMMUNITY_SCOPED_TABLES.length)
  })
})
