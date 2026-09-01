import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { ResourceSubmission } from '../src/types'

// ─────────────────────────────────────────────────────────────────────────────
// Drives the REAL admin UI (ModerationQueue) through the approve/reject
// state machine — clicking the same buttons a human admin clicks, against
// the disposable test Supabase project (see playwright.admin-write.config.ts
// and e2e-admin-write/auth.setup.ts). This is the gap
// submissionStore.integration.test.ts and e2e/admin.spec.ts (read-only)
// don't close between them: the integration suite calls approveSubmission()
// directly, never the UI; admin.spec.ts drives the UI, never a mutation.
//
// resource.category is a plain text column (no FK — see
// supabase/migrations/20240101000027_communities.sql), so these tests don't
// need a real category row to exist; the queue falls back to showing the raw
// category id as the label when it can't resolve one, which is cosmetic and
// doesn't affect the underlying approve/reject write being verified.
// ─────────────────────────────────────────────────────────────────────────────

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceRoleKey)
}

function listingPayload(name: string): ResourceSubmission {
  return {
    category: 'e2e-admin-write-category',
    name,
    anchorId: 'community',
    distance: null,
    address: '1 Test St, Philadelphia, PA',
    phone: '',
    details: {},
    // Pre-supplied so approval never calls the real geocoder.
    geo: { lat: 39.95, lng: -75.16 },
  }
}

const pendingSubmissionIds: string[] = []
const pendingResourceIds: string[] = []

test.afterEach(async () => {
  const supabase = getAdminClient()
  for (const id of pendingSubmissionIds.splice(0)) {
    await supabase.from('submission').delete().eq('id', id)
  }
  for (const id of pendingResourceIds.splice(0)) {
    await supabase.from('resource').delete().eq('id', id)
  }
})

test.describe('signing out', () => {
  // A real Sign-out click revokes that session's refresh token server-side
  // with Supabase's default GLOBAL scope — every session for that email,
  // not just this browser tab (see GoTrueClient.signOut's own doc). Every
  // other test in this suite reuses ONE shared session (from
  // e2e-admin-write/.auth/admin.json, minted once in auth.setup.ts for
  // whichever email resolveDefaultCommunityAdminEmail resolves — on a
  // SHARED_DEV_TEST_PROJECT setup that can be a real admin's own address).
  // Signing out as that same email, from anywhere, revokes the shared
  // session out from under whichever tests are running alongside it —
  // confirmed the hard way: running this test in the same invocation as the
  // rest of moderation.spec.ts made unrelated Approve/Reject/Pages/Community
  // tests fail, even from an independently-minted session for that email.
  //
  // Mints its own disposable admin instead — a throwaway address temporarily
  // added to philly's admin_emails for the duration of one test — so signing
  // it out can never touch the shared session or a real admin's other
  // devices. Cleaned up in afterEach like every other suite here that
  // borrows a real row (see AGENTS.md's testing notes on that pattern).
  test.use({ storageState: { cookies: [], origins: [] } })

  const disposableEmail = `e2e-signout-${randomUUID()}@test.invalid`
  // undefined until the test actually reads philly's real admin_emails —
  // afterEach only restores it once that read has genuinely happened, so a
  // failure before the read can't overwrite the real list with [].
  let originalAdminEmails: string[] | undefined

  test.afterEach(async () => {
    const supabase = getAdminClient()
    if (originalAdminEmails !== undefined) {
      await supabase.from('community').update({ admin_emails: originalAdminEmails }).eq('slug', 'philly')
    }
    const { data } = await supabase.auth.admin.listUsers()
    const user = data?.users.find((u) => u.email === disposableEmail)
    if (user) await supabase.auth.admin.deleteUser(user.id)
  })

  test('clicking Sign out ends the session and returns to the login form', async ({ page, baseURL }) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const admin = getAdminClient()

    const { data: community, error: communityError } = await admin
      .from('community')
      .select('admin_emails')
      .eq('slug', 'philly')
      .single()
    if (communityError || !community) throw new Error(`Could not read philly's admin_emails: ${communityError?.message}`)
    originalAdminEmails = (community.admin_emails as string[] | null) ?? []
    const { error: updateError } = await admin
      .from('community')
      .update({ admin_emails: [...originalAdminEmails, disposableEmail] })
      .eq('slug', 'philly')
    if (updateError) throw new Error(`Could not add the disposable admin: ${updateError.message}`)

    const { error: createError } = await admin.auth.admin.createUser({ email: disposableEmail, email_confirm: true })
    if (createError) throw new Error(`Could not create the disposable admin user: ${createError.message}`)

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: disposableEmail,
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
    // The Categories tab specifically (not /philly/admin, the moderation
    // queue, which had its own Sign out button before this control moved
    // into AdminAuthGate) — every other admin tab had no sign-out control at
    // all.
    await page.goto(`${baseURL}/philly/admin/categories#${hash.toString()}`)
    await expect(page.getByText(/^Signed in as /)).toBeVisible()

    await page.getByRole('button', { name: 'Sign out' }).click()

    // Back to AdminAuthGate's unauthenticated branch — the magic-link form,
    // not the queue. A session that merely lingered client-side (signOut()
    // fired but didn't actually clear it) would still show the queue here.
    await expect(page.getByLabel(/admin email/i)).toBeVisible()
    await expect(page.getByText(/^Signed in as /)).not.toBeVisible()
  })
})

test('clicking Approve on a pending listing makes it live', async ({ page }) => {
  const supabase = getAdminClient()
  const name = `E2E Admin Write ${randomUUID()}`

  const { data: submission, error } = await supabase
    .from('submission')
    .insert({
      operation: 'create',
      target_type: 'listing',
      target_id: null,
      payload: listingPayload(name),
      note: null,
      status: 'pending',
      submitted_by: { name: 'e2e-admin-write suite' },
    })
    .select('id')
    .single()
  if (error || !submission) throw new Error(`Could not seed the pending submission: ${error?.message}`)
  pendingSubmissionIds.push(submission.id)

  await page.goto('/philly/admin')
  const card = page.locator('div.rounded-lg.shadow-sm', { hasText: name })
  await expect(card).toBeVisible()

  await card.getByRole('button', { name: 'Approve' }).click()

  // The real signal: the card leaves the queue once the PATCH resolves.
  await expect(card).not.toBeVisible()

  const { data: resource } = await supabase.from('resource').select('*').eq('name', name).maybeSingle()
  expect(resource, 'approving should have inserted a live resource row').not.toBeNull()
  expect(resource!.status).toBe('approved')
  pendingResourceIds.push(resource!.id)

  const { data: reloaded } = await supabase.from('submission').select('status').eq('id', submission.id).single()
  expect(reloaded?.status).toBe('approved')
})

test('clicking Reject with a reason marks the submission rejected and creates no listing', async ({ page }) => {
  const supabase = getAdminClient()
  const name = `E2E Admin Write ${randomUUID()}`

  const { data: submission, error } = await supabase
    .from('submission')
    .insert({
      operation: 'create',
      target_type: 'listing',
      target_id: null,
      payload: listingPayload(name),
      note: null,
      status: 'pending',
      submitted_by: { name: 'e2e-admin-write suite' },
    })
    .select('id')
    .single()
  if (error || !submission) throw new Error(`Could not seed the pending submission: ${error?.message}`)
  pendingSubmissionIds.push(submission.id)

  await page.goto('/philly/admin')
  const card = page.locator('div.rounded-lg.shadow-sm', { hasText: name })
  await expect(card).toBeVisible()

  await card.getByRole('button', { name: 'Reject' }).click()
  await card.getByPlaceholder(/already listed/).fill('Duplicate of an existing listing.')
  await card.getByRole('button', { name: 'Confirm rejection' }).click()

  await expect(card).not.toBeVisible()

  const { data: resource } = await supabase.from('resource').select('id').eq('name', name).maybeSingle()
  expect(resource, 'rejecting should never create a live resource row').toBeNull()

  const { data: reloaded } = await supabase.from('submission').select('status').eq('id', submission.id).single()
  expect(reloaded?.status).toBe('rejected')
})

test('a rejected submission shows up on the Metrics tab\'s Rejected history view', async ({ page }) => {
  const supabase = getAdminClient()
  const name = `E2E Admin Write ${randomUUID()}`

  const { data: submission, error } = await supabase
    .from('submission')
    .insert({
      operation: 'create',
      target_type: 'listing',
      target_id: null,
      payload: listingPayload(name),
      note: null,
      status: 'pending',
      submitted_by: { name: 'e2e-admin-write suite' },
    })
    .select('id')
    .single()
  if (error || !submission) throw new Error(`Could not seed the pending submission: ${error?.message}`)
  pendingSubmissionIds.push(submission.id)

  await page.goto('/philly/admin')
  const card = page.locator('div.rounded-lg.shadow-sm', { hasText: name })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Reject' }).click()
  await card.getByRole('button', { name: 'Confirm rejection' }).click()
  await expect(card).not.toBeVisible()

  // The click-through this test actually exists to prove: Metrics' Rejected
  // tile links to /admin/history/rejected, and the just-rejected submission
  // is on it — the real-world case is "did I actually reject that?".
  await page.goto('/philly/admin/metrics')
  await page.getByRole('link', { name: /Rejected/ }).click()
  await expect(page).toHaveURL(/\/admin\/history\/rejected/)
  await expect(page.locator('div.rounded-lg.shadow-sm', { hasText: name })).toBeVisible()

  const { data: reloaded } = await supabase.from('submission').select('status').eq('id', submission.id).single()
  expect(reloaded?.status).toBe('rejected')
})
