import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Nov 18, review item 40: Sentry's browser SDK was ~74 KB gzipped of every
// page's first download, because the client files that report errors
// imported it directly. It now loads after the page, through
// src/lib/deferredSentry.ts. Any value import of '@sentry/nextjs' from code
// that runs in the browser puts it straight back, and nothing else would
// notice: the e2e budget runs with Sentry gated off.

const root = join(process.cwd(), 'src')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

/** Code that runs in the browser: 'use client' modules and the client
 *  instrumentation file, plus the lib modules they lean on for reporting. */
function runsInBrowser(path: string, source: string): boolean {
  if (relative(root, path) === 'instrumentation-client.ts') return true
  if (relative(root, path) === join('lib', 'deferredSentry.ts')) return true
  return /^\s*['"]use client['"]/m.test(source)
}

/** An import that brings the SDK's code with it: anything but `import type`. */
const VALUE_IMPORT = /^\s*import\s+(?!type\b)[^;]*from\s+['"]@sentry\/nextjs['"]/m

describe('Sentry stays out of the first download', () => {
  it('no browser code imports @sentry/nextjs directly', () => {
    const offenders = files(root)
      .map((path) => ({ path, source: readFileSync(path, 'utf8') }))
      .filter(({ path, source }) => runsInBrowser(path, source) && VALUE_IMPORT.test(source))
      .map(({ path }) => relative(root, path))
    expect(offenders).toEqual([])
  })

  it('still sees the import it guards against', () => {
    expect(VALUE_IMPORT.test("import * as Sentry from '@sentry/nextjs'")).toBe(true)
    expect(VALUE_IMPORT.test("import { captureException } from '@sentry/nextjs'")).toBe(true)
    expect(VALUE_IMPORT.test("import type * as S from '@sentry/nextjs'")).toBe(false)
  })
})
