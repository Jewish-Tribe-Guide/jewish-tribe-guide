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

// Every redirect that lands in a community's admin console, as the path under
// src/app/admin/[community] its destination has to be a page of.
const adminRedirects = [...config.slice(config.indexOf('async redirects()')).matchAll(/destination:\s*'\/:community\/admin\/([^']*)'/g)].map((m) => m[1].split('?')[0])

/** Whether src/app/admin/[community]/<path> is a page, looking through route
 *  groups ("(site)") and optional catch-alls ("[[...id]]") as Next does. */
function isAdminPage(path: string, dir = join(process.cwd(), 'src/app/admin/[community]')): boolean {
  const [head, ...rest] = path.split('/').filter(Boolean)
  const entries = readdirSync(dir, { withFileTypes: true })
  if (!head) {
    return (
      entries.some((e) => e.name === 'page.tsx') ||
      entries.some((e) => e.isDirectory() && /^(\(.*\)|\[\[\.\.\..+\]\])$/.test(e.name) && isAdminPage('', join(dir, e.name)))
    )
  }
  return entries.some(
    (e) => e.isDirectory() && (e.name === head ? isAdminPage(rest.join('/'), join(dir, e.name)) : /^\(.*\)$/.test(e.name) && isAdminPage(path, join(dir, e.name))),
  )
}

// Every redirect out of a community's admin console, as the path it leaves.
const adminRedirectSources = [...config.slice(config.indexOf('async redirects()')).matchAll(/source:\s*'[^']*\/admin\/([^':]+)'/g)].map((m) => m[1])

describe('next.config.ts redirects and rewrites', () => {
  // /admin/site was the old Basics tab, sent to the home page; when it
  // became Site's list of screens (board 21, Oct 29) the redirect still
  // went first, and the list could never be opened.
  it('no admin redirect leaves a page that exists, which it would hide', () => {
    expect(adminRedirectSources.length).toBeGreaterThan(0)
    expect(adminRedirectSources.filter((path) => isAdminPage(path))).toEqual([])
  })

  // /admin/dishes was sent to /admin/watches/dishes, which went when the job
  // pages became the Watches tab's kinds (Oct 25), so the old link was a 404.
  it("every admin redirect lands on a page that exists", () => {
    expect(adminRedirects.length).toBeGreaterThan(0)
    expect(adminRedirects.filter((path) => !isAdminPage(path))).toEqual([])
  })


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
