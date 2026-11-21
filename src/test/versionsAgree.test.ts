import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// ── One Node version, and the pins Dependabot leaves alone (Nov 20) ──
// Node was declared four ways: package.json's engines (">=20.9.0", which
// lets Vercel take whatever major is newest), .nvmrc (24), CI's setup-node
// (24, written out twice) and @types/node (26). `.nvmrc` is the one now;
// the rest follow it, so production runs the Node CI tests on.
//
// And Dependabot's one group PR hadn't passed CI since September: it
// always carried the Playwright family, which is held at 1.63 (PR 402) for
// the menu reader's serverless Chromium, and CI's container tag has to
// match it, so every group failed. Dependabot leaves those alone now.

const read = (path: string) => readFileSync(path, 'utf8')
const NODE = read('.nvmrc').trim()
const pkg = JSON.parse(read('package.json'))

function yamlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name)
    if (e.isDirectory()) return yamlFiles(path)
    return /\.ya?ml$/.test(e.name) ? [path] : []
  })
}

describe('one Node version, from .nvmrc', () => {
  it('.nvmrc names a major version', () => {
    expect(NODE).toMatch(/^\d+$/)
  })

  it('package.json’s engines asks for the same major, so Vercel runs it', () => {
    expect(pkg.engines.node).toBe(`${NODE}.x`)
  })

  it('every setup-node in CI reads .nvmrc', () => {
    const uses = yamlFiles('.github').flatMap((file) => {
      const text = read(file)
      return [...text.matchAll(/uses: actions\/setup-node@\S+\n((?:\s+.*\n?){0,4})/g)].map((m) => ({ file, with: m[1] }))
    })
    expect(uses.length).toBeGreaterThan(0)
    for (const u of uses) {
      expect(u.with, `${u.file}: setup-node without node-version-file`).toMatch(/node-version-file: \.nvmrc/)
      expect(u.with, `${u.file}: a node-version written out`).not.toMatch(/node-version:/)
    }
  })

  it('@types/node is for that major', () => {
    expect(pkg.devDependencies['@types/node']).toMatch(new RegExp(`^\\^?${NODE}(\\.|$)`))
  })
})

describe('Dependabot leaves the held packages alone', () => {
  const config = read('.github/dependabot.yml')
  const npm = config.slice(config.indexOf('package-ecosystem: npm'), config.indexOf('package-ecosystem: github-actions'))

  it.each(['@playwright/test', 'playwright-core', '@sparticuz/chromium'])('%s, held with the container tag (PR 402)', (name) => {
    expect(npm).toMatch(new RegExp(`dependency-name: "${name.replace(/[/.]/g, '\\$&')}"`))
  })

  it('@types/node’s majors, which follow .nvmrc', () => {
    expect(npm).toMatch(/dependency-name: "@types\/node"\s+update-types: \["version-update:semver-major"\]/)
  })
})
