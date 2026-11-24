import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// A Playwright suite that takes the `page` fixture needs a real browser
// binary; one that only takes `request` does not. CI encodes that distinction
// by running the browser-driving jobs inside Playwright's Docker image
// (browsers preinstalled) and the rest on a bare runner — deliberately, since
// `npx playwright install --with-deps` on a bare runner is what used to hang
// for an hour in apt-get (see .github/workflows/ci.yml's own header).
//
// The distinction is invisible until it breaks, and it did: e2e-cache/ was
// request-only when its job was written, then gained "an already-open tab
// picks up an admin edit when it regains focus", which takes `page`. CI kept
// running it on a bare runner and failed with "Executable doesn't exist …
// run npx playwright install" — while the three request-only tests beside it
// passed, so 3-passed/1-failed was the only signal.
//
// Derived from the actual spec sources rather than a hand-kept list, the same
// way cacheTags.test.ts derives its expectations from TAGS: adding a `page`
// test to a bare-runner suite fails here instead of in CI a week later.
// ─────────────────────────────────────────────────────────────────────────────

const WORKFLOW = readFileSync('.github/workflows/ci.yml', 'utf-8')
const SCRIPTS = JSON.parse(readFileSync('package.json', 'utf-8')).scripts as Record<string, string>

/** testDir for a `test:*` script, read through its Playwright config. */
function testDirFor(script: string): string | null {
  const cmd = SCRIPTS[script]
  if (!cmd?.startsWith('playwright test')) return null
  const configMatch = cmd.match(/--config\s+(\S+)/)
  const config = configMatch ? configMatch[1] : 'playwright.config.ts'
  const dir = readFileSync(config, 'utf-8').match(/testDir:\s*'\.\/([^']+)'/)
  return dir ? dir[1] : null
}

/** True when any spec in `dir` destructures Playwright's `page` fixture. */
function usesBrowser(dir: string): boolean {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .some((f) => {
      const src = readFileSync(`${dir}/${f}`, 'utf-8')
      // `async ({ page })`, `async ({ page, request })`, `async ({ request, page })`.
      return /async\s*\(\s*\{[^}]*\bpage\b[^}]*\}/.test(src)
    })
}

/** Every job that runs a `test:*` script, with the script and whether the job
 *  declares a container image. Jobs are top-level 2-space keys under `jobs:`. */
function jobsRunningPlaywright(): Array<{ job: string; script: string; hasContainer: boolean }> {
  const body = WORKFLOW.slice(WORKFLOW.indexOf('\njobs:'))
  const blocks = body.split(/\n {2}(?=[a-z][\w-]*:\n)/).slice(1)
  const out: Array<{ job: string; script: string; hasContainer: boolean }> = []
  for (const block of blocks) {
    const job = block.match(/^([\w-]+):/)![1]
    for (const m of block.matchAll(/npm run (test:[\w-]+)/g)) {
      if (testDirFor(m[1])) {
        out.push({ job, script: m[1], hasContainer: /\n\s*container:\s*\S/.test(block) || /docker run[\s\S]*?mcr\.microsoft\.com\/playwright:v/.test(block) })
      }
    }
  }
  return out
}

describe('CI runs every browser-driving suite where a browser exists', () => {
  const jobs = jobsRunningPlaywright()

  it('finds the Playwright jobs in the workflow at all', () => {
    // Guards the parsing itself: a rename that made this return [] would
    // otherwise turn every assertion below into a vacuous pass.
    expect(jobs.length).toBeGreaterThanOrEqual(4)
  })

  for (const { job, script, hasContainer } of jobs) {
    const dir = testDirFor(script)!
    it(`${job} (${dir})`, () => {
      if (usesBrowser(dir)) {
        expect(
          hasContainer,
          `${dir} has a test taking the \`page\` fixture, so job "${job}" needs the ` +
            `Playwright container image (as the job's container, or run with \`docker run … mcr.microsoft.com/playwright:v…\`) — ` +
            `without it CI fails with "Executable doesn't exist".`,
        ).toBe(true)
      } else {
        expect(hasContainer, `${dir} needs no browser; "${job}" can stay on a bare runner`).toBe(false)
      }
    })
  }
})

describe('the Playwright container tag tracks the installed version', () => {
  it('matches @playwright/test in package.json', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
    const version = (pkg.devDependencies['@playwright/test'] as string).replace(/^[^\d]*/, '')
    const tags = [...WORKFLOW.matchAll(/mcr\.microsoft\.com\/playwright:v([\d.]+)-/g)].map((m) => m[1])
    expect(tags.length).toBeGreaterThan(0)
    for (const tag of tags) {
      expect(tag, `container image v${tag} but @playwright/test is ${version}`).toBe(version)
    }
  })
})

// A PR's wait is its slowest path, which was ~20 minutes: everything queued
// behind lint/typecheck/unit (~4.5 min), then e2e ran for ~10 minutes on one
// worker (the user, Oct 19: "PRs are taking a really long time"). Guarded so
// a later edit putting `needs: unit` back, or folding e2e onto one runner
// again, fails here rather than as a slow PR nobody connects to the change.
describe('a PR’s checks start at once and e2e is split', () => {
  function job(name: string): string {
    const body = WORKFLOW.slice(WORKFLOW.indexOf('\njobs:'))
    const block = body.split(/\n {2}(?=[a-z][\w-]*:\n)/).find((b) => b.startsWith(`${name}:`))
    expect(block, `no job "${name}" in ci.yml`).toBeDefined()
    return block!
  }
  const needs = (name: string) => job(name).match(/\n {4}needs:\s*(.+)/)?.[1] ?? ''

  for (const name of ['integration', 'cache-roundtrip', 'form-roundtrip', 'admin-write', 'e2e']) {
    it(`${name} doesn’t wait for the unit tests`, () => {
      expect(needs(name)).not.toMatch(/\bunit\b/)
    })
  }

  // The write suites change a community of their own (scripts/
  // writeSuiteCommunity.mjs), so e2e's build has nothing to wait for. A
  // `needs` back on them is the ~4 minutes this took off every PR (Nov 20).
  it('e2e’s build starts at once, beside the write suites', () => {
    expect(needs('e2e-build')).toBe('')
  })

  // A route that swallows Next's prerender stop still builds, so nothing
  // else fails on it (scripts/buildLog.mjs, Nov 20).
  it('e2e’s build fails on a prerender stop our code caught', () => {
    const build = job('e2e-build')
    expect(build).toMatch(/npm run build 2>&1 \| tee build\.log\n\s+shell: bash/)
    expect(build).toContain('node scripts/buildLog.mjs build.log')
  })

  it('e2e runs as shards, each running its own share', () => {
    const e2e = job('e2e')
    const shards = e2e.match(/shard:\s*\[([^\]]+)\]/)?.[1].split(',').map((s) => s.trim()) ?? []
    expect(shards.length).toBeGreaterThan(1)
    expect(e2e).toMatch(new RegExp(`--shard=\\$\\{\\{ matrix\\.shard \\}\\}/${shards.length}\\b`))
  })
})

// Every job that uses the test project (any `secrets.TEST_SUPABASE_*`) shares
// one database with every other run of the same job, on any branch. Two copies
// of one suite at once rename the same fixture and mint the same admin's
// magic link — PR 400's admin-write failed beside main's that way (Nov 19).
// Row claims (e2e/suiteRows.ts) only separate different suites. So each such
// job queues repo-wide, and none runs on push to main, whose tree its PR
// already tested (main requires up-to-date branches). Derived from the
// secrets, so a new suite against the test project is held to it too.
describe('test-project suites never run two copies at once', () => {
  // Top-level job blocks, as the suites above split them.
  const body = WORKFLOW.slice(WORKFLOW.indexOf('\njobs:'))
  const jobs = Object.fromEntries(
    body
      .split(/\n {2}(?=[a-z][\w-]*:\n)/)
      .slice(1)
      .map((b) => [b.match(/^([\w-]+):/)![1], b] as const),
  )
  // A job with a database of its own (.github/actions/own-test-database)
  // starts from supabase/seed and never touches the test project.
  const ownDatabase = (n: string) => jobs[n].includes('uses: ./.github/actions/own-test-database')
  const usesTestProject = Object.keys(jobs).filter((n) => /secrets\.TEST_SUPABASE_/.test(jobs[n]))

  for (const name of Object.keys(jobs).filter(ownDatabase)) {
    it(`${name} gets none of the test project's keys`, () => {
      // One would point the suite (or a copy of its rows) back at the
      // shared project, which is what the job's own database is to avoid.
      expect(jobs[name], name).not.toMatch(/secrets\.TEST_SUPABASE_/)
      expect(jobs[name], `${name} starts Supabase, which needs Docker: no container`).not.toMatch(/\n {4}container:/)
    })
  }
  const field = (block: string, re: RegExp) => block.match(re)?.[1].trim() ?? ''

  it('finds the test-project jobs at all', () => {
    expect(usesTestProject.length).toBeGreaterThanOrEqual(2)
    expect(Object.keys(jobs).filter(ownDatabase).length).toBeGreaterThanOrEqual(3)
  })

  for (const name of usesTestProject) {
    it(`${name} queues in its own repo-wide group and skips main's push`, () => {
      const job = jobs[name]
      const group = field(job, /\n {4}concurrency:\n {6}group:\s*(.+)/)
      // Repo-wide: no ref, run or PR number in the group, or each branch
      // gets its own queue and the copies overlap again.
      expect(group, `${name} needs concurrency.group test-db-…`).toMatch(/^test-db-/)
      expect(group).not.toMatch(/github\.(ref|run_id|head_ref|event\.number)/)
      // A matrix job's group must name its cell, or its shards queue
      // behind each other instead of behind the other run's same shard.
      for (const [, key] of job.matchAll(/\n {6}matrix:\n {8}([\w-]+):/g)) {
        expect(group).toContain(`matrix.${key}`)
      }
      // Wait, never kill: cancelling would fail the running PR's check.
      expect(field(job, /\n {6}cancel-in-progress:\s*(.+)/)).toBe('false')
      expect(field(job, /\n {4}if:\s*(.+)/)).toMatch(/github\.event_name\s*!=\s*'push'/)
    })
  }

  it('each suite has a group of its own', () => {
    const groups = usesTestProject.map((n) => field(jobs[n], /\n {4}concurrency:\n {6}group:\s*(.+)/))
    expect(new Set(groups).size).toBe(groups.length)
  })
})

// Each build-and-start suite restores Turbopack's build cache for its own
// dist dir (.github/actions/setup, Nov 20). A dist dir named wrong caches a
// folder no build writes, and nothing fails: the job just builds cold again,
// a minute a run, which is how a cache quietly stops paying. Derived from
// each suite's Playwright config, so a moved port moves the expectation too.
describe('each build restores its own build cache', () => {
  const body = WORKFLOW.slice(WORKFLOW.indexOf('\njobs:'))
  const jobs = Object.fromEntries(
    body
      .split(/\n {2}(?=[a-z][\w-]*:\n)/)
      .slice(1)
      .map((b) => [b.match(/^([\w-]+):/)![1], b] as const),
  )
  const ACTION = readFileSync('.github/actions/setup/action.yml', 'utf-8')

  /** The dist dir a suite's build writes: run-test-project-server.mjs builds
   *  into `.next-e2e-<port>`; the plain `npm run build` into `.next`. */
  function distDirFor(script: string): string {
    const config = SCRIPTS[script].match(/--config\s+(\S+)/)?.[1] ?? 'playwright.config.ts'
    const src = readFileSync(config, 'utf-8')
    if (!src.includes('run-test-project-server.mjs')) return '.next'
    const port = src.match(/const PORT = process\.env\.CACHE_E2E_PORT \|\| '(\d+)'/)?.[1]
    expect(port, `${config}: no default port found`).toBeDefined()
    return `.next-e2e-${port}`
  }

  const building = Object.entries(jobs).flatMap(([name, block]) => {
    const script = block.match(/npm run (test:[\w-]+)/)?.[1]
    return script && testDirFor(script) ? [{ name, block, script }] : []
  })

  it('finds the build jobs at all', () => {
    expect(building.length).toBeGreaterThanOrEqual(5)
  })

  for (const { name, block, script } of building) {
    // Production's smoke build has production's values baked in, and its
    // cache would be main's, which every PR's e2e build restores from.
    // The e2e shards build nothing: they start e2e-build's.
    const prebuilt = block.includes('E2E_PREBUILT')
    const want = name === 'e2e-prod-smoke' || prebuilt ? '' : distDirFor(script)
    it(`${name} caches ${want || 'no build'}`, () => {
      expect(block).toContain('uses: ./.github/actions/setup')
      expect(block.match(/next-dist-dir:\s*(\S+)/)?.[1] ?? '').toBe(want)
    })
  }

  // e2e's shards start one build instead of each making their own (Nov 20),
  // so the build must be what they'd have built: the same dist dir, the
  // same settings (NEXT_PUBLIC_ values are fixed into a build), and
  // handed over whole.
  describe('the e2e shards start the one build', () => {
    const build = jobs['e2e-build'] ?? ''
    const shards = jobs['e2e'] ?? ''

    it('e2e-build builds into the dist dir e2e starts, cached, and hands it over', () => {
      expect(build).toMatch(/run: npm run build 2>&1 \| tee build\.log\n/)
      expect(build.match(/next-dist-dir:\s*(\S+)/)?.[1]).toBe(distDirFor('test:e2e'))
      expect(build).toMatch(/name: e2e-build\n\s+path: \|\n\s+\.next\/\n\s+!\.next\/cache\/\n\s+include-hidden-files: true/)
    })

    it('every shard waits for it, downloads it, and starts it unbuilt', () => {
      expect(shards).toMatch(/\n {4}needs: \[e2e-build\]/)
      expect(shards).toMatch(/download-artifact@v\d+\n\s+with:\n\s+name: e2e-build\n\s+path: \.next\n/)
      expect(shards).toMatch(/npm run test:e2e[^\n]*\n\s+env:\n\s+E2E_PREBUILT: '1'/)
      expect(readFileSync('playwright.config.ts', 'utf-8')).toMatch(/process\.env\.E2E_PREBUILT \? `npx next start/)
    })

    it('the shards run with exactly the build’s settings', () => {
      expect(build).toMatch(/\n {4}env: &e2e-env\n/)
      expect(shards).toMatch(/\n {4}env: \*e2e-env\n/)
      // And nowhere else gives a shard a setting of its own beside them.
      expect(shards.match(/\n {10}[A-Z0-9_]+:/g) ?? []).toEqual(['\n          E2E_PREBUILT:'])
    })
  })

  it('caches only Turbopack’s part, never the fetch cache beside it', () => {
    expect(ACTION).toMatch(/path:\s*\$\{\{ inputs\.next-dist-dir \}\}\/cache\/turbopack\s*\n/)
  })
})

// Production's smoke run (push to main only, never gating) ran the whole
// suite on one runner and outgrew its 15-minute timeout: cancelled on most
// pushes from Nov 16, so production drift went unreported. And its report
// upload was `if: failure()` behind a continue-on-error step, which never
// fires. Both Nov 20.
describe('production’s smoke run finishes and keeps its report', () => {
  const body = WORKFLOW.slice(WORKFLOW.indexOf('\njobs:'))
  const jobs = Object.fromEntries(
    body
      .split(/\n {2}(?=[a-z][\w-]*:\n)/)
      .slice(1)
      .map((b) => [b.match(/^([\w-]+):/)![1], b] as const),
  )

  it('builds once, without the PR builds’ cache, and runs as shards of that build', () => {
    const build = jobs['e2e-prod-build'] ?? ''
    const smoke = jobs['e2e-prod-smoke'] ?? ''
    expect(build).toMatch(/\n {6}- run: npm run build\n/)
    expect(build).not.toMatch(/next-dist-dir/)
    expect(build).toMatch(/name: e2e-prod-build\n\s+path: \|\n\s+\.next\/\n\s+!\.next\/cache\/\n\s+include-hidden-files: true/)
    expect(build).toMatch(/\n {4}env: &prod-env\n/)
    expect(smoke).toMatch(/\n {4}env: \*prod-env\n/)
    expect(smoke).toMatch(/\n {4}needs: \[e2e-prod-build\]/)
    expect(smoke).toMatch(/download-artifact@v\d+\n\s+with:\n\s+name: e2e-prod-build\n\s+path: \.next\n/)
    const shards = smoke.match(/shard:\s*\[([^\]]+)\]/)?.[1].split(',') ?? []
    expect(shards.length).toBeGreaterThan(1)
    expect(smoke).toMatch(new RegExp(`--shard=\\$\\{\\{ matrix\\.shard \\}\\}/${shards.length}\\b`))
    expect(smoke).toMatch(/E2E_PREBUILT: '1'/)
    for (const job of [build, smoke]) expect(job).toMatch(/\n {4}if: github\.event_name == 'push'/)
  })

  it('no job hides its report behind failure() after a continue-on-error step', () => {
    const offenders = Object.entries(jobs)
      .filter(([, b]) => /continue-on-error:\s*true/.test(b) && /if:\s*failure\(\)/.test(b))
      .map(([n]) => n)
    expect(offenders).toEqual([])
  })
})

// The build cache used to be keyed on the commit, so every run missed and
// saved a fresh copy, 18–23s at the end of each build job that e2e's shards
// wait on (Nov 20). Keyed on the lock file, a PR saves it once.
describe('the build cache is saved once, not every run', () => {
  const ACTION = readFileSync('.github/actions/setup/action.yml', 'utf-8')
  it('isn’t keyed on the commit', () => {
    const turbopack = ACTION.slice(ACTION.indexOf('/cache/turbopack'))
    expect(turbopack).toMatch(/key: turbopack-/)
    expect(turbopack).not.toMatch(/github\.sha|restore-keys/)
  })
})
