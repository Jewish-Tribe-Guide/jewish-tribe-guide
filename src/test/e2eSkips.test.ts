import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// A skipped test is a test that isn't running, and nothing goes red when one
// starts skipping. Every suite in CI runs on the committed seed
// (supabase/seed) since Nov 23, so what the data holds is known:
//
// - A test for one screen size is tagged @desktop or @mobile, and its project
//   leaves it out (playwright.config.ts), instead of skipping in the other.
//   A skip still counts when CI splits e2e into shards.
// - A test that needs something in the data calls `needs()` (e2e/helpers.ts):
//   on the seed a missing one fails, and only against real data
//   (e2e-prod-smoke) does it skip.
// - The write suites only ever run on the seed, so they don't skip on data.
//
// What's left is a skip that depends on the day or the build, never on the
// data, listed below with why.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..', '..')
const SUITES = ['e2e', 'e2e-admin-write', 'e2e-cache', 'e2e-form']

/** file → the reasons its skips may give. Each is the day, the build, or the
 *  browser: none is about what the data holds. */
const ALLOWED: Record<string, string[]> = {
  'e2e/helpers.ts': ['test.skip(!found, why)'], // needs() itself, off the seed
  // The day: from Friday afternoon to havdalah the phone home has its own link.
  'e2e/budgets.spec.ts': ["'the phone shows its own Minyanim link today (Friday to havdalah)'", "'no Turnstile site key at build time"],
  'e2e/offline.spec.ts': ["'service workers need Chromium'"],
  'e2e/today.spec.ts': ["'the Today home is held back (src/lib/features.ts)'"],
  'e2e/phone-map-row.spec.ts': ["'the tile needs a Maps key in the build'"],
}

type Skip = { file: string; line: number; call: string }

function skips(): Skip[] {
  const out: Skip[] = []
  for (const dir of SUITES) {
    for (const name of readdirSync(join(ROOT, dir))) {
      if (!name.endsWith('.ts')) continue
      const file = `${dir}/${name}`
      const text = readFileSync(join(ROOT, file), 'utf8')
      for (const m of text.matchAll(/\btest\.skip\(/g)) {
        // The call, to its closing parenthesis.
        let depth = 0
        let end = m.index!
        for (; end < text.length; end++) {
          if (text[end] === '(') depth++
          else if (text[end] === ')' && --depth === 0) break
        }
        out.push({ file, line: text.slice(0, m.index).split('\n').length, call: text.slice(m.index, end + 1) })
      }
    }
  }
  return out
}

/** Whether a skip's call gives one of its file's allowed reasons. */
export function allowed(skip: Pick<Skip, 'file' | 'call'>): boolean {
  return (ALLOWED[skip.file] ?? []).some((reason) => skip.call.includes(reason))
}

/** Whether a skip is about the screen size, which a tag does instead. */
export function bySize(call: string): boolean {
  return /\bisMobile\b|project\.name/.test(call)
}

describe('skipped tests', () => {
  const found = skips()

  it('finds the suites’ skips at all', () => {
    expect(found.length).toBeGreaterThan(0)
  })

  it('never skips by screen size: a test for one is tagged @desktop or @mobile', () => {
    expect(found.filter((s) => bySize(s.call)).map((s) => `${s.file}:${s.line}`)).toEqual([])
  })

  it('never skips on what the data holds: e2e calls needs(), the write suites expect it', () => {
    const unexpected = found.filter((s) => !bySize(s.call) && !allowed(s)).map((s) => `${s.file}:${s.line} ${s.call.split('\n')[0]}`)
    expect(unexpected).toEqual([])
  })

  it('knows a skip by size, and an allowed one', () => {
    expect(bySize("test.skip(({ isMobile }) => !isMobile, 'phone')")).toBe(true)
    expect(bySize("test.skip(testInfo.project.name !== 'desktop', 'x')")).toBe(true)
    expect(allowed({ file: 'e2e/offline.spec.ts', call: "test.skip(({ browserName }) => browserName !== 'chromium', 'service workers need Chromium')" })).toBe(true)
    expect(allowed({ file: 'e2e/offline.spec.ts', call: "test.skip(!found, 'no listing')" })).toBe(false)
  })
})

describe('the projects leave out the other size’s tests', () => {
  const config = readFileSync(join(ROOT, 'playwright.config.ts'), 'utf8')

  it.each([
    ['desktop', '@mobile'],
    ['mobile', '@desktop'],
  ])('%s leaves out %s', (project, tag) => {
    const line = config.split('\n').find((l) => l.includes(`name: '${project}'`))
    expect(line).toContain(`grepInvert: /${tag}/`)
  })

  it('every tag is one of the two', () => {
    const tags = new Set<string>()
    for (const dir of SUITES) {
      for (const name of readdirSync(join(ROOT, dir))) {
        if (!name.endsWith('.ts')) continue
        for (const m of readFileSync(join(ROOT, dir, name), 'utf8').matchAll(/tag: '(@[^']+)'/g)) tags.add(m[1])
      }
    }
    expect([...tags].sort()).toEqual(['@desktop', '@mobile'])
  })
})
