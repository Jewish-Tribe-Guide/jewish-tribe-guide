import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Every /api/admin route signs in through the wrapper (src/lib/adminRoute.ts):
// adminRead/adminWrite for a community's admin, siteAdminRead/siteAdminWrite
// for a site owner. A route that checked by hand could check the wrong
// community, or leave the public site's cache alone after a save that failed
// partway, the way categories/[id] did before the wrapper.
//
// This reads each route's source and fails on one that imports the sign-in
// checks itself, or never uses the wrapper.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '../..')
const DIR = join(ROOT, 'src/app/api/admin')

/** Routes that sign in some other way, and why. */
const OWN_SIGN_IN: Record<string, string> = {
  'src/app/api/admin/dev-login/route.ts': 'signs in, before there is a session (dev only)',
  'src/app/api/admin/request-link/route.ts': 'sends the sign-in link, before there is a session',
  'src/app/api/admin/whoami/route.ts': 'asks which kind of admin this is, both checks by design',
}

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return routes(path)
    return name === 'route.ts' ? [path] : []
  })
}

export function signsInByHand(text: string): string[] {
  const found: string[] = []
  if (/import\s*\{[^}]*\bgetAdminUser(ForCommunity)?\b[^}]*\}\s*from\s*'@\/lib\/adminAuth'/.test(text)) found.push('imports the sign-in check')
  if (!/from '@\/lib\/adminRoute'/.test(text)) found.push('never uses the wrapper')
  return found
}

describe('admin routes sign in through the wrapper', () => {
  it('finds a hand-written check', () => {
    expect(signsInByHand(`import { getAdminUserForCommunity } from '@/lib/adminAuth'\n`)).toEqual(['imports the sign-in check', 'never uses the wrapper'])
    expect(signsInByHand(`import { adminWrite } from '@/lib/adminRoute'\n`)).toEqual([])
  })

  it('every route under src/app/api/admin', () => {
    const offenders = routes(DIR)
      .map((path) => relative(ROOT, path))
      .filter((rel) => !(rel in OWN_SIGN_IN))
      .flatMap((rel) => signsInByHand(readFileSync(join(ROOT, rel), 'utf8')).map((what) => `${rel}: ${what}`))
    expect(offenders).toEqual([])
  })

  it('every exception still exists', () => {
    const all = new Set(routes(DIR).map((path) => relative(ROOT, path)))
    for (const rel of Object.keys(OWN_SIGN_IN)) expect(all.has(rel), rel).toBe(true)
  })
})
