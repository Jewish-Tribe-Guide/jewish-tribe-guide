import { test as setup } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Mints a real admin session and saves it for the `admin` project (see
// playwright.config.ts) to reuse across e2e/admin.spec.ts, instead of every
// test signing in fresh.
//
// /api/admin/dev-login can't help here — it refuses outright whenever
// NODE_ENV === 'production', which is exactly what this suite always runs
// against (see AGENTS.md). So this reproduces its actual mechanism, with one
// deliberate difference: dev-login follows action_link's real HTTP redirect
// and reads the tokens off the Location header, but that redirect is subject
// to Supabase's own "Redirect URLs" allowlist — which covers APP_URL
// (localhost:3000, the `next dev` port) rather than this suite's own
// dedicated port (3210, chosen specifically so a stray dev server never gets
// tested by accident — see playwright.config.ts), so it silently lands
// somewhere other than /admin instead of failing loudly. Redeeming the OTP
// directly via `verifyOtp` has no such gate — it's a plain POST, not a
// redirect — so this asks Supabase for the session, then hands the browser
// the exact hash fragment a successful redirect would have produced.
// detectSessionInUrl (src/lib/supabase/client.ts) does the rest.
//
// This authenticates as the REAL production admin address in SUPERADMIN_EMAILS —
// there is no separate test-admin account. That's why every test in
// admin.spec.ts is read-only: this suite's own rule ("nothing in e2e/ may
// write to the database") already forces that, but it matters doubly here
// since a write would also be a real action taken by the real admin identity.
// ─────────────────────────────────────────────────────────────────────────────

const authFile = 'e2e/.auth/admin.json'

setup('authenticate as admin', async ({ page, baseURL }) => {
  const email = process.env.SUPERADMIN_EMAILS?.split(',')[0]?.trim()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!email || !supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error(
      'Missing SUPERADMIN_EMAILS / NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / ' +
        'SUPABASE_SERVICE_ROLE_KEY — these must be visible to the Playwright process itself ' +
        '(see playwright.config.ts\'s process.loadEnvFile call), not just the Next.js server it starts.',
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (linkError || !linkData.properties?.hashed_token) {
    throw new Error(`Could not generate a magic link: ${linkError?.message ?? 'no hashed_token returned'}`)
  }

  // The anon client, not the service-role one — this is the same call/key a
  // real signed-in browser uses, just made from Node instead of the page.
  const anon = createClient(supabaseUrl, anonKey)
  const { data: verifyData, error: verifyError } = await anon.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  })
  if (verifyError || !verifyData.session) {
    throw new Error(`Could not redeem the magic link: ${verifyError?.message ?? 'no session returned'}`)
  }

  const { access_token, refresh_token, expires_in, token_type } = verifyData.session
  const hash = new URLSearchParams({
    access_token,
    refresh_token,
    expires_in: String(expires_in),
    token_type,
    type: 'magiclink',
  })
  // /philly/admin, not bare /admin — /admin is the standalone superadmin
  // console now (src/app/admin/page.tsx), a different page with no
  // "Signed in as" moderation-queue text to wait for.
  await page.goto(`${baseURL}/philly/admin#${hash.toString()}`)
  // The real, authenticated shell — not just the URL settling on
  // /philly/admin, which could also be the still-loading or logged-out state.
  await page.getByText(`Signed in as ${email}`).waitFor()

  await page.context().storageState({ path: authFile })
})
