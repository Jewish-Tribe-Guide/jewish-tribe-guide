import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// A wait inside a test can never outlast the test's own budget.
//
// Playwright defaults both to 30s, so a config that sets no `timeout` gives
// every internal wait a ceiling exactly as high as itself — and a poll or
// request asking for more than 30s silently gets less. The failure looks like
// flakiness, and reads as one, because the number in the test says otherwise.
//
// This has now happened twice:
//
//  - e2e/helpers.ts fetches content with the request default (30s) inside a
//    30s test, so a contended read on a CI runner killed the test at the exact
//    moment the request would have given up.
//  - e2e-cache's /about test polls for 60s for the revalidated page, in a
//    config with no `timeout` at all. It could never poll past 30s. The
//    comment beside it carefully justifies 60s; the ceiling was 30s the whole
//    time, and this was written off as "one run in thirty".
//
// So: every Playwright config's test budget must exceed the largest wait any
// test under it asks for. Conservative on purpose — it compares against the
// largest wait in the whole directory rather than per test, which can ask for
// a slightly higher config timeout than strictly needed but can never let a
// too-low one through.
// ─────────────────────────────────────────────────────────────────────────────

const PLAYWRIGHT_DEFAULT_TIMEOUT = 30_000

/** `expect: { timeout: N }` is a per-assertion budget, deliberately short, and
 *  not a wait a test sits through — excluded from the comparison. */
const EXPECT_TIMEOUT_RE = /expect:\s*\{\s*timeout:\s*([\d_]+)/

function num(literal: string): number {
  return Number(literal.replace(/_/g, ''))
}

/** Every Playwright config in the repo root, with its testDir. */
function configs(): Array<{ file: string; dir: string; timeout: number; expectTimeout: number }> {
  return readdirSync('.')
    .filter((f) => /^playwright.*\.config\.ts$/.test(f))
    .map((file) => {
      const src = readFileSync(file, 'utf-8')
      const dir = src.match(/testDir:\s*'\.\/([^']+)'/)?.[1]
      if (!dir) throw new Error(`${file} has no testDir — this test needs updating`)
      const explicit = src.match(/^ {2}timeout:\s*([\d_]+)/m)?.[1]
      return {
        file,
        dir,
        timeout: explicit ? num(explicit) : PLAYWRIGHT_DEFAULT_TIMEOUT,
        expectTimeout: num(src.match(EXPECT_TIMEOUT_RE)?.[1] ?? '5000'),
      }
    })
}

/** The largest `timeout: N` any source under `dir` asks to wait for, ignoring
 *  `test.setTimeout(...)` (which raises the budget rather than consuming it). */
function largestWait(dir: string): { ms: number; where: string } {
  let worst = { ms: 0, where: '(none)' }
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const src = readFileSync(`${dir}/${file}`, 'utf-8')
    for (const m of src.matchAll(/timeout:\s*([\d_]+)/g)) {
      const ms = num(m[1])
      if (ms > worst.ms) worst = { ms, where: `${dir}/${file}` }
    }
    // A bare constant feeding a request/poll option counts too — e2e/helpers.ts
    // holds its budget in API_TIMEOUT rather than inline.
    for (const m of src.matchAll(/_TIMEOUT\s*=\s*([\d_]+)/g)) {
      const ms = num(m[1])
      if (ms > worst.ms) worst = { ms, where: `${dir}/${file}` }
    }
  }
  return worst
}

describe('a test budget outlasts the waits inside it', () => {
  const all = configs()

  it('finds the Playwright configs at all', () => {
    // Without this, a rename that made configs() return [] would turn every
    // assertion below into a vacuous pass.
    expect(all.length).toBeGreaterThanOrEqual(4)
  })

  for (const { file, dir, timeout, expectTimeout } of all) {
    const worst = largestWait(dir)

    it(`${file} (${dir})`, () => {
      expect(
        timeout,
        `${file}'s test timeout is ${timeout}ms, but ${worst.where} waits up to ` +
          `${worst.ms}ms. The wait can never reach its own budget — raise the config's ` +
          '`timeout` above it, or lower the wait.',
      ).toBeGreaterThan(worst.ms)
    })

    it(`${file} keeps assertions fast`, () => {
      // The wide budget is for waits, not assertions — if expect grew to match,
      // a genuine regression would take a minute to report instead of five
      // seconds.
      expect(expectTimeout).toBeLessThanOrEqual(5_000)
    })
  }
})

describe('e2e content fetches go through one budgeted helper', () => {
  const HELPERS = readFileSync('e2e/helpers.ts', 'utf-8')

  it('calls request.get exactly once, inside apiGet', () => {
    // A helper added with a bare request.get silently opts back into the 30s
    // default and stops being covered by the ordering above.
    expect(
      [...HELPERS.matchAll(/request\.get\(/g)].length,
      'e2e/helpers.ts should call request.get once (inside apiGet); other helpers go through it.',
    ).toBe(1)
    expect(HELPERS).toMatch(/request\.get\(url,\s*\{\s*timeout:\s*API_TIMEOUT\s*\}\)/)
  })
})
