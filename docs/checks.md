# What we hold ourselves to, and what tells us

Each standard the project has set, what checks it, when, and who hears
when it's missed. A standard nothing checks, or a check whose failure
reaches no one, is a gap. Written Nov 24, 2026, from the user's point:
"we should be making sure our CI and tests are testing what we want and
notifying us when our standards aren't met."

The live site's own health (down, nightly jobs, backups, the domain) is
in `docs/operations.md`. The speed numbers are in `docs/speed-targets.md`.

## The code, before it merges

`main` requires **All checks passed** (`all-checks`, since Nov 24, the
user's yes), which passes only when every suite below did, and
**Lint, typecheck, unit tests**, in the ruleset "Require a pull request
before merging" (the one called "Da Rules(et)" is turned off). So every
row below blocks a merge.

| Standard | Checked by | Blocks a merge? |
| --- | --- | --- |
| It builds, lints with no warning left (`--max-warnings 0`) and every rule switched off says why (since Nov 24), type-checks, unit tests pass | `unit` job | Yes |
| Unit coverage doesn't drop below its floor | `unit` job (`vitest.config` thresholds) | Yes |
| The tests themselves can be trusted: no skips, no long fixed waits, every wait under its test's budget, no async `waitForFunction`, no test picking a page another made, no real email in the seed, no job holding the test project's keys | Guard tests in `src/test/`, inside `unit` | Yes |
| The moderation queue shows every field an edit changes | `SubmissionCard.test.tsx` (a compile error until a new field is classified) | Yes |
| Public pages: routing, redirects, server-rendered content, caching, icons, offline, the security policy | `e2e`, 7 shards, on the seed | Yes |
| Pages stay light (JS, images, preloads) | `e2e/budgets.spec.ts` | Yes |
| Admin writes work through the real console, and Back/Forward/reload land on the same screen | `admin-write` | Yes |
| An admin save reaches the cached public page | `cache-roundtrip` | Yes |
| The intake form reaches the database | `form-roundtrip` | Yes |
| Store reads and writes | `integration` | Yes |

When a PR's check fails, GitHub emails whoever pushed, if their GitHub
notification settings allow it (not checked from here).

## The live site, after it merges

| Standard | Checked by | Who hears |
| --- | --- | --- |
| Live data still fits the code | `e2e-prod-smoke`, on every push to `main` | A GitHub issue, "Production smoke tests are failing", assigned to whoever pushed (a comment on it if it's already open). Never blocks |
| A visitor hitting an error | Sentry | Sentry's email on a new issue |
| Sentry actually recording errors (not over quota) | `npm run sentry:check` | **Only whoever runs it.** Sentry was blind Nov 13–22 this way |
| Visitor speed: LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 at p75 | Sentry's web vitals (Speed Insights has no read API) | The site owners, every Sunday (`speedReport.ts`) |
| Server speed problems (N+1 calls, slow requests) | Sentry performance issues | Sentry's new-issue email. The two "N+1 API Call" issues of Nov 23 were fixed by PR 442 the same night |
| Admin speed: a screen's data and a save, ≤ 1s at p75 (agreed Nov 24) | Sentry's request timings for `/api/admin` | The site owners, every Sunday, with the visitor numbers |
| The security policy's reports | Sentry (`report-uri`), listed by `sentry:check` | Only whoever runs it |

## The gaps, and what closed them (Nov 24)

1. **Five suites guarded behaviour but didn't block a merge.** CI's
   `all-checks` job passes only when every PR suite did, a skip on a PR
   included; `ciWorkflow.test.ts` fails if a suite is missing from its
   `needs`. Required on `main` since Nov 24 (the user's yes). A flaky
   test now blocks merges until fixed, which is the point.
2. **The production smoke run told no one.** `prod-smoke-report` opens
   an issue on a failure, found by the report each failed shard uploads.
3. **Sentry going over quota was silent.** Sentry emails at 80% and 100%
   of the quota when its usage notifications are on (Settings → Account
   → Notifications → Quota). **Open until the user turns them on.**
4. **Visitor speed had a target but no alert.** The weekly speed email.
   Needs `SENTRY_API_TOKEN` on the live deployment (the user's).
5. **Admin speed had no target.** ≤ 1s at p75 for a screen and for a
   save, in `docs/speed-targets.md` and the weekly email. Agreed by the
   user Nov 24. Closed.
6. **Leftovers from the shared test database.** admin-write's 15s and
   20s waits are gone (60/60, three runs, on expect's 5s); `ci.yml`'s
   header no longer describes the shared project.
7. **The N+1 issues in Sentry** were already fixed by PR 442 (Nov 23,
   `listJobRuns`'s `only`, `jobFindings`' one read a state). Sentry still
   lists them as unresolved; mark them resolved there.
