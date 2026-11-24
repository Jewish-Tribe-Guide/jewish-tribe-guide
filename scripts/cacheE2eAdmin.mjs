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

// Mints a session for `email` the way the auth.setup.ts files all do
// (generateLink + verifyOtp), trying again when the link was cancelled
// before it could be redeemed. generateLink cancels any link still
// outstanding for that user, so two sign-ins as the same person at once
// fail whichever redeems second with "invalid or has expired". Nov 3:
// admin-write failed in CI that way with all 33 of its tests unrun, while
// cache-roundtrip signed in beside it as the same real admin. Each suite
// signs in as its own admin now (testCommunity.mjs), so this is the
// fallback, for a local run beside CI's. A fresh link a moment later is
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
