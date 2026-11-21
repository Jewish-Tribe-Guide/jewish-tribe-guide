import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// A listing's `details` is written through patchListing (src/lib/
// listingPatch.ts), never whole, since Nov 21. A whole write wiped whatever
// was saved between its read and its write, and once migration 112 runs, a
// whole write's changes to the site's own keys (a confirmation, an item
// date, Google's record) are ignored outright: only patch_resource_details
// and the confirm / mark functions may change those. A new whole write would
// look fine in every test and quietly do nothing on live.

const SRC = join(process.cwd(), 'src')
const HELPER = 'lib/listingPatch.ts'

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return walk(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

/** Each `from('resource')` chain's text, up to the end of its statement:
 *  while the next line is indented further than the line it starts on, or
 *  goes on with `.`, `)`, `}` or `]`. */
function resourceChains(source: string): string[] {
  const lines = source.split('\n')
  const chains: string[] = []
  lines.forEach((line, i) => {
    const at = line.search(/from\(\s*['"]resource['"]\s*\)/)
    if (at === -1) return
    const base = line.search(/\S/)
    let j = i + 1
    while (j < lines.length && lines[j].trim() !== '' && (lines[j].search(/\S/) > base || /^\s*[.)}\]]/.test(lines[j]))) j++
    chains.push([line.slice(at), ...lines.slice(i + 1, j)].join('\n'))
  })
  return chains
}

/** Whether a chain's update or upsert could carry `details`: one that names
 *  it, spreads another object in, or passes a variable. A literal of other
 *  columns (`{ status: 'archived', reviewed_at: now }`) can't. */
function mayWriteDetails(chain: string): boolean {
  const call = chain.match(/\.(update|upsert)\(([\s\S]*)/)
  if (!call) return false
  const arg = call[2].trimStart()
  return !arg.startsWith('{') || /details|\.\.\./.test(arg)
}

describe('a listing’s details are changed key by key', () => {
  it('nothing in src writes a listing’s details except through patchListing', () => {
    const whole = walk(SRC)
      .map((path) => relative(SRC, path))
      .filter((file) => file !== HELPER && !file.startsWith('test/'))
      .flatMap((file) =>
        resourceChains(readFileSync(join(SRC, file), 'utf8'))
          .filter(mayWriteDetails)
          .map((chain) => `${file}: ${chain.split('\n')[0].trim()}`),
      )
    expect(whole, 'write it with patchListing (src/lib/listingPatch.ts)').toEqual([])
  })

  // Scripts too (Nov 21, after 112 ran): a script's whole write keeps
  // working for people's words, but whatever it changes among the site's
  // keys is ignored, and the script still says it did it. A script that
  // names one of those keys writes through scripts/patchListing.mjs. A write
  // that sets `state` itself (a fixture reset, sync-dev-from-prod's copy of
  // live's whole rows) keeps it, so it may write whole.
  it('no script writes the site’s keys except through patchListing.mjs', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20240101000110_resource_state.sql'), 'utf8')
    const keys = [...sql.match(/site_state_keys\(\)[\s\S]*?array\[([\s\S]*?)\]/)![1].matchAll(/'(\w+)'/g)].map((k) => k[1])
    expect(keys).toContain('googleFields')
    const SCRIPTS = join(process.cwd(), 'scripts')
    const whole = readdirSync(SCRIPTS)
      .filter((name) => /\.m?js$/.test(name) && name !== 'patchListing.mjs')
      .flatMap((name) => {
        const source = readFileSync(join(SCRIPTS, name), 'utf8')
        const named = keys.filter((key) => new RegExp(`\\b${key}\\b`).test(source))
        if (named.length === 0) return []
        return resourceChains(source)
          .filter(mayWriteDetails)
          .filter((chain) => !/\bstate\b/.test(chain) && !(name === 'sync-dev-from-prod.mjs' && /upsert\(scrubbed/.test(chain)))
          .map((chain) => `${name} (names ${named.join(', ')}): ${chain.split('\n')[0].trim()}`)
      })
    expect(whole, 'write it with scripts/patchListing.mjs').toEqual([])
  })

  // A fixture upserted over an existing row is an update, so since 112 it
  // keeps that row's confirmations and Google record unless it resets
  // `state` too: the next run starts with whatever the last one confirmed.
  it('a script’s listing upsert resets state', () => {
    const source = readFileSync(join(process.cwd(), 'scripts/run-test-project-server.mjs'), 'utf8')
    const upserts = resourceChains(source).filter((chain) => /\.upsert\(/.test(chain))
    expect(upserts.length).toBeGreaterThan(0)
    expect(upserts.filter((chain) => !/\bstate:\s*\{\}/.test(chain))).toEqual([])
  })

  it('catches one', () => {
    expect(mayWriteDetails("from('resource').update({ details }).eq('id', id)")).toBe(true)
    expect(mayWriteDetails("from('resource').update(update).eq('id', id)")).toBe(true)
    expect(mayWriteDetails("from('resource').update({ ...columns, reviewed_at: now })")).toBe(true)
    expect(mayWriteDetails("from('resource').update({ status: 'archived', reviewed_at: now })")).toBe(false)
    expect(mayWriteDetails("from('resource').select('id, details')")).toBe(false)
    expect(resourceChains("await db.from('resource').update({ details }).eq('id', id)\nconst x = 1")).toEqual(["from('resource').update({ details }).eq('id', id)"])
    expect(resourceChains("await db\n  .from('resource')\n  .update({\n    details: next,\n  })\n  .eq('id', id)\nfoo()")[0]).toMatch(/details: next/)
  })
})
