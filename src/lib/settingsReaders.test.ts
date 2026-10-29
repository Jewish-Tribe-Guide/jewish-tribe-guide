import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SITE_SETTINGS_DEFAULTS } from './siteSettings'

// The failure this file exists to prevent: an admin can edit a setting that
// nothing on the site reads. Nothing breaks, every other test passes, and an
// admin spends time on a field that changes nothing. The admin audit
// (docs/admin-audit.md) found a dozen of these: the tagline, the Browse,
// Davening and Map card headings, the card text colour, a form's card photo.
//
// So every setting needs a reader outside the admin and its own store. A
// reader is a property read (`.key`) or a lookup by name ('key'), in source
// with its comments stripped, so a comment naming a setting doesn't count.

const SRC = path.resolve(__dirname, '..')

/** Where a setting is edited, stored or defined, not where it's used. */
const NOT_READERS = [
  /^components\/admin\//,
  /^app\/admin\//,
  /^app\/api\/admin\//,
  /^lib\/siteSettings\.ts$/,
  /^lib\/siteSettingsStore\.ts$/,
  /^lib\/categoryStore\.ts$/,
  /^lib\/categoryTemplates\.ts$/,
  /^lib\/formStore\.ts$/,
  /^test\//,
  /^data\//,
]

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : []
  })
}

const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const readers = sourceFiles(SRC)
  .map((f) => ({ file: path.relative(SRC, f).split(path.sep).join('/'), code: stripComments(fs.readFileSync(f, 'utf8')) }))
  .filter(({ file }) => !NOT_READERS.some((re) => re.test(file)))

/** Keys on these types that aren't settings an admin chooses. */
const NOT_SETTINGS = new Set([
  'draft', // a form's unpublished copy, read back by the editor
])

function unread(keys: string[]): string[] {
  return keys.filter((k) => {
    if (NOT_SETTINGS.has(k)) return false
    const read = new RegExp(`\\.${k}\\b|['"]${k}['"]`)
    return !readers.some(({ code }) => read.test(code))
  })
}

/** The property names of an exported object type, read from its source. */
function typeKeys(file: string, type: string): string[] {
  const code = stripComments(fs.readFileSync(path.join(SRC, file), 'utf8'))
  const body = code.match(new RegExp(`export type ${type} = (?:[A-Za-z]+ & )?\\{([\\s\\S]*?)\\n\\}`))?.[1]
  if (!body) throw new Error(`${type} not found in ${file}`)
  return [...body.matchAll(/^ {2}([A-Za-z]+)\??:/gm)].map((m) => m[1])
}

describe('every admin setting has a reader on the site', () => {
  it('finds the types it checks', () => {
    // A rename that made typeKeys come back empty would pass everything below.
    expect(typeKeys('lib/categories.ts', 'CategoryConfig').length).toBeGreaterThan(20)
    expect(typeKeys('lib/categories.ts', 'CategoryField').length).toBeGreaterThan(20)
    expect(typeKeys('lib/forms.ts', 'FormContent').length).toBeGreaterThan(4)
  })

  it('site settings', () => {
    expect(unread(Object.keys(SITE_SETTINGS_DEFAULTS))).toEqual([])
  })

  it('category settings', () => {
    expect(unread(typeKeys('lib/categories.ts', 'CategoryConfig'))).toEqual([])
  })

  it('field settings', () => {
    expect(unread(typeKeys('lib/categories.ts', 'CategoryField'))).toEqual([])
  })

  it('form settings', () => {
    expect(unread([...typeKeys('lib/forms.ts', 'FormContent'), ...typeKeys('lib/forms.ts', 'FormConfig')])).toEqual([])
  })
})
