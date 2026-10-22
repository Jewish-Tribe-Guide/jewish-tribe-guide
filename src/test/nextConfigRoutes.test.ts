import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// The matcher Next itself compiles these sources with (it ships no types).
const { pathToRegexp } = createRequire(import.meta.url)('next/dist/compiled/path-to-regexp') as {
  pathToRegexp: (path: string, keys: unknown[], options: { strict: boolean; sensitive: boolean; delimiter: string }) => RegExp
}

// next.config.ts can't be imported here (it wraps itself in withSentryConfig),
// so its redirect and rewrite sources are read from the file (its headers
// apply to every path, the API included, on purpose).
//
// "/:community/admin/eruvim" (the old Eruvim tab, Oct 22) also matched
// /api/admin/eruvim, with "api" as the community, so the Eruv row's own data
// request was redirected to /api/admin/categories and the editor said the
// eruv table wasn't there. Every source has to leave the API alone.
const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8')
const routing = config.slice(config.indexOf('async rewrites()'))
const sources = [...routing.matchAll(/source:\s*'([^']+)'/g)].map((m) => m[1].replace(/\\\\/g, '\\'))

function apiRoutes(dir = join(process.cwd(), 'src/app/api')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return apiRoutes(path)
    if (!/^route\.tsx?$/.test(entry.name)) return []
    const route = relative(join(process.cwd(), 'src/app'), dir).split(sep).join('/')
    return [`/${route.replace(/\[+\.*([^\]]+)\]+/g, 'x')}`]
  })
}

describe('next.config.ts redirects and rewrites', () => {
  it('finds the sources and the API routes', () => {
    expect(sources).toContain('/:community((?!api\\b).*)/admin/eruvim')
    expect(apiRoutes()).toContain('/api/admin/eruvim')
  })

  it('never catch an API route', () => {
    const caught = sources.flatMap((source) => {
      const re = pathToRegexp(source, [], { strict: true, sensitive: false, delimiter: '/' })
      return apiRoutes()
        .filter((route) => re.test(route))
        .map((route) => `${source} catches ${route}`)
    })
    expect(caught).toEqual([])
  })
})
