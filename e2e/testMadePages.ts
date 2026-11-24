// ─────────────────────────────────────────────────────────────────────────────
// Pages the tests make for themselves, by the ids they make them under.
//
// A test that wants "a listing category" picks one from the seed, never one
// of these: a test beside it in the same run may be renaming, hiding or
// deleting it (admin-write's files run two at a time). Each suite has a
// database of its own (Nov 23), so this is about tests within one run, not
// suites colliding: the per-suite row claims that were here went with the
// shared test project.
//
// `src/test/testMadePages.test.ts` fails when a test picks from the
// category list without skipping these, or a suite makes a page under a
// label not listed here.
// ─────────────────────────────────────────────────────────────────────────────

export const TEST_MADE_PAGES = [
  // Renamed and restored over and over by cache-roundtrip
  // (scripts/run-test-project-server.mjs makes it).
  'cache-roundtrip-seed',
  // Pages admin-write's tests make in the admin and delete again.
  'e2e-*',
  // Integration's own, deleted after each test.
  'integration-test-*',
  'vote-test-*',
] as const

/** A page a test made: never pick one as "a page with listings" or "the
 *  first listing category". */
export function madeByTests(c: { id: string }): boolean {
  return TEST_MADE_PAGES.some((id) => (id.endsWith('*') ? c.id.startsWith(id.slice(0, -1)) : c.id === id))
}
