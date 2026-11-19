import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Every admin screen calls /api/admin/* through `adminApi` (src/lib/adminApi.ts,
// or `useAdminApi` around it), which adds the admin's token and the
// community. A call written by hand can forget the community, and the route
// then answers for the config community: that is how the category preview
// showed Philly's places in every other community (d334c89b).
//
// This reads the source under src/components/admin and fails on a file that
// builds the request itself: the Authorization header, the community query,
// or a raw fetch of an /api/admin path. It reads text, so it sees only those
// shapes; they are every shape the screens used before the hook.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '../..')
const DIR = join(ROOT, 'src/components/admin')

/** Files allowed to build a request by hand, and why. */
const ALLOWED: Record<string, string> = {
  // Asks whether this session may be here at all (whoami) and signs in
  // (dev-login), before there is an admin session for the api to carry.
  'src/components/admin/AdminAuthGate.tsx': 'signs in',
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length

/** Each place a source builds an admin request by hand. */
export function handBuiltCalls(text: string): { what: string; line: number }[] {
  const found: { what: string; line: number }[] = []
  const shapes: [string, RegExp][] = [
    ['an Authorization header', /Authorization\s*:/g],
    // A public route (`/api/categories`) is the site's own read and takes
    // withCommunity as the public screens do; anything else is suspect.
    ['withCommunity()', /\bwithCommunity\s*\((?!\s*[`'"]\/api\/(?!admin))/g],
    ['a community= query', /[?&]community=/g],
    ['a fetch of /api/admin', /(?<![.\w])(?:fetch|fetchJson)\s*(?:<[^>]*>)?\(\s*[`'"]\/api\/admin/g],
  ]
  for (const [what, re] of shapes) for (const m of text.matchAll(re)) found.push({ what, line: lineOf(text, m.index) })
  return found
}

describe('admin screens call /api/admin through adminApi', () => {
  it('no file under src/components/admin builds the request itself', () => {
    const offenders = files(DIR)
      .map((path) => ({ file: path.slice(ROOT.length + 1), text: readFileSync(path, 'utf8') }))
      .filter(({ file }) => !(file in ALLOWED))
      .flatMap(({ file, text }) => handBuiltCalls(text).map((c) => `${file}:${c.line} ${c.what}`))
    expect(offenders).toEqual([])
  })

  it('sees each shape it is meant to', () => {
    expect(handBuiltCalls("fetch(url, { headers: { Authorization: `Bearer ${token}` } })")).toHaveLength(1)
    expect(handBuiltCalls("fetchJson(withCommunity('/api/admin/x', community), {}, '')")).toHaveLength(1)
    expect(handBuiltCalls("fetch(`/api/admin/x?community=${c}`)")).toHaveLength(2)
    expect(handBuiltCalls("fetchJson(withCommunity(path, community), init, '')")).toHaveLength(1)
    expect(handBuiltCalls("fetch(withCommunity('/api/categories', community))")).toEqual([])
    expect(handBuiltCalls("fetchJson<{ a: 1 }>('/api/admin/pages', init, '')")).toHaveLength(1)
    expect(handBuiltCalls("api.post('/api/admin/watches', { action: 'check' })")).toEqual([])
    expect(handBuiltCalls("api.fetch('/api/admin/forms')")).toEqual([])
  })
})
