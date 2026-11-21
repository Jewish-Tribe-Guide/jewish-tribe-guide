import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Text sizes are in rem, never px (Nov 21, the health sweep): a reader who
// sets their browser's text larger gets larger text. A px size ignores the
// setting. At the default (16px) each rem size is the px it replaced, so
// nothing moved. Emails keep px in their inline styles: mail clients are
// another matter.

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__fixtures__' ? [] : sources(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

describe('text sizes', () => {
  it('are never given in px in a class', () => {
    const found = sources('src').flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((line, i) => (/text-\[[0-9.]+px\]/.test(line) ? [`${path}:${i + 1}`] : [])),
    )
    expect(found).toEqual([])
  })
})
