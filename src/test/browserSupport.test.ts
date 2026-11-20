import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The site builds for Safari 16.4 and its like (Next's default targets,
// node_modules/next/dist/shared/lib/modern-browserslist-target.js). The
// build rewrites newer syntax for them but adds no newer built-ins, so one
// of those throws on an older iPhone. Map.groupBy did, and took a shul's
// listing down with it (Nov 20, the health sweep).
//
// The built-ins past Safari 16.4, each with the Safari that brought it.
// Set's union is left out: Google Maps' LatLngBounds has a union of its own.
const NEWER: [RegExp, string][] = [
  [/\bMap\.groupBy\(/, 'Map.groupBy (Safari 17.4): use groupBy from @/lib/groupBy'],
  [/\bObject\.groupBy\(/, 'Object.groupBy (Safari 17.4)'],
  [/\bPromise\.withResolvers\(/, 'Promise.withResolvers (Safari 17.4)'],
  [/\.(symmetricDifference|isSubsetOf|isSupersetOf|isDisjointFrom)\(/, 'Set methods (Safari 17)'],
  [/\bIterator\.from\(/, 'Iterator helpers (Safari 18.4)'],
  [/\.values\(\)\.(map|filter|take|drop|toArray|flatMap)\(/, 'Iterator helpers (Safari 18.4): spread into an array first'],
  [/\bRegExp\.escape\(/, 'RegExp.escape (Safari 18.2)'],
  [/\bURL\.parse\(/, 'URL.parse (Safari 18)'],
]

/** Code that runs in a browser could be any of src; the server's own
 *  (route handlers, scripts) runs on Node, but one rule for all is simpler. */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe('nothing newer than the browsers the site builds for', () => {
  it('uses no built-in past Safari 16.4', () => {
    const found = files('src').flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((line, i) => NEWER.filter(([re]) => !line.trim().startsWith('//') && !line.trim().startsWith('*') && re.test(line)).map(([, what]) => `${path}:${i + 1} ${what}`)),
    )
    expect(found).toEqual([])
  })
})
