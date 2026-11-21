import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// No dialog or sheet moved the focus (the health sweep, Nov 20): Tab walked
// the page behind the backdrop. Every modal one now takes its focus from
// useDialogFocus (src/lib/useDialogFocus.ts), so a new one that doesn't is a
// dialog a keyboard can't reach.

const SRC = join(process.cwd(), 'src')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return walk(path)
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : []
  })
}

describe('every modal dialog takes the focus', () => {
  it('each element with aria-modal has a ref, and its file uses useDialogFocus', () => {
    const short = walk(SRC).flatMap((path) => {
      const text = readFileSync(path, 'utf8')
      const file = relative(SRC, path)
      return [...text.matchAll(/(?<!\[)aria-modal="true"/g)].flatMap((m) => {
        const tag = text.slice(text.lastIndexOf('<', m.index), m.index)
        const line = text.slice(0, m.index).split('\n').length
        if (!/useDialogFocus\(/.test(text)) return [`${file}:${line}: no useDialogFocus`]
        // The tag's attributes up to aria-modal, or just after it.
        const after = text.slice(m.index, text.indexOf('>', m.index))
        return /\bref=\{/.test(tag + after) ? [] : [`${file}:${line}: no ref on the dialog`]
      })
    })
    expect(short).toEqual([])
  })
})
