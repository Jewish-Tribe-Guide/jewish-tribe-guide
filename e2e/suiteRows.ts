// ─────────────────────────────────────────────────────────────────────────────
// What each suite changes in the shared test project while it runs.
//
// integration, cache-roundtrip, form-roundtrip, admin-write and CI's e2e all
// point at ONE disposable Supabase project, and CI runs them as parallel
// jobs. A row one suite changes is a row every other suite may be reading
// at that moment. That has failed CI again and again, always looking like a
// flake in a test that changed nothing: PR 389 (Nov 16) lost three runs to
// tests that picked `cache-roundtrip-seed` — "the first listing category" —
// while the cache suite was renaming it.
//
// The two write suites change their own community, `e2e-writes`
// (scripts/writeSuiteCommunity.mjs), never the one e2e reads, so e2e and
// its build can run beside them. They still share it with each other, and
// integration still writes where it likes, so every existing row a suite
// changes is claimed here, by one suite only, and every test that picks "a
// category" skips the claimed ones.
// `src/test/suiteRows.test.ts` reads every suite's source and fails when a
// test writes a row its suite hasn't claimed, when two suites claim the
// same row, or when a test picks from the category list without skipping
// them.
//
// Rows a test creates and deletes itself under its own unique id (a
// submission, a listing named with Date.now()) need no claim: nothing else
// can be holding them.
// ─────────────────────────────────────────────────────────────────────────────

export const SUITE_ROWS = {
  'cache-roundtrip': [
    // Renamed and restored over and over to prove a save reaches the page.
    'category:cache-roundtrip-seed',
    'page:about',
    'site_settings:e2e-writes',
  ],
  'admin-write': [
    // Pages its tests make in the admin and delete again, all named `e2e-…`.
    'category:e2e-*',
    'page:privacy',
    // The team list: an admin is added, and removed in `finally`.
    'community:e2e-writes',
    // job-off turns a watch job off and on again.
    'watch_job:e2e-writes',
  ],
  'form-roundtrip': [],
  integration: [
    // Its own pages, `Integration Test <id>`, deleted after each test. Not a
    // borrowed row, but a run cancelled mid-test leaves one behind, and
    // e2e's "every category with a map" walked into one with no Filters
    // (PR 400, Nov 20).
    'category:integration-test-*',
    'category:vote-test-*',
  ],
} as const satisfies Record<string, readonly string[]>

export type Suite = keyof typeof SUITE_ROWS

/** The category ids (or `e2e-*` prefixes) some suite claims. */
const claimedCategories = Object.values(SUITE_ROWS)
  .flat()
  .filter((k) => k.startsWith('category:'))
  .map((k) => k.slice('category:'.length))

/** A category a test changes while others run: never pick one as "a page
 *  with listings" or "the first listing category". It can be renamed,
 *  hidden or deleted mid-test, and its cached page is mid-change. */
export function changedByTests(c: { id: string }): boolean {
  return claimedCategories.some((id) => (id.endsWith('*') ? c.id.startsWith(id.slice(0, -1)) : c.id === id))
}
