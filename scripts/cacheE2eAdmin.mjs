// A fixed admin identity shared by every write-suite that runs against the
// disposable test Supabase project (cache-roundtrip, admin-write) — not a
// real person, not shared with the app's real ADMIN_EMAILS. Exists only
// inside that test project (see run-test-project-server.mjs, which boots
// every one of these suites' server, and each suite's own auth.setup.ts).
// Safe to share across suites: each runs as its own process/port and the
// test project is never touched by two of them concurrently.
export const CACHE_TEST_ADMIN_EMAIL = 'cache-roundtrip-admin@test.invalid'
