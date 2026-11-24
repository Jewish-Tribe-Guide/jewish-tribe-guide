import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// A fixed wait of seconds is a test waiting out a timer, or waiting for
// something it could wait for directly. Five of them (an 11s refresh
// throttle three times over, a 2.5s reading pause run eight times, two 6s
// waits for third-party scripts) made two of e2e's seven CI shards take
// twice as long as the rest (Nov 24).
//
// - A timer in the page (a throttle, a pause, a debounce): install
//   `page.clock` before the page loads and move it (`fastForward`,
//   `runFor`). The timer is the real one, so the test still proves it.
// - Something arriving (a response, a script): wait for it
//   (`waitForResponse`, an `expect`), or for the network to go quiet.
//
// A short settle after an event (a commit landing) is fine; seconds aren't.
// ─────────────────────────────────────────────────────────────────────────────

const LONGEST_MS = 4_000

function testDirs(): string[] {
  return readdirSync('.')
    .filter((f) => /^playwright.*\.config\.ts$/.test(f))
    .map((file) => readFileSync(file, 'utf-8').match(/testDir:\s*'\.\/([^']+)'/)?.[1])
    .filter((d): d is string => !!d)
}

/** Line and milliseconds of each `waitForTimeout(<number>)` longer than allowed. */
export function longWaits(src: string, longest = LONGEST_MS): { line: number; ms: number }[] {
  const out: { line: number; ms: number }[] = []
  for (const m of src.matchAll(/waitForTimeout\(\s*([\d_]+)\s*\)/g)) {
    const ms = Number(m[1].replace(/_/g, ''))
    if (ms > longest) out.push({ line: src.slice(0, m.index).split('\n').length, ms })
  }
  return out
}

describe('no Playwright test waits seconds out', () => {
  it('spots one, with or without separators', () => {
    expect(longWaits('await page.waitForTimeout(11_000)')).toEqual([{ line: 1, ms: 11_000 }])
    expect(longWaits('a\nawait page.waitForTimeout(6000)')).toEqual([{ line: 2, ms: 6000 }])
    expect(longWaits('await page.waitForTimeout(1_500)')).toEqual([])
  })

  it('finds the suites at all', () => {
    expect(testDirs()).toContain('e2e')
  })

  for (const dir of testDirs()) {
    it(`${dir}/ has none over ${LONGEST_MS}ms`, () => {
      const found: string[] = []
      for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
        for (const { line, ms } of longWaits(readFileSync(`${dir}/${file}`, 'utf-8'))) found.push(`${dir}/${file}:${line} (${ms}ms)`)
      }
      expect(found, 'move page.clock past a timer, or wait for the thing itself').toEqual([])
    })
  }
})
