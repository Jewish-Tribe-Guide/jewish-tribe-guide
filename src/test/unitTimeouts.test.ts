import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The unit suite's version of e2eTimeouts.test.ts: a wait inside a test can
// never outlast the test's own budget. vitest.setup.ts sets how long
// findBy*/waitFor wait; vitest.config.mts sets how long a test may run. On
// Nov 20 the wait went to 5s, Vitest's default test budget, and a slow CI run
// then failed at exactly 5000ms on the test's timeout (Nov 21, main).

const VITEST_DEFAULT_TEST_TIMEOUT = 5_000
const TESTING_LIBRARY_DEFAULT_WAIT = 1_000

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8')
const ms = (text: string) => Number(text.replace(/_/g, ''))

describe('unit test budgets', () => {
  it('a test may run well past the longest findBy*/waitFor wait', () => {
    const wait = read('vitest.setup.ts').match(/asyncUtilTimeout:\s*([\d_]+)/)
    const budget = read('vitest.config.mts').match(/testTimeout:\s*([\d_]+)/)
    const waitMs = wait ? ms(wait[1]) : TESTING_LIBRARY_DEFAULT_WAIT
    const budgetMs = budget ? ms(budget[1]) : VITEST_DEFAULT_TEST_TIMEOUT
    // Twice the wait: a test can wait more than once.
    expect(budgetMs, `testTimeout ${budgetMs}ms vs asyncUtilTimeout ${waitMs}ms`).toBeGreaterThanOrEqual(2 * waitMs)
  })
})
