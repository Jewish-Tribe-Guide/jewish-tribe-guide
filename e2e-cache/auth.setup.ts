import { mkdirSync, writeFileSync } from 'node:fs'
import { test as setup } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { CACHE_TEST_ADMIN_EMAIL } from '../scripts/cacheE2eAdmin.mjs'

// ─────────────────────────────────────────────────────────────────────────────
// Mints a real admin session against the disposable test Supabase project,
// for cache-roundtrip.spec.ts to use — same mechanism e2e/auth.setup.ts uses
// for the real admin (dev-login refuses under a production build; see that
// file's own comments for why generateLink + verifyOtp reproduces it
// directly instead). The one difference: this suite makes raw API calls
// rather than driving a browser, so it just saves the access token to a
// file instead of a full browser storageState.
//
// CACHE_TEST_ADMIN_EMAIL doesn't need to exist as a user beforehand —
// generateLink with type 'magiclink' creates it on first call, which is why
// this suite needs no seeding beyond the schema migrations.
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_FILE = 'e2e-cache/.auth/token.json'

setup('mint a cache-test admin session', async () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in the ' +
        'Playwright process itself — playwright.cache.config.ts should have remapped these from TEST_SUPABASE_*.',
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: CACHE_TEST_ADMIN_EMAIL,
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

  mkdirSync('e2e-cache/.auth', { recursive: true })
  writeFileSync(TOKEN_FILE, JSON.stringify({ accessToken: verifyData.session.access_token }))
})
