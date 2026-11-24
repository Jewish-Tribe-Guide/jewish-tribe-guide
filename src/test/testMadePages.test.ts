import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { madeByTests } from '../../e2e/testMadePages'

// ─────────────────────────────────────────────────────────────────────────────
// A test that picks "a listing category" never picks a page a test made
// (e2e/testMadePages.ts): one beside it in the same run may be renaming or
// deleting it. Reads every suite's source.
//
// It reads source text, so it sees only the shapes written below. Every
// failure of this kind so far was a test taking "the first listing
// category" from the whole list (PR 389's CI, Nov 16: three runs).
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '../..')

/** Each suite's directory, and the suite it is. */
const DIRS: Record<string, string> = {
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

/** Reads of the whole category list that then pick from it, unless they
 *  skip the pages tests made or narrow to a row of the test's own. */
export function unsafePicks(text: string): number[] {
  const lines = text.split('\n')
  const bad: number[] = []
  lines.forEach((line, i) => {
    if (!/from\('category'\)\s*\.select\(|\/api\/categories/.test(line)) return
    if (/^\s*(\/\/|\*)/.test(line)) return
    // The statement and the few lines that use what it read.
    const window = lines.slice(i, i + 6).join('\n')
    if (/madeByTests/.test(window)) return
    // Narrowed to one row it names: its own fixture, or one it made.
    if (/\.eq\('(id|plural_label)'|\.eq\('community_id', slug\)|\.id === /.test(window)) return
    // Read whole on purpose, never picked from. (`some` only asks whether
    // a kind exists, which no rename changes.)
    if (!/\.(find|filter|at)\(|\[0\]|for \(const/.test(window)) return
    bad.push(i + 1)
  })
  return bad
}

describe('a test never picks a page a test made', () => {
  it('every pick from the category list skips them', () => {
    const unsafe = sources.flatMap(({ file, text }) => unsafePicks(text).map((line) => `${file}:${line}`))
    expect(unsafe, 'pick through madeByTests (e2e/testMadePages.ts) or categories() in e2e/helpers.ts').toEqual([])
  })

  it('categories() in e2e/helpers.ts skips them for every test that picks from it', () => {
    // Most pickers go through it, so the scan above passes them on trust.
    const helpers = readFileSync(join(ROOT, 'e2e/helpers.ts'), 'utf8')
    const body = helpers.match(/export async function categories\([\s\S]*?\n\}/)?.[0]
    expect(body).toMatch(/\.filter\(\(c\) => !madeByTests\(c\)\)/)
  })

  it('madeByTests skips test-made pages and keeps the rest', () => {
    expect(madeByTests({ id: 'cache-roundtrip-seed' })).toBe(true)
    expect(madeByTests({ id: 'e2e-review-1234' })).toBe(true)
    expect(madeByTests({ id: 'restaurant' })).toBe(false)
    expect(madeByTests({ id: 'cache-roundtrip-seed-2' })).toBe(false)
  })

  // Every label a suite creates a page under is listed, so the pick above
  // skips it, including one a cancelled run left behind (PR 400, Nov 20:
  // `Integration Test 84ffbdbf`, no Filters, in "every category with a map").
  it('lists every page a suite creates under a label of its own', () => {
    const integration = files(join(ROOT, 'src'))
      .filter((f) => f.endsWith('.integration.test.ts'))
      .map((path) => ({ text: readFileSync(path, 'utf8') }))
    const made = [...sources, ...integration].flatMap(({ text }) =>
      [...text.matchAll(/createCategory\([^)]*?label:\s*`([^`$]+?)\s*\$\{/g)].map((m) => m[1]),
    )
    expect(made.length, 'found no createCategory labels to check').toBeGreaterThan(0)
    for (const label of made) {
      const id = `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-84ffbdbf`
      expect(madeByTests({ id }), `${label} … (${id}) is made by a suite but not in TEST_MADE_PAGES`).toBe(true)
    }
  })
})

describe('the scans themselves', () => {
  it('catches a pick of the first listing category', () => {
    expect(unsafePicks("const body = await (await request.get('/api/categories?community=philly')).json()\nconst c = body.categories.find((c) => c.kind === 'listing')")).toEqual([1])
    expect(unsafePicks("const { data } = await supabase.from('category').select('id').eq('community_id', 'philly')\nconst first = data[0]")).toEqual([1])
  })

  it('lets through a filtered pick, an own row, and a read with no pick', () => {
    expect(unsafePicks("const c = (await get('/api/categories')).categories.find((c) => c.kind === 'listing' && !madeByTests(c))")).toEqual([])
    expect(unsafePicks("const { data } = await supabase.from('category').select('id').eq('plural_label', name).maybeSingle()")).toEqual([])
    expect(unsafePicks("const res = await request.get('/api/categories?community=philly')\nexpect(res.status()).toBe(200)")).toEqual([])
  })
})
