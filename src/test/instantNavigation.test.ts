import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Next checks, in development only, whether a navigation to each screen can
// show it at once, and reports "URL data outside of <Suspense>" for one that
// reads its address first (Nov 26: every community screen did). A community
// screen waits for the server on purpose (see `instant` in
// [community]/layout.tsx), so each says so with `instant = false`. About is
// the exception: its text is the same for every community, so only its
// count reads the address, inside a boundary of its own, and a navigation to
// it is instant. Nothing else notices if a screen loses either: the check is
// a dev console error, and the build passes.

const root = path.resolve(__dirname, '../..')
const community = path.join(root, 'src/app/[community]')
const rel = (file: string) => path.relative(root, file)

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return pages(full)
    return name === 'page.tsx' ? [full] : []
  })
}

/** Screens a navigation shows at once: they declare no `instant = false`,
 *  and read the address only inside a Suspense boundary. */
const INSTANT = ['src/app/[community]/about/page.tsx']

const WAITS = /^export const instant = false$/m

/** The default export's own body, up to the next top-level declaration. */
function defaultExport(source: string): string {
  const at = source.indexOf('export default')
  const rest = source.slice(at)
  const end = rest.slice(1).search(/^(export |async function |function |const )/m)
  return end < 0 ? rest : rest.slice(0, end + 1)
}

describe('instant navigation in a community', () => {
  it('the community layout says its screens wait for the server', () => {
    expect(readFileSync(path.join(community, 'layout.tsx'), 'utf8')).toMatch(WAITS)
  })

  it.each(pages(community).map(rel).filter((f) => !INSTANT.includes(f)))('%s says it waits', (file) => {
    expect(readFileSync(path.join(root, file), 'utf8')).toMatch(WAITS)
  })

  it.each(INSTANT)('%s reads its address only inside a boundary', (file) => {
    const source = readFileSync(path.join(root, file), 'utf8')
    expect(source).not.toMatch(WAITS)
    const page = defaultExport(source)
    expect(page).not.toMatch(/await\s+(props\.)?params/)
    expect(page).toMatch(/<Suspense\b/)
  })

  it('finds the screens it checks', () => {
    expect(pages(community).length).toBeGreaterThan(10)
    for (const file of INSTANT) expect(pages(community).map(rel)).toContain(file)
  })
})
