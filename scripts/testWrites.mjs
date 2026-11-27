// Imported by the seed builder (make-test-seed.mjs), its test, and e2e-cache,
// which can't load the builder itself (Playwright, import.meta).

/** What the write suites save into rows they borrow, and restore after:
 *  About's body, a category's name, a form's. A run cut off mid-test never
 *  restores it, and a backup taken after copied it into the seed (Nov 26:
 *  About read "Mid-regeneration check 1795270976731 round 2"). The committed
 *  seed is checked against this, and make-test-seed.test.ts fails if a
 *  suite writes one it doesn't know. */
export const TEST_WRITES = /Cache round-trip check \d|Mid-regeneration check \d|\(race \d+[ab] \d|\(focus refresh \d|E2E Form Test \d|qqzv/
