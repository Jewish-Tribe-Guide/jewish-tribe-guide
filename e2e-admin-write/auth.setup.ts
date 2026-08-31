import { test as setup } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { resolveDefaultCommunityAdminEmail } from '../scripts/cacheE2eAdmin.mjs'

// ─────────────────────────────────────────────────────────────────────────────
// Mints a real, full-browser admin session against the disposable test
// Supabase project, for this suite's specs to drive the actual admin UI with
// (clicking Approve/Reject, filling in forms) — not just raw API calls, which
// is all e2e-cache/auth.setup.ts's sibling needed for its own suite. Same
// mechanism as e2e/auth.setup.ts (generateLink + verifyOtp, reproducing
// /api/admin/dev-login's approach without its production-build refusal —
// see that file's own comments for the full why), against whichever email
// resolveDefaultCommunityAdminEmail resolves (see its own comment — not
// always CACHE_TEST_ADMIN_EMAIL, once philly/[default community] gets a
// real admin_email configured on a shared project), and with an explicit
// createUser step first (a brand-new email's magic link was unreliable to
// redeem without it).
// ─────────────────────────────────────────────────────────────────────────────

const authFile = 'e2e-admin-write/.auth/admin.json'

setup('authenticate as the disposable test-project admin', async ({ page, baseURL }) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in the ' +
        'Playwright process itself — playwright.admin-write.config.ts should have remapped these from TEST_SUPABASE_*.',
    )
  }

  const testAdminEmail = await resolveDefaultCommunityAdminEmail(supabaseUrl, serviceRoleKey)
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { error: createError } = await admin.auth.admin.createUser({
    email: testAdminEmail,
    email_confirm: true,
  })
  // Idempotent: only a genuine failure is fatal, not "this user already exists".
  if (createError && !/already.*registered|already.*exists/i.test(createError.message)) {
    throw new Error(`Could not create the test-project admin user: ${createError.message}`)
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: testAdminEmail,
  })
  if (linkError || !linkData.properties?.hashed_token) {
    throw new Error(`Could not generate a magic link: ${linkError?.message ?? 'no hashed_token returned'}`)
  }

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
  await page.getByText(`Signed in as ${testAdminEmail}`).waitFor()

  await page.context().storageState({ path: authFile })
})
