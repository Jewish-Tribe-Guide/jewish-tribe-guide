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
