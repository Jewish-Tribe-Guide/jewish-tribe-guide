// The monthly health review's numbers (docs/where-things-stand.md, "Dated
// checks"). Read-only: it reads the repo and asks npm, nothing else.
// Compare with the last review's numbers there and bring only what changed
// or got worse. Sentry and speed come from `npm run sentry:check` and the
// Sundays speed email.
//
//   npm run health

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const sh = (cmd) => {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 })
  } catch (e) {
    return e.stdout ?? '' // npm outdated and npm audit exit 1 when they find something
  }
}

const tracked = sh('git ls-files').split('\n').filter(Boolean)
const isTest = (f) => /\.(test|spec)\.tsx?$|\/__fixtures__\//.test(f)
const app = tracked.filter((f) => /^src\/.*\.tsx?$/.test(f) && !isTest(f))
const read = (f) => readFileSync(f, 'utf8')
const sources = app.map((f) => [f, read(f)])
const count = (re) => sources.reduce((n, [, s]) => n + (s.match(re)?.length ?? 0), 0)

const lines = sources.map(([f, s]) => [f, s.split('\n').length]).sort((a, b) => b[1] - a[1])
const disables = {}
for (const [, s] of sources) for (const m of s.matchAll(/eslint-disable(?:-next-line|-line)? ([@\w/-]+)/g)) disables[m[1]] = (disables[m[1]] ?? 0) + 1

const outdated = JSON.parse(sh('npm outdated --json') || '{}')
const majorBehind = Object.entries(outdated).filter(([, v]) => v.current && v.latest && v.current.split('.')[0] !== v.latest.split('.')[0])
const audit = JSON.parse(sh('npm audit --omit=dev --json') || '{}').metadata?.vulnerabilities ?? {}

const out = [
  ['App source lines', lines.reduce((n, [, l]) => n + l, 0)],
  ['App files / test files', `${app.length} / ${tracked.filter(isTest).length}`],
  ['Files over 800 lines', lines.filter(([, l]) => l > 800).length],
  ['`as unknown as` casts', count(/as unknown as/g)],
  ['`any` (`: any`, `as any`)', count(/:\s*any\b|as any\b/g)],
  ['Rules switched off', Object.values(disables).reduce((a, b) => a + b, 0)],
  ['TODO / FIXME / HACK', count(/\b(TODO|FIXME|HACK)\b/g)],
  ['Files naming Philly-only sources', sources.filter(([, s]) => /keystone|mekor|refuah/i.test(s)).length],
  ['Packages a major version behind', majorBehind.length],
  ['Advisories (site dependencies)', Object.entries(audit).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ') || 'none'],
]
const w = Math.max(...out.map(([k]) => k.length))
console.log('Code health, ' + new Date().toISOString().slice(0, 10) + '\n')
for (const [k, v] of out) console.log(`  ${k.padEnd(w)}  ${v}`)
console.log('\nLargest files')
for (const [f, l] of lines.slice(0, 10)) console.log(`  ${String(l).padStart(5)}  ${f}`)
console.log('\nSwitched off, by rule')
for (const [r, n] of Object.entries(disables).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${r}`)
if (majorBehind.length) {
  console.log('\nA major version behind')
  for (const [p, v] of majorBehind) console.log(`  ${p} ${v.current} → ${v.latest}`)
}
