import { createClient } from '@supabase/supabase-js'

// A fixed admin identity shared by every write-suite that runs against the
// disposable test Supabase project (cache-roundtrip, admin-write) — not a
// real person, not shared with the app's real ADMIN_EMAILS. Exists only
// inside that test project (see run-test-project-server.mjs, which boots
// every one of these suites' server, and each suite's own auth.setup.ts).
// Safe to share across suites: each runs as its own process/port and the
// test project is never touched by two of them concurrently.
export const CACHE_TEST_ADMIN_EMAIL = 'cache-roundtrip-admin@test.invalid'

// The email actually authorized to administer the "default" community on
// whatever Supabase project these suites are running against.
//
// Both auth.setup.ts files used to mint a session for CACHE_TEST_ADMIN_EMAIL
// unconditionally, on the assumption that the default community had no
// admin_email configured — true when this was written (see the migration
// that introduced admin_email, "captured, not yet enforced"), so the
// per-community check always fell back to the global ADMIN_EMAILS list
// (which the server scripts set to exactly this email). That assumption
// broke the instant a real admin_email got set on a project these suites
// also point at — SHARED_DEV_TEST_PROJECT means that's the same project a
// real admin actually uses (see the README section by that name), and
// "TEST_SUPABASE_URL" in CI can be configured to the same thing. Once
// admin_email is set, isAllowedForCommunity ignores the global list
// entirely for that community (see adminAuth.ts's own comment on why), so
// the minted session stopped being one this community would recognize —
// not a broken build, a stale assumption in the test's own setup.
//
// Reading it directly and minting for whichever email is actually
// authorized fixes this correctly rather than by coincidence: a pristine
// test project (admin_email still unset) gets CACHE_TEST_ADMIN_EMAIL same
// as before, and a shared project with a real admin_email configured gets
// a session for that real address instead — no email is sent either way,
// since generateLink mints the link directly via the service-role key.
export async function resolveDefaultCommunityAdminEmail(supabaseUrl, serviceRoleKey) {
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data } = await admin.from('community').select('admin_email, is_default, sort_order').order('sort_order', { ascending: true })
  const rows = data ?? []
  const target = rows.find((r) => r.is_default) ?? rows[0]
  return target?.admin_email || CACHE_TEST_ADMIN_EMAIL
}
