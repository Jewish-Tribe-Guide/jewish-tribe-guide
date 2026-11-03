import { createClient } from '@supabase/supabase-js'

// Fixed admin identities for the write-suites that run against the
// disposable test Supabase project (cache-roundtrip, admin-write) — not real
// people, not shared with the app's real SUPERADMIN_EMAILS. Exist only
// inside that test project (see run-test-project-server.mjs, which boots
// every one of these suites' server, and each suite's own auth.setup.ts).
// Each runs as its own process/port, so sharing an identity would be safe
// for ordinary reads/writes — but NOT for minting the session itself:
// generateLink + verifyOtp for the SAME email invalidates whichever magic
// link was already outstanding for that user, so two suites racing to
// authenticate as one shared identity made whichever one lost the race fail
// with "invalid or has expired" nearly every run (this used to be one
// constant, CACHE_TEST_ADMIN_EMAIL, used by both — ci.yml's admin-write job
// depended on cache-roundtrip finishing first purely to dodge this, at the
// cost of forcing them to run sequentially in CI instead of in parallel).
// Giving each suite its own identity removes the collision at the source,
// so that `needs:` ordering is no longer required.
export const CACHE_TEST_ADMIN_EMAIL = 'cache-roundtrip-admin@test.invalid'
export const ADMIN_WRITE_TEST_ADMIN_EMAIL = 'admin-write-admin@test.invalid'

// The email actually authorized to administer the "default" community on
// whatever Supabase project these suites are running against.
//
// Both auth.setup.ts files used to mint a session for CACHE_TEST_ADMIN_EMAIL
// unconditionally, on the assumption that the default community had no
// admin_email configured — true when this was written (see the migration
// that introduced admin_email, "captured, not yet enforced"), so the
// per-community check always fell back to the global SUPERADMIN_EMAILS list
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
// test project (admin_email still unset) gets `fallbackEmail` same as
// before, and a shared project with a real admin_email configured gets a
// session for that real address instead — no email is sent either way,
// since generateLink mints the link directly via the service-role key.
// `fallbackEmail` defaults to CACHE_TEST_ADMIN_EMAIL for backward
// compatibility with cache-roundtrip's own callsite; admin-write passes
// ADMIN_WRITE_TEST_ADMIN_EMAIL explicitly so the two suites never resolve to
// the same identity on a pristine (CI) test project. Note this doesn't help
// on a SHARED_DEV_TEST_PROJECT with a real admin_email set — both suites
// still resolve to that same real address there. That was thought to be
// local-dev-only, but CI's test project is the shared dev project now, with
// a real admin_email, so the race is back in CI; mintMagicLinkSession below
// is what survives it.
export async function resolveDefaultCommunityAdminEmail(supabaseUrl, serviceRoleKey, fallbackEmail = CACHE_TEST_ADMIN_EMAIL) {
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data } = await admin.from('community').select('admin_email, is_default, sort_order').order('sort_order', { ascending: true })
  const rows = data ?? []
  const target = rows.find((r) => r.is_default) ?? rows[0]
  return target?.admin_email || fallbackEmail
}

// Mints a session for `email` the way the auth.setup.ts files all do
// (generateLink + verifyOtp), trying again when the link was cancelled
// before it could be redeemed. generateLink cancels any link still
// outstanding for that user, so two suites signing in as the same person
// at once (both resolve to a community's real admin_email, which the CI
// test project has had set since it became the shared dev project too)
// fail whichever redeems second with "invalid or has expired". Nov 3:
// admin-write failed in CI that way with all 33 of its tests unrun, while
// cache-roundtrip signed in beside it. A fresh link a moment later is
// redeemed in the same few hundred milliseconds, so a few tries converge.
export async function mintMagicLinkSession(admin, anon, email, { tries = 5, pause = () => 300 + Math.random() * 1200 } = {}) {
  for (let attempt = 1; ; attempt++) {
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    if (linkError || !linkData?.properties?.hashed_token) {
      throw new Error(`Could not generate a magic link: ${linkError?.message ?? 'no hashed_token returned'}`)
    }
    const { data: verifyData, error: verifyError } = await anon.auth.verifyOtp({ token_hash: linkData.properties.hashed_token, type: 'magiclink' })
    if (!verifyError && verifyData?.session) return verifyData.session
    const cancelled = /invalid or has expired/i.test(verifyError?.message ?? '')
    if (!cancelled || attempt >= tries) {
      throw new Error(`Could not redeem the magic link: ${verifyError?.message ?? 'no session returned'}${cancelled ? ` (${attempt} tries)` : ''}`)
    }
    await new Promise((r) => setTimeout(r, pause()))
  }
}
