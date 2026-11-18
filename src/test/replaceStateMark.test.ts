import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// AGENTS.md, "A screen of its own is an entry in the browser's history": a
// replaceState that changes the address without a navigation must pass
// state WITHOUT Next's `__NA` key. Next's patched replaceState treats a
// call carrying it (as `window.history.state` does) as its own and leaves
// its router on the old address, which its next commit writes back (Nov 17,
// Back from a listing's own page). replaceAddress (src/lib/replaceAddress.ts)
// does it right; this fails on any call that hands the current state, mark
// and all, to a replaceState that changes the address.

const SRC = path.join(__dirname, '..')

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return sources(p)
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : []
  })
}

// The state argument is the current state as it is, or a copy of it
// spread, and a third argument (an address) follows.
const CARRIES_MARK = /replaceState\(\s*(?:(?:window\.)?history\.state|\{\s*\.\.\.\(?\s*(?:window\.)?history\.state[^}]*\})\s*,\s*[^,)]*,\s*[^)\s]/g

// The public site's two query-string syncs: written to change the address
// with no re-render at all, which taking the mark off would give up (Next
// would move its router, and useSearchParams readers re-render). Left as
// they were by the admin review (Nov 18); see docs/where-things-stand.md.
const LEFT_AS_THEY_WERE = new Set(['components/FindResourcesConnected.tsx', 'components/map/ResourceMapView.tsx'])

describe('replaceState that changes the address', () => {
  it('never hands Next its own __NA mark', () => {
    const found = sources(SRC).filter((file) => !LEFT_AS_THEY_WERE.has(path.relative(SRC, file))).flatMap((file) => {
      const text = fs.readFileSync(file, 'utf8')
      return [...text.matchAll(CARRIES_MARK)].map((m) => `${path.relative(SRC, file)}:${text.slice(0, m.index).split('\n').length}`)
    })
    expect(found, 'use replaceAddress (src/lib/replaceAddress.ts)').toEqual([])
  })
})
