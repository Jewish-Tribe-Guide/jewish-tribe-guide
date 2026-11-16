import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// `page.waitForFunction` never awaits its predicate.
//
// It polls the function and stops at the first truthy return value. An
// `async` predicate returns a Promise, a Promise is truthy, so the wait
// resolves on its first poll, whatever the Promise would have said. Checked
// against Playwright 1.63: `waitForFunction(async () => false)` resolves in
// ~35ms.
//
// e2e/offline.spec.ts waited for the service worker this way
// (`async () => !!(await getRegistration())?.active`), so the wait did
// nothing, and the reload that followed raced the worker's install: a reload
// sent before the worker was active loads uncontrolled, the worker then
// claims the page being unloaded, and nothing ever controls the new one. The
// test then timed out waiting 30s for a controller, one run in several under
// load (Nov 15, traced with the DevTools ServiceWorker domain). It had been
// written off as a flaky test.
//
// Await an async condition with `page.evaluate` (it does await), or poll it
// with `expect.poll`.
// ─────────────────────────────────────────────────────────────────────────────

/** Every Playwright suite's test directory, from the configs in the root. */
function testDirs(): string[] {
  return readdirSync('.')
    .filter((f) => /^playwright.*\.config\.ts$/.test(f))
    .map((file) => readFileSync(file, 'utf-8').match(/testDir:\s*'\.\/([^']+)'/)?.[1])
    .filter((d): d is string => !!d)
}

/** Each `waitForFunction(` whose first argument is an async function. */
export function asyncWaitForFunctions(src: string): number[] {
  const lines: number[] = []
  for (const m of src.matchAll(/waitForFunction\(\s*async\b/g)) {
    lines.push(src.slice(0, m.index).split('\n').length)
  }
  return lines
}

describe('no Playwright test waits on an async predicate', () => {
  it('spots one, on one line or over several', () => {
    expect(asyncWaitForFunctions('await page.waitForFunction(async () => x)')).toEqual([1])
    expect(asyncWaitForFunctions('a\nawait page.waitForFunction(\n  async () => {\n')).toEqual([2])
    expect(asyncWaitForFunctions('await page.waitForFunction(() => x)')).toEqual([])
  })

  it('finds the suites at all', () => {
    expect(testDirs()).toContain('e2e')
  })

  for (const dir of testDirs()) {
    it(`${dir}/ has none`, () => {
      const found: string[] = []
      for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
        for (const line of asyncWaitForFunctions(readFileSync(`${dir}/${file}`, 'utf-8'))) found.push(`${dir}/${file}:${line}`)
      }
      expect(found, 'waitForFunction resolves on the Promise an async predicate returns, without awaiting it').toEqual([])
    })
  }
})
