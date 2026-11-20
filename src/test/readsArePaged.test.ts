import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// A list read of a table that grows has to page (src/lib/readAll.ts), or it
// is silently cut at 1,000 rows once the table passes that (Nov 20, the
// health sweep; live had 1,380 submissions). Read from the source, so a
// new read is held to it too.
//
// A read is fine without paging when it can only return a handful of rows:
// one row (single/maybeSingle), a count (head: true), a chosen few (by id,
// listing, browser or key), or a stated limit. Everything else on these
// tables goes through readAll, whose page function ends in .range().

const GROWING = [
  'activity',
  'daily_count',
  'job_run',
  'menu_reading',
  'question_reading',
  'resource',
  'resource_tag',
  'submission',
  'tag',
  'vote',
  'walk_route',
  'watch',
]

const BOUNDED = [
  /\.range\(/,
  /\.limit\(/,
  /[sS]ingle\(/,
  /head: true/,
  /\.(insert|upsert|update|delete)\(/,
  /\.(eq|in)\('(id|target_id|resource_id|voter_token|key)',/,
]

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

/** The query chain starting at `at`: up to the statement that follows it. */
function chainAt(src: string, at: number): string {
  const rest = src.slice(at)
  const end = rest.slice(1).search(/\n\s*\n|\n\s*(if|const|let|return|for|await|throw)\b|;/)
  return end < 0 ? rest : rest.slice(0, end + 1)
}

export function unpagedReads(): string[] {
  const out: string[] = []
  const from = new RegExp(`\\.from\\('(${GROWING.join('|')})'\\)`, 'g')
  for (const path of files('src')) {
    const src = readFileSync(path, 'utf8')
    for (const m of src.matchAll(from)) {
      let chain = chainAt(src, m.index)
      // A query built into a variable and limited further on:
      // `const q = db.from('job_run')…` then `return q.order(…).limit(n)`.
      const name = /(?:const|let)\s+(\w+)\s*=\s*[\w.()]*\s*$/.exec(src.slice(Math.max(0, m.index - 120), m.index))?.[1]
      if (name) chain += src.slice(m.index, m.index + 1500).split('\n').filter((l) => new RegExp(`\\b${name}\\b`).test(l)).join('\n')
      if (!/\.select\(/.test(chain) || BOUNDED.some((re) => re.test(chain))) continue
      out.push(`${path}:${src.slice(0, m.index).split('\n').length} (${m[1]})`)
    }
  }
  return out
}

describe('list reads of growing tables are paged', () => {
  it('finds the reads at all', () => {
    // Guards the scan: a regex that matched nothing would pass everything.
    const reads = files('src').reduce((n, p) => n + (readFileSync(p, 'utf8').match(/\.from\('(submission|resource)'\)/g)?.length ?? 0), 0)
    expect(reads).toBeGreaterThan(50)
  })

  it('every one pages, or can only return a few rows', () => {
    expect(unpagedReads()).toEqual([])
  })
})
