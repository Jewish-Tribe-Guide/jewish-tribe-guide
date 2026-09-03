import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Two numbers have to stay in order for the e2e suite's content fetches to be
// able to outlast a contended moment on a CI runner:
//
//   e2e/helpers.ts API_TIMEOUT  <  playwright.config.ts timeout
//
// At Playwright's defaults they are the same number (30s each), so the test
// budget expires at the exact instant the request gives up — the request's own
// timeout can never take effect, and a slow read surfaces as an opaque
// whole-test timeout rather than a named URL. That is how CI failed on
// mobile.spec.ts's hours-editor test inside categoryWithHoursField, on a URL
// warmup.setup.ts had already warmed, while 158 tests around it passed.
//
// Either number is a one-token edit, and getting them the wrong way round
// breaks nothing locally and resurfaces a load-dependent CI failure weeks
// later. Asserted from the sources so it cannot drift silently.
// ─────────────────────────────────────────────────────────────────────────────

const HELPERS = readFileSync('e2e/helpers.ts', 'utf-8')
const CONFIG = readFileSync('playwright.config.ts', 'utf-8')

function ms(literal: string | undefined, what: string): number {
  if (!literal) throw new Error(`Could not find ${what} — this test needs updating alongside the rename`)
  return Number(literal.replace(/_/g, ''))
}

/** `const API_TIMEOUT = 45_000` in e2e/helpers.ts. */
const API_TIMEOUT = ms(HELPERS.match(/API_TIMEOUT\s*=\s*([\d_]+)/)?.[1], 'API_TIMEOUT in e2e/helpers.ts')

/** Playwright's own default when a config sets no explicit `timeout`. */
const PLAYWRIGHT_DEFAULT_TIMEOUT = 30_000

/** The top-level `timeout:` in playwright.config.ts — anchored to its own line
 *  at the config's indentation, so it can't match the `timeout` nested inside
 *  `expect: { … }` (which is a different budget, asserted separately below).
 *
 *  Falls back to Playwright's default rather than throwing: deleting the line
 *  is the most likely way to break this, and "no explicit timeout" genuinely
 *  MEANS 30s. Modelling it that way makes that edit fail as a plain assertion
 *  naming both numbers, instead of as a collection error. */
const TEST_TIMEOUT = CONFIG.match(/^ {2}timeout:\s*([\d_]+)/m)
  ? ms(CONFIG.match(/^ {2}timeout:\s*([\d_]+)/m)![1], 'the top-level timeout')
  : PLAYWRIGHT_DEFAULT_TIMEOUT

/** The `expect: { timeout: … }` budget. */
const EXPECT_TIMEOUT = ms(
  CONFIG.match(/expect:\s*\{\s*timeout:\s*([\d_]+)/)?.[1],
  'the expect timeout in playwright.config.ts',
)

describe('e2e content fetches can outlast a contended CI runner', () => {
  it('gives the test budget more room than the API budget', () => {
    expect(
      TEST_TIMEOUT,
      `playwright.config.ts timeout (${TEST_TIMEOUT}ms) must exceed e2e/helpers.ts ` +
        `API_TIMEOUT (${API_TIMEOUT}ms), or a slow content read kills the test before its own ` +
        'timeout can report which URL hung.',
    ).toBeGreaterThan(API_TIMEOUT)
  })

  it('routes every helper content fetch through the budgeted apiGet', () => {
    // One permitted `request.get` — the one inside apiGet itself, which is the
    // only place the timeout is applied. A helper added with a bare
    // `request.get` silently opts back into the 30s default.
    const bare = [...HELPERS.matchAll(/request\.get\(/g)]
    expect(
      bare.length,
      'e2e/helpers.ts should call request.get exactly once (inside apiGet); ' +
        'other helpers must go through apiGet so they get the explicit timeout.',
    ).toBe(1)
    expect(HELPERS).toMatch(/request\.get\(url,\s*\{\s*timeout:\s*API_TIMEOUT\s*\}\)/)
  })

  it('keeps assertions fast, so a real regression still fails quickly', () => {
    // The wider test budget is for the network, not for assertions — if this
    // ever grew to match, a genuine regression would take a minute to report.
    expect(EXPECT_TIMEOUT).toBeLessThanOrEqual(5_000)
    expect(EXPECT_TIMEOUT).toBeLessThan(TEST_TIMEOUT)
  })
})
