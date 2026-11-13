import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The user, Nov 11: "when I click on a category card I see the background
// picture come flying in". The home tile and the category page's photo
// shared a <ViewTransition> name, so the browser grew the small tile into
// the full-width band. A category page now just appears, as every other
// page does. The motion itself can't be checked in jsdom (no view
// transitions), so this pins the wiring: no shared name on either side.
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('opening a category from the home', () => {
  it.each([
    'src/components/home/sections.tsx',
    'src/components/resources/CategoryBandFrame.tsx',
    'src/components/resources/GenericDirectory.tsx',
  ])('%s gives the tile or the photo no shared transition name', (file) => {
    const src = read(file)
    expect(src).not.toMatch(/<ViewTransition\s+name=/)
    expect(src).not.toMatch(/transitionName=\{`category-/)
  })
})
