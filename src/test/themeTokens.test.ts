import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Every colour class names a colour that exists.
//
// Tailwind doesn't complain about a class it can't resolve: `text-brand-teal`
// with no --color-brand-teal simply produces no CSS, and the link renders in
// whatever colour it inherits. So retiring a colour from globals.css (the
// redesign's one look took out the desktop's teal, cream, sage and amber
// accent) passes tsc, lint, the build and every other test while quietly
// uncolouring whatever still used it. This reads the source instead: each
// colour-ish class must be a stock Tailwind palette colour or a --color-*
// defined in globals.css's @theme.

const THEME = readFileSync('src/app/globals.css', 'utf-8')
const DEFINED = new Set([...THEME.matchAll(/--color-([a-z-]+):/g)].map((m) => m[1]))

const PALETTE = new Set(
  'slate gray zinc neutral stone red orange amber yellow lime green emerald teal cyan sky blue indigo violet purple fuchsia pink rose white black transparent current inherit'.split(' '),
)

// Words after these prefixes that aren't colours: sides, sizes, styles, and
// the odd identifier or prose word the scan catches ("divide-by-near-zero").
// A new non-colour utility belongs here; a new colour belongs in globals.css.
const NOT_COLOURS = new Set([
  'b', 't', 'l', 'r', 'x', 'y', 'dashed', 'solid', 'none', 'offset', 'radius',
  'balance', 'base', 'center', 'left', 'right', 'lg', 'sm', 'xl', 'xs', 'align',
  'color', 'color-escalation', 'filter', 'glyph', 'shadow', 'string', 'to-border',
  'by-near-zero', 'based', 'linecap', 'linejoin', 'only', 'width', 'do',
  // Inline CSS properties in the email templates (lib/email.ts).
  'decoration', 'collapse', 'bottom',
])

const COLOUR_CLASS = /(?<![\w-])(?:[a-z-]+:)*(?:text|bg|border|ring|from|to|via|divide|outline)-([a-z]+(?:-[a-z]+)*)/g

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe('colour classes', () => {
  it('only name colours that exist', () => {
    const unknown: string[] = []
    for (const file of sourceFiles('src')) {
      for (const m of readFileSync(file, 'utf-8').matchAll(COLOUR_CLASS)) {
        const name = m[1]
        if (name.startsWith('gradient-') || NOT_COLOURS.has(name)) continue
        if (PALETTE.has(name.split('-')[0]) || DEFINED.has(name)) continue
        unknown.push(`${file}: ${m[0]}`)
      }
    }
    expect(unknown, 'no --color-* in globals.css for these, so they render uncoloured').toEqual([])
  })

  it('reads the theme it checks against', () => {
    // A guard on the guard: if the @theme block moved or its syntax changed,
    // DEFINED would be empty and every custom colour would be reported.
    expect([...DEFINED]).toEqual(expect.arrayContaining(['primary', 'primary-dark', 'ink', 'gold', 'gold-dark', 'caution', 'surface', 'muted']))
  })
})
