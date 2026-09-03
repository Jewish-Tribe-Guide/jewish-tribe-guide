import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// A route handler that starts an email and returns without waiting is not
// "best effort" — it is a coin flip.
//
// On a serverless platform the invocation can be frozen or torn down once the
// response is finished, taking any still-in-flight work with it. Submission
// #1065 (Mekor Habracha) is what that looks like when the flip loses: the row
// was written, the notify list was correct, and nothing ever reached Resend —
// no error, nothing in Sentry, because the send simply stopped existing.
//
// next/server's `after` is the framework's own answer: the callback runs once
// the response is finished and the platform keeps the invocation alive for the
// route's max duration.
//
// The comment above each call site explains this, and a comment is not a
// guarantee. `sendFoo(...).catch(...)` reads as deliberate and careful — it
// has a catch on it — which is exactly why it survived review twice. Derived
// from the sources so it cannot quietly come back.
// ─────────────────────────────────────────────────────────────────────────────

const ROUTES = globSync('src/app/api/**/route.ts')

/** Character ranges covered by calls matching `pattern`, by paren matching. */
function callRanges(src: string, pattern: RegExp): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  for (const m of src.matchAll(pattern)) {
    let depth = 0
    for (let i = m.index! + m[0].length - 1; i < src.length; i++) {
      if (src[i] === '(') depth++
      else if (src[i] === ')') {
        depth--
        if (depth === 0) { ranges.push([m.index!, i]); break }
      }
    }
  }
  return ranges
}

const afterRanges = (src: string) => callRanges(src, /\bafter\s*\(/g)

/** Somewhere the platform is genuinely kept waiting: an after() callback, or
 *  an awaited Promise.all/allSettled (how several sends get run together —
 *  the sends inside it carry no `await` of their own but are still waited on). */
function scheduledRanges(src: string): Array<[number, number]> {
  return [...afterRanges(src), ...callRanges(src, /\bawait\s+Promise\.(all|allSettled)\s*\(/g)]
}

/** Local helpers in `src` whose own body sends email — `notify()` and friends.
 *
 *  Without this the guard checks the wrong thing. The sends move one function
 *  down, that function's internals look correctly awaited, and the call site
 *  that abandons it is invisible — which is precisely the shape the real bug
 *  had: `notify(submission)` on its own line, with a tidy awaited Promise.all
 *  inside it. Verified by mutation: reverting only the call site slipped past
 *  an earlier version of this test. */
function senderHelpers(src: string): string[] {
  const names: string[] = []
  for (const m of src.matchAll(/(?:async\s+)?function\s+(\w+)\s*\([^)]*\)[^{]*\{/g)) {
    let depth = 0
    const start = m.index! + m[0].length - 1
    for (let i = start; i < src.length; i++) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') {
        depth--
        if (depth === 0) {
          if (/\bsend[A-Z]\w*\s*\(/.test(src.slice(start, i))) names.push(m[1])
          break
        }
      }
    }
  }
  return names
}

/** Email sends in `src` that are neither awaited nor inside an after() call. */
function unscheduledSends(src: string): string[] {
  const ranges = scheduledRanges(src)
  const helpers = senderHelpers(src)
  const callable = ['send[A-Z]\\w*', ...helpers].join('|')
  const out: string[] = []
  for (const m of src.matchAll(new RegExp(`(await\\s+)?\\b(?:${callable})\\s*\\(`, 'g'))) {
    if (m[1]) continue
    const at = m.index!
    // The helper's own `function notify(` declaration matches too — it is the
    // definition, not a call.
    if (/function\s+$/.test(src.slice(Math.max(0, at - 20), at))) continue
    if (ranges.some(([a, b]) => at > a && at < b)) continue
    out.push(m[0].replace(/\s*\($/, ''))
  }
  return out
}

describe('route handlers never abandon an email', () => {
  it('finds the route handlers at all', () => {
    // Without this a bad glob would make every assertion below vacuous.
    expect(ROUTES.length).toBeGreaterThan(10)
  })

  for (const file of ROUTES) {
    const src = readFileSync(file, 'utf-8')
    if (!/\bsend[A-Z]\w*\s*\(/.test(src)) continue

    it(file.replace('src/app/api/', ''), () => {
      const loose = unscheduledSends(src)
      expect(
        loose,
        `${file} starts ${loose.join(', ')} without awaiting it and outside after(). ` +
          'The response returns first, so the send may never happen — wrap it in ' +
          "after() from 'next/server', or await it.",
      ).toEqual([])
    })
  }
})

describe('the after() callback does not abandon the work inside it', () => {
  // after() waits on the promise its callback returns. A floating promise
  // INSIDE the callback is abandoned exactly the same way, which would make
  // the fix look right while changing nothing.
  for (const file of ROUTES) {
    const src = readFileSync(file, 'utf-8')
    if (!/\bafter\s*\(/.test(src)) continue

    it(file.replace('src/app/api/', ''), () => {
      for (const [a, b] of afterRanges(src)) {
        const inner = src.slice(a, b)
        if (!/\bsend[A-Z]\w*\s*\(/.test(inner)) continue
        expect(
          /await|=>\s*\w+\(/.test(inner),
          `${file}'s after() callback starts a send without awaiting it — after() has ` +
            'nothing to wait on, so the work is abandoned just as it was before.',
        ).toBe(true)
      }
    })
  }
})
