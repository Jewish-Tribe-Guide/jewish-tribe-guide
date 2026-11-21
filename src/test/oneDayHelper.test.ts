import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// The date helpers were copied around (the health sweep, Nov 20): six
// addDays and sixteen "today's date on this clock", and `partDates` twice.
// They live in one place each now (src/lib/isoDay.ts, shulTimes.ts), and
// this fails on a new copy, so the next one imports instead.

const SRC = join(process.cwd(), 'src')
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })

function copies(pattern: RegExp, home: string): string[] {
  return files(SRC).flatMap((path) => {
    const file = relative(SRC, path)
    if (file === home) return []
    const text = readFileSync(path, 'utf8')
    return [...text.matchAll(new RegExp(pattern, 'g'))].map((m) => `${file}:${text.slice(0, m.index).split('\n').length}`)
  })
}

describe('one of each date and time helper', () => {
  it('adds days in isoDay.ts only', () => {
    expect(copies(/(function|const|let) addDays\b/, 'lib/isoDay.ts')).toEqual([])
  })

  it('works out a date on a clock in isoDay.ts only', () => {
    expect(copies(/['"]en-CA['"]/, 'lib/isoDay.ts')).toEqual([])
  })

  it('works out a part’s dates in shulTimes.ts only', () => {
    expect(copies(/(function|const) partDates\b/, 'lib/shulTimes.ts')).toEqual([])
  })
})
