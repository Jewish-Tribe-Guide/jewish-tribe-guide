// This cache-round-trip suite's own fixed admin identity — not a real
// person, not shared with the app's real ADMIN_EMAILS. Exists only inside
// the disposable test Supabase project the suite runs against (see
// run-cache-e2e-server.mjs and e2e-cache/auth.setup.ts).
export const CACHE_TEST_ADMIN_EMAIL = 'cache-roundtrip-admin@test.invalid'
