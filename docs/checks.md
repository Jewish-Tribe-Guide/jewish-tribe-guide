# What we hold ourselves to, and what tells us

Each standard the project has set, what checks it, when, and who hears
when it's missed. A standard nothing checks, or a check whose failure
reaches no one, is a gap. Written Nov 24, 2026, from the user's point:
"we should be making sure our CI and tests are testing what we want and
notifying us when our standards aren't met."

The live site's own health (down, nightly jobs, backups, the domain) is
in `docs/operations.md`. The speed numbers are in `docs/speed-targets.md`.

## The code, before it merges

`main` requires one check: **Lint, typecheck, unit tests**. Every other
suite runs on each PR but can be merged past while red. In practice the
user merges only on green, so they are watched, but nothing enforces it.

| Standard | Checked by | Blocks a merge? |
| --- | --- | --- |
| It builds, lints, type-checks, unit tests pass | `unit` job | Yes |
| Unit coverage doesn't drop below its floor | `unit` job (`vitest.config` thresholds) | Yes |
| The tests themselves can be trusted: no skips, no long fixed waits, every wait under its test's budget, no async `waitForFunction`, no test picking a page another made, no real email in the seed, no job holding the test project's keys | Guard tests in `src/test/`, inside `unit` | Yes |
| The moderation queue shows every field an edit changes | `SubmissionCard.test.tsx` (a compile error until a new field is classified) | Yes |
| Public pages: routing, redirects, server-rendered content, caching, icons, offline, the security policy | `e2e`, 7 shards, on the seed | **No** |
| Pages stay light (JS, images, preloads) | `e2e/budgets.spec.ts` | **No** |
| Admin writes work through the real console, and Back/Forward/reload land on the same screen | `admin-write` | **No** |
| An admin save reaches the cached public page | `cache-roundtrip` | **No** |
| The intake form reaches the database | `form-roundtrip` | **No** |
| Store reads and writes | `integration` | **No** |

When a PR's check fails, GitHub emails whoever pushed, if their GitHub
notification settings allow it (not checked from here).

## The live site, after it merges

| Standard | Checked by | Who hears |
| --- | --- | --- |
| Live data still fits the code | `e2e-prod-smoke`, on every push to `main` | **No one.** Every step is `continue-on-error`, so a failure only shows in the Actions tab |
| A visitor hitting an error | Sentry | Sentry's email on a new issue |
| Sentry actually recording errors (not over quota) | `npm run sentry:check` | **Only whoever runs it.** Sentry was blind Nov 13–22 this way |
| Visitor speed: LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 at p75 | Vercel Speed Insights | **No one.** Read by hand (tracker 81, about Dec 6) |
| Server speed problems (N+1 calls, slow requests) | Sentry performance issues | Sentry's new-issue email. Two "N+1 API Call" issues opened Nov 23 and are unhandled |
| Admin speed (a save, To do loading) | **Nothing.** No target is set | — |
| The security policy's reports | Sentry (`report-uri`), listed by `sentry:check` | Only whoever runs it |

## The gaps, and the usual fix for each

1. **Five suites guard behaviour but don't block a merge.** The usual
   practice is that every check you rely on is required. To avoid listing
   seven e2e shards, add one final CI job that passes only when all the
   others did, and require that. It makes any flaky test block merges
   until fixed, which is the point. (A ruleset change: the user's call.)
2. **The production smoke run tells no one.** Have a failure open a
   GitHub issue, or put its result in the nightly email.
3. **Sentry going over quota is silent.** Sentry can email at 80% and
   100% of the quota (its usage notification settings). Or the nightly
   email could carry the dropped-event count `sentry:check` already reads.
4. **Visitor speed has a target but no alert.** Either alerts on the web
   vitals where they're measured (whether Sentry's plan or Vercel's
   allows this is unchecked), or a weekly line in the nightly email.
5. **Admin speed has no target.** Set one in `docs/speed-targets.md`
   (for example: an admin save answers within 1s for most saves), and
   check it on real use with Sentry's request timings for `/api/admin`,
   not with a test timeout. CI checks counts and order, never time.
6. **Leftovers from the shared test database.** 12 waits in `admin-write`
   allow 15s where 5s is the norm; they were set when sign-in and saves
   on the shared hosted project took seconds. CI's header comment in
   `ci.yml` still describes that shared project. Both should go.
7. **The N+1 issues in Sentry since Nov 23** need looking at.
