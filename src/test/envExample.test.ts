import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// ── .env.example: in the repo, every setting in it, no real value ──
// It had never been committed (`.env*` in .gitignore took it too), so the
// README's "copy .env.example" pointed at a file only this Mac had, and it
// had drifted: OPENAI_API_KEY, the server Places key and a dozen more were
// read by the code and named nowhere (the health sweep, Nov 20). The repo
// is public, so nothing real goes in it: placeholders only.

const ROOT = process.cwd()
const example = readFileSync(join(ROOT, '.env.example'), 'utf8')
// Every NAME=value line, commented-out ones too ("# NAME=value").
const settings = [...example.matchAll(/^#? ?([A-Z][A-Z0-9_]+)=(.*)$/gm)].map((m) => ({ name: m[1], value: m[2].trim() }))

// Set by the platform, CI or a test runner, or a script's own one-off flag
// (each documented in its script): not something to put in .env.local.
const NOT_SETTINGS = new Set([
  'NODE_ENV', 'NEXT_RUNTIME', 'NEXT_DIST_DIR', 'TZ', 'CI', 'GITHUB_ACTIONS', 'GITHUB_STEP_SUMMARY',
  'VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'NEXT_PUBLIC_VERCEL_ENV',
  'E2E_PREBUILT', 'E2E_SEEDED', 'CACHE_E2E_PORT', 'TEST_DB_URL', 'TEST_DB_ANON_KEY', 'TEST_DB_SERVICE_ROLE_KEY',
  'COMMUNITY', 'FORCE', 'CONFIRM_DELETE', 'CONFIRM_PRUNE_PRODUCTION', 'KEEP_PRODUCTION', 'DRY_RUN_OUT', 'SYNC_MAX_RECORDS', 'REPORT_DIR', 'READER_EFFORT', 'LEVELS', 'LIMIT',
])

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name.startsWith('.')) return []
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(m?[jt]sx?|mts)$/.test(name) ? [path] : []
  })
}

describe('.env.example', () => {
  it('is in the repo: .gitignore lets it through', () => {
    const lines = readFileSync(join(ROOT, '.gitignore'), 'utf8').split('\n').map((l) => l.trim())
    expect(lines.indexOf('!.env.example')).toBeGreaterThan(lines.indexOf('.env*'))
  })

  it('names every setting the code reads', () => {
    const read = new Set(
      ['src', 'scripts', 'e2e', 'e2e-cache', 'e2e-form', 'e2e-admin-write'].flatMap((dir) =>
        sources(join(ROOT, dir)).flatMap((path) => [...readFileSync(path, 'utf8').matchAll(/process\.env(?:\.|\[['"])([A-Z][A-Z0-9_]+)/g)].map((m) => m[1])),
      ),
    )
    for (const config of readdirSync(ROOT).filter((n) => /^(next|playwright.*)\.config\.ts$/.test(n))) {
      for (const m of readFileSync(join(ROOT, config), 'utf8').matchAll(/process\.env(?:\.|\[['"])([A-Z][A-Z0-9_]+)/g)) read.add(m[1])
    }
    const named = new Set(settings.map((s) => s.name))
    expect([...read].filter((name) => !named.has(name) && !NOT_SETTINGS.has(name)).sort()).toEqual([])
  })

  it('holds no real value: every one a placeholder', () => {
    const placeholder = (v: string) =>
      v === '' ||
      /your|x{4}|0{6}|example\.(com|org)/i.test(v) ||
      // Real, public, and the same for everyone.
      ['onboarding@resend.dev', 'https://us.posthog.com', 'on', 'off', '1'].includes(v)
    expect(settings.filter((s) => !placeholder(s.value)).map((s) => `${s.name}=${s.value}`)).toEqual([])
  })
})
