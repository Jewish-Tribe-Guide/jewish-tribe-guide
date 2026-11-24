import { mkdirSync, writeFileSync } from 'node:fs'
import { test as setup } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { CACHE_TEST_ADMIN_EMAIL, mintMagicLinkSession } from '../scripts/cacheE2eAdmin.mjs'

// ─────────────────────────────────────────────────────────────────────────────
// Mints a real admin session against the disposable test Supabase project,
// for cache-roundtrip.spec.ts to use — same mechanism e2e/auth.setup.ts uses
// for the real admin (dev-login refuses under a production build; see that
// file's own comments for why generateLink + verifyOtp reproduces it
// directly instead). The one difference: this suite makes raw API calls
// rather than driving a browser, so it just saves the access token to a
// file instead of a full browser storageState.
//
// Always this suite's own admin: the community it tests lists it by name
// (scripts/writeSuiteCommunity.mjs), so it never signs in as a real
// community's admin, and never as the same person as admin-write. It
// doesn't need to exist as a Supabase Auth user beforehand — this creates
// it (idempotently, pre-confirmed) on first run. generateLink with type 'magiclink' alone was tried first and
// turned out unreliable for a genuinely brand-new email on some Supabase
// project configs (the returned link failed to redeem with "invalid or has
// expired" even though it was used within the same second) — explicitly
// creating the user first removes that ambiguity.
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_FILE = 'e2e-cache/.auth/token.json'

setup('mint a cache-test admin session', async () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in the ' +
        'Playwright process itself — playwright.cache.config.ts should have set these from the test database (scripts/testDatabase.mjs).',
    )
  }

  const testAdminEmail = CACHE_TEST_ADMIN_EMAIL
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { error: createError } = await admin.auth.admin.createUser({
    email: testAdminEmail,
    email_confirm: true,
  })
  // Idempotent: only a genuine failure is fatal, not "this user already exists".
  if (createError && !/already.*registered|already.*exists/i.test(createError.message)) {
    throw new Error(`Could not create the cache-test admin user: ${createError.message}`)
  }

  const anon = createClient(supabaseUrl, anonKey)
  const session = await mintMagicLinkSession(admin, anon, testAdminEmail)

  mkdirSync('e2e-cache/.auth', { recursive: true })
  writeFileSync(TOKEN_FILE, JSON.stringify({ accessToken: session.access_token }))
})
