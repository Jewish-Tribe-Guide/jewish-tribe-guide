import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { SUITE_ROWS, changedByTests, type Suite } from '../../e2e/suiteRows'
import { WRITE_SUITE_COMMUNITY } from '../../scripts/writeSuiteCommunity.mjs'

/** The test project's default community: the one e2e reads, and the one an
 *  admin route falls back to when it isn't told which. */
const READ_COMMUNITY = 'philly'

vi.mock('next/cache', () => ({ cacheTag: () => {}, cacheLife: () => {} }))
const { COMMUNITY_SCOPED_TABLES } = await import('../lib/communityStore')

/** Inserts into a table that has a community, with no community named: the
 *  column's default then puts the row in philly, the community e2e reads.
 *  Seven did, the first time the write suites moved out (Nov 20), and their
 *  rows never showed in the write community's To do. */
export function insertsWithNoCommunity(text: string): number[] {
  const scoped = new Set<string>(COMMUNITY_SCOPED_TABLES)
  const lines: number[] = []
  for (const m of text.matchAll(/from\('(\w+)'\)\s*\.(?:insert|upsert)\(/g)) {
    if (!scoped.has(m[1])) continue
    let depth = 1
    let i = m.index + m[0].length
    for (; i < text.length && depth > 0; i++) {
      if ('([{'.includes(text[i])) depth++
      else if (')]}'.includes(text[i])) depth--
    }
    const body = text.slice(m.index, i)
    // Or spread from a row that names it, as place-screens' are.
    const spread = [...body.matchAll(/\.\.\.(\w+)/g)].some(([, name]) => new RegExp(`const ${name} = \\{[^}]*community_id`).test(text))
    if (!/community_id/.test(body) && !spread) lines.push(lineOf(text, m.index))
  }
  return lines
}

// ─────────────────────────────────────────────────────────────────────────────
// The suites share one test database and run at the same time, so a row one
// changes must be one no other reads. e2e/suiteRows.ts says who changes
// what; this reads every suite's source and holds them to it.
//
// It reads source text, so it sees only the shapes written below. A write
// through the admin UI (a click on Save) isn't seen. What it does see is
// how every failure so far happened: a test calling an admin route or the
// database directly on a row it didn't own, and a test taking "the first
// listing category" from the whole list (PR 389's CI, Nov 16: three runs).
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '../..')

/** Each suite's directory, and the suite it is (`e2e` claims nothing). */
const DIRS: Record<string, Suite | 'e2e'> = {
  e2e: 'e2e',
  'e2e-cache': 'cache-roundtrip',
  'e2e-form': 'form-roundtrip',
  'e2e-admin-write': 'admin-write',
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.ts$/.test(name) ? [path] : []
  })
}

const sources = Object.entries(DIRS).flatMap(([dir, suite]) =>
  files(join(ROOT, dir)).map((path) => ({ suite, file: path.slice(ROOT.length + 1), text: readFileSync(path, 'utf8') })),
)

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length

/** The community an admin route's query string names: the write suites'
 *  own by its constant (or a `community` variable holding it, as
 *  cache-roundtrip's tests do), a slug written out, or, with none, the
 *  default the route falls back to. */
function communityOf(query: string): string {
  const named = query.match(/community=(\$\{(?:WRITE_SUITE_COMMUNITY|community)\}|[\w-]+)/)?.[1]
  if (!named) return READ_COMMUNITY
  return named.startsWith('${') ? WRITE_SUITE_COMMUNITY : named
}

/** Every existing row a file changes, as `kind:id`, by the shapes the
 *  suites use. A row only its own test creates and deletes (an insert, a
 *  delete by its own id) isn't here: nothing else can be holding it. */
export function writesIn(text: string, claims: readonly string[]): { key: string; line: number }[] {
  const found: { key: string; line: number }[] = []
  const add = (key: string, index: number) => found.push({ key, line: lineOf(text, index) })
  const call = String.raw`\.(?:patch|put|post|delete)\(\s*[\`'"]`
  for (const m of text.matchAll(new RegExp(`${call}/api/admin/site-settings([^\`'"]*)`, 'g'))) add(`site_settings:${communityOf(m[1])}`, m.index)
  for (const m of text.matchAll(new RegExp(`${call}/api/admin/pages/(\\w+)`, 'g'))) add(`page:${m[1]}`, m.index)
  for (const m of text.matchAll(new RegExp(`${call}/api/admin/watches([^\`'"]*)`, 'g'))) add(`watch_job:${communityOf(m[1])}`, m.index)
  for (const m of text.matchAll(new RegExp(`${call}/api/admin/categories/([^\`'"?]+)`, 'g'))) {
    const id = m[1]
    if (!id.startsWith('${')) {
      add(`category:${id}`, m.index)
      continue
    }
    // By a variable: the claimed category this file names, or nothing.
    const named = claims.find((k) => k.startsWith('category:') && !k.endsWith('*') && text.includes(`'${k.slice('category:'.length)}'`))
    add(named ?? `category:${id}`, m.index)
  }
  for (const m of text.matchAll(/from\('page'\)\s*\.(?:update|upsert)\([^\n]*?\.eq\('slug',\s*'(\w+)'\)/g)) add(`page:${m[1]}`, m.index)
  for (const m of text.matchAll(/from\('site_settings'\)\s*\.(?:update|upsert)\(/g)) add('site_settings:philly', m.index)
  for (const m of text.matchAll(/from\('community'\)\s*\.(?:update|upsert)\(([\s\S]{0,200}?)\.eq\('slug',\s*('[\w-]+'|WRITE_SUITE_COMMUNITY)\)/g)) {
    add(`community:${m[2] === 'WRITE_SUITE_COMMUNITY' ? WRITE_SUITE_COMMUNITY : m[2].slice(1, -1)}`, m.index)
  }
  for (const m of text.matchAll(/from\('category'\)\s*\.(?:update|upsert)\(/g)) add('category:?', m.index)
  return found
}

/** Reads of the whole category list that then pick from it, unless they
 *  skip the claimed ones or narrow to a row of the test's own. */
export function unsafePicks(text: string): number[] {
  const lines = text.split('\n')
  const bad: number[] = []
  lines.forEach((line, i) => {
    if (!/from\('category'\)\s*\.select\(|\/api\/categories/.test(line)) return
    if (/^\s*(\/\/|\*)/.test(line)) return
    // The statement and the few lines that use what it read.
    const window = lines.slice(i, i + 6).join('\n')
    if (/changedByTests/.test(window)) return
    // Narrowed to one row it names: its own fixture, or one it made.
    if (/\.eq\('(id|plural_label)'|\.eq\('community_id', slug\)|\.id === /.test(window)) return
    // Read whole on purpose, never picked from. (`some` only asks whether
    // a kind exists, which no rename changes.)
    if (!/\.(find|filter|at)\(|\[0\]|for \(const/.test(window)) return
    bad.push(i + 1)
  })
  return bad
}

describe('the suites never change a row another reads', () => {
  it('no row is claimed by two suites', () => {
    const owners = new Map<string, string>()
    for (const [suite, keys] of Object.entries(SUITE_ROWS)) {
      for (const key of keys) {
        expect(owners.get(key), `${key} is claimed by ${owners.get(key)} and ${suite}`).toBeUndefined()
        owners.set(key, suite)
      }
    }
  })

  // e2e and its build start at the same moment as the write suites (Nov
  // 20), so a write to the community e2e reads is one its build may
  // prerender half-done. Rows that belong to no community (the `page` rows)
  // and category ids, which are per community, aren't named by one here.
  it('the write suites change nothing in the community e2e reads', () => {
    const theirs = [...SUITE_ROWS['cache-roundtrip'], ...SUITE_ROWS['admin-write']]
    expect(theirs.filter((k) => /^(community|site_settings|watch_job):/.test(k) && !k.endsWith(`:${WRITE_SUITE_COMMUNITY}`))).toEqual([])
  })

  it('the write suites name their community on every row they add', () => {
    const missing = sources
      .filter(({ suite }) => suite === 'cache-roundtrip' || suite === 'admin-write')
      .flatMap(({ file, text }) => insertsWithNoCommunity(text).map((line) => `${file}:${line}`))
    expect(missing, 'add community_id: WRITE_SUITE_COMMUNITY').toEqual([])
  })

  it('every row a suite changes is one it claims', () => {
    const unclaimed: string[] = []
    for (const { suite, file, text } of sources) {
      const claims: readonly string[] = suite === 'e2e' ? [] : SUITE_ROWS[suite]
      for (const { key, line } of writesIn(text, claims)) {
        const ok = claims.some((c) => c === key || (c.endsWith('*') && key.startsWith(c.slice(0, -1))))
        if (!ok) unclaimed.push(`${file}:${line} changes ${key}, which ${suite} hasn't claimed in e2e/suiteRows.ts`)
      }
    }
    expect(unclaimed).toEqual([])
  })

  it('every pick from the category list skips the claimed ones', () => {
    const unsafe = sources.flatMap(({ file, text }) => unsafePicks(text).map((line) => `${file}:${line}`))
    expect(unsafe, 'pick through changedByTests (e2e/suiteRows.ts) or categories() in e2e/helpers.ts').toEqual([])
  })

  it('categories() in e2e/helpers.ts skips them for every test that picks from it', () => {
    // Most pickers go through it, so the scan above passes them on trust.
    const helpers = readFileSync(join(ROOT, 'e2e/helpers.ts'), 'utf8')
    const body = helpers.match(/export async function categories\([\s\S]*?\n\}/)?.[0]
    expect(body).toMatch(/\.filter\(\(c\) => !changedByTests\(c\)\)/)
  })

  it('finds the writes it is meant to', () => {
    // So the scan above can't pass by seeing nothing.
    const all = sources.flatMap(({ suite, text }) => writesIn(text, suite === 'e2e' ? [] : SUITE_ROWS[suite]).map((w) => w.key))
    expect(new Set(all)).toEqual(new Set(Object.values(SUITE_ROWS).flat().filter((k) => !k.endsWith('*'))))
  })

  it('changedByTests skips claimed pages and keeps the rest', () => {
    expect(changedByTests({ id: 'cache-roundtrip-seed' })).toBe(true)
    expect(changedByTests({ id: 'e2e-review-1234' })).toBe(true)
    expect(changedByTests({ id: 'restaurant' })).toBe(false)
    expect(changedByTests({ id: 'cache-roundtrip-seed-2' })).toBe(false)
  })

  // A page a suite makes for itself is left behind when its job is
  // cancelled mid-test, and e2e then walks into it (PR 400, Nov 20:
  // `Integration Test 84ffbdbf`, no Filters, in "every category with a
  // map"). So every label a suite creates a page under is claimed.
  it('claims every page a suite creates under a label of its own', () => {
    const integration = files(join(ROOT, 'src'))
      .filter((f) => f.endsWith('.integration.test.ts'))
      .map((path) => ({ text: readFileSync(path, 'utf8') }))
    const made = [...sources, ...integration].flatMap(({ text }) =>
      [...text.matchAll(/createCategory\([^)]*?label:\s*`([^`$]+?)\s*\$\{/g)].map((m) => m[1]),
    )
    expect(made.length, 'found no createCategory labels to check').toBeGreaterThan(0)
    for (const label of made) {
      const id = `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-84ffbdbf`
      expect(changedByTests({ id }), `${label} … (${id}) is made by a suite but not claimed`).toBe(true)
    }
  })
})

describe('the scans themselves', () => {
  it('catches a row added with no community, and passes one that names it', () => {
    expect(insertsWithNoCommunity("await supabase.from('submission').insert({\n  operation: 'create',\n  payload: { name },\n})")).toEqual([1])
    expect(insertsWithNoCommunity("await supabase.from('submission').insert({ community_id: WRITE_SUITE_COMMUNITY, operation: 'create' })")).toEqual([])
    expect(insertsWithNoCommunity("const pending = { community_id: WRITE_SUITE_COMMUNITY }\nawait s.from('submission').insert([{ ...pending }])")).toEqual([])
    expect(insertsWithNoCommunity("const pending = { status: 'pending' }\nawait s.from('submission').insert([{ ...pending }])")).toEqual([2])
    expect(insertsWithNoCommunity("await supabase.from('page').update({ body })")).toEqual([])
  })

  it('catches a pick of the first listing category', () => {
    expect(unsafePicks("const body = await (await request.get('/api/categories?community=philly')).json()\nconst c = body.categories.find((c) => c.kind === 'listing')")).toEqual([1])
    expect(unsafePicks("const { data } = await supabase.from('category').select('id').eq('community_id', 'philly')\nconst first = data[0]")).toEqual([1])
  })

  it('lets through a filtered pick, an own row, and a read with no pick', () => {
    expect(unsafePicks("const c = (await get('/api/categories')).categories.find((c) => c.kind === 'listing' && !changedByTests(c))")).toEqual([])
    expect(unsafePicks("const { data } = await supabase.from('category').select('id').eq('plural_label', name).maybeSingle()")).toEqual([])
    expect(unsafePicks("const res = await request.get('/api/categories?community=philly')\nexpect(res.status()).toBe(200)")).toEqual([])
  })

  it('reads a write by the shape each suite uses', () => {
    expect(writesIn("await request.patch('/api/admin/pages/about', {", [])).toEqual([{ key: 'page:about', line: 1 }])
    expect(writesIn("await supabase.from('page').update({ body }).eq('slug', 'privacy')", [])).toEqual([{ key: 'page:privacy', line: 1 }])
    expect(writesIn("await supabase\n  .from('community')\n  .update({ admin_emails: [] })\n  .eq('slug', 'philly')", []).map((w) => w.key)).toEqual(['community:philly'])
    expect(writesIn("await supabase.from('community').update({ admin_emails: emails }).eq('slug', WRITE_SUITE_COMMUNITY)", []).map((w) => w.key)).toEqual([`community:${WRITE_SUITE_COMMUNITY}`])
    expect(writesIn("await request.patch('/api/admin/site-settings', {", []).map((w) => w.key)).toEqual(['site_settings:philly'])
    expect(writesIn('await request.patch(`/api/admin/site-settings?community=${community}`, {', []).map((w) => w.key)).toEqual([`site_settings:${WRITE_SUITE_COMMUNITY}`])
    expect(writesIn('await request.post(`/api/admin/watches?community=${WRITE_SUITE_COMMUNITY}`, {', []).map((w) => w.key)).toEqual([`watch_job:${WRITE_SUITE_COMMUNITY}`])
    expect(writesIn("const slug = 'cache-roundtrip-seed'\nawait request.patch(`/api/admin/categories/${slug}?community=philly`, {", ['category:cache-roundtrip-seed']).map((w) => w.key)).toEqual(['category:cache-roundtrip-seed'])
    expect(writesIn('await request.patch(`/api/admin/categories/${target.id}`, {', []).map((w) => w.key)).toEqual(['category:${target.id}'])
  })
})
