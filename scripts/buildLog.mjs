#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Fails a build whose log shows one of Next's own prerender stops caught
// and logged by our code.
//
// While Next prerenders a GET route, reading the request (request.url,
// headers, cookies) throws Next's "needs to bail out of prerendering"
// error, which Next expects to reach it. A handler that reads the request
// inside its try/catch logs it as a failure and answers 502 instead. Next
// 16.4 did this to eight public API routes (Nov 20): the routes still came
// out on-demand, but every build logged eight "GET failed" errors that
// weren't failures, the kind of noise that hides a real one.
//
// Used by CI's e2e-build job: `npm run build 2>&1 | tee build.log`, then
// `node scripts/buildLog.mjs build.log`.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** The log lines where our code caught Next's prerender stop. */
export function swallowedPrerenderStops(log) {
  return log.split('\n').filter((line) => /needs to bail out of prerendering/.test(line))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2]
  if (!file) {
    console.error('Usage: node scripts/buildLog.mjs <build log>')
    process.exit(2)
  }
  const lines = swallowedPrerenderStops(readFileSync(file, 'utf8'))
  if (lines.length) {
    console.error(`${lines.length} prerender stop(s) caught by our code. Read the request before the try (see communitySlugFromRequest):`)
    for (const line of lines) console.error(`  ${line.trim()}`)
    process.exit(1)
  }
  console.log('No prerender stops caught by our code.')
}
