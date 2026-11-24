import { test as setup } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { ADMIN_WRITE_TEST_ADMIN_EMAIL, mintMagicLinkSession } from '../scripts/cacheE2eAdmin.mjs'
import { TEST_COMMUNITY } from '../scripts/testCommunity.mjs'

// ─────────────────────────────────────────────────────────────────────────────
// Mints a real, full-browser admin session against the disposable test
// Supabase project, for this suite's specs to drive the actual admin UI with
// (clicking Approve/Reject, filling in forms) — not just raw API calls, which
// is all e2e-cache/auth.setup.ts's sibling needed for its own suite. Same
// mechanism as e2e/auth.setup.ts (generateLink + verifyOtp, reproducing
// /api/admin/dev-login's approach without its production-build refusal —
// see that file's own comments for the full why), as this suite's own admin,
// with an explicit createUser step first (a brand-new email's magic link
// was unreliable to redeem without it).
//
// Always ADMIN_WRITE_TEST_ADMIN_EMAIL: the test server puts it on the
// community this suite changes (scripts/testCommunity.mjs). It used to be philly's
// real admin whenever philly had one, the same person cache-roundtrip
// signed in as, and the two cancelled each other's magic links (see
// cacheE2eAdmin.mjs).
// ─────────────────────────────────────────────────────────────────────────────

const authFile = 'e2e-admin-write/.auth/admin.json'

setup('authenticate as the suite’s own test admin', async ({ page, baseURL }) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in the ' +
        'Playwright process itself — playwright.admin-write.config.ts should have set these from the test database (scripts/testDatabase.mjs).',
    )
  }

  const testAdminEmail = ADMIN_WRITE_TEST_ADMIN_EMAIL
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { error: createError } = await admin.auth.admin.createUser({
    email: testAdminEmail,
    email_confirm: true,
  })
  // Idempotent: only a genuine failure is fatal, not "this user already exists".
  if (createError && !/already.*registered|already.*exists/i.test(createError.message)) {
    throw new Error(`Could not create the test-project admin user: ${createError.message}`)
  }

  const anon = createClient(supabaseUrl, anonKey)
  const session = await mintMagicLinkSession(admin, anon, testAdminEmail)

  const { access_token, refresh_token, expires_in, token_type } = session
  const hash = new URLSearchParams({
    access_token,
    refresh_token,
    expires_in: String(expires_in),
    token_type,
    type: 'magiclink',
  })
  // The community's own console, not bare /admin — /admin is the standalone
  // superadmin console now (src/app/admin/page.tsx), a different page with
  // no "Signed in as" moderation-queue text to wait for.
  await page.goto(`${baseURL}/${TEST_COMMUNITY}/admin#${hash.toString()}`)
  await page.getByText(`Signed in as ${testAdminEmail}`).waitFor()

  await page.context().storageState({ path: authFile })
})
