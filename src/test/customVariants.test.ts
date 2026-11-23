import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// A Tailwind `@custom-variant name (…)` short form is split at its commas.
// `phone (@media (max-width: 639px), (max-height: 639px))` came out as
// `.phone\:hidden (max-height: 639px) { … }`, which the dev server refused
// to parse: every page answered 500 under `npm run dev` (Nov 23), while the
// production build happened to pass. A query with a comma takes the block
// form, `@custom-variant name { @media … { @slot; } }`.
describe('globals.css custom variants', () => {
  it('no short-form @custom-variant has a comma in it', () => {
    const css = readFileSync('src/app/globals.css', 'utf8')
    const short = [...css.matchAll(/^@custom-variant\s+[\w-]+\s*\((.*)\);\s*$/gm)].map((m) => m[0])
    expect(short.filter((line) => line.includes(','))).toEqual([])
  })
})
