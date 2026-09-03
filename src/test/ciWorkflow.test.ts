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
        out.push({ job, script: m[1], hasContainer: /\n\s*container:\s*\S/.test(block) })
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
            `Playwright container image — without it CI fails with "Executable doesn't exist".`,
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
