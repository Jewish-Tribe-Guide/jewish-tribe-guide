import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ResourceSubmission } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// The integration tier: exercises the real submit → moderate → live-table
// pipeline against a dedicated test Supabase project (src/test/integrationEnv.ts
// refuses to run this against the real one). Unlike the e2e suite, this is
// allowed to write — every row it creates is cleaned up in afterEach, tracked
// by id rather than assumed, so a failed assertion still leaves the DB clean.
//
// next/cache is mocked because cacheTag/cacheLife need a Next.js request
// context this plain Vitest process doesn't have — see revalidateContent.test.ts
// for the same pattern. Nothing else is mocked: categoryStore, communityStore
// and submissionStore all run for real against the test project.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('next/cache', () => ({
  revalidateTag: () => {},
  cacheTag: () => {},
  cacheLife: () => {},
}))

const { createCategory, deleteCategory } = await import('./categoryStore')
const { getAdminClient } = await import('./supabase/admin')
const {
  submitListingCreate,
  submitListingDelete,
  approveSubmission,
  rejectSubmission,
  listPendingSubmissions,
} = await import('./submissionStore')

const pendingCategoryIds: string[] = []
const pendingSubmissionIds: string[] = []

afterEach(async () => {
  const supabase = getAdminClient()
  for (const id of pendingSubmissionIds.splice(0)) {
    await supabase.from('submission').delete().eq('id', id)
  }
  for (const id of pendingCategoryIds.splice(0)) {
    // Also removes every listing in the category — covers the resource rows
    // these tests create, no separate resource cleanup needed.
    await deleteCategory(id)
  }
})

async function makeTestCategory() {
  const category = await createCategory({ label: `Integration Test ${randomUUID().slice(0, 8)}` })
  pendingCategoryIds.push(category.id)
  return category
}

function listingPayload(categoryId: string, name: string): ResourceSubmission {
  return {
    category: categoryId,
    name,
    anchorId: 'community',
    distance: null,
    address: '123 Test St, Philadelphia, PA',
    phone: '',
    details: {},
    // Pre-supplied so approval never calls the real geocoder.
    geo: { lat: 39.95, lng: -75.16 },
  }
}

describe('submissionStore (integration)', () => {
  it('approving a create submission inserts a live, approved resource', async () => {
    const category = await makeTestCategory()
    const name = `Integration Listing ${randomUUID()}`

    const submission = await submitListingCreate(listingPayload(category.id, name))
    pendingSubmissionIds.push(submission.id)

    const pendingBefore = await listPendingSubmissions()
    expect(pendingBefore.some((s) => s.id === submission.id)).toBe(true)

    await approveSubmission(submission.id)

    const { data: resource } = await getAdminClient()
      .from('resource')
      .select('*')
      .eq('name', name)
      .single()
    expect(resource).not.toBeNull()
    expect(resource.status).toBe('approved')
    expect(resource.category).toBe(category.id)

    const pendingAfter = await listPendingSubmissions()
    expect(pendingAfter.some((s) => s.id === submission.id)).toBe(false)
  })

  it('rejecting a create submission never creates a live resource', async () => {
    const category = await makeTestCategory()
    const name = `Integration Listing ${randomUUID()}`

    const submission = await submitListingCreate(listingPayload(category.id, name))
    pendingSubmissionIds.push(submission.id)

    await rejectSubmission(submission.id)

    const { data: resource } = await getAdminClient()
      .from('resource')
      .select('*')
      .eq('name', name)
      .maybeSingle()
    expect(resource).toBeNull()

    const pendingAfter = await listPendingSubmissions()
    expect(pendingAfter.some((s) => s.id === submission.id)).toBe(false)
  })

  it('approving a delete submission archives the resource rather than removing it', async () => {
    const category = await makeTestCategory()
    const name = `Integration Listing ${randomUUID()}`

    const createSub = await submitListingCreate(listingPayload(category.id, name))
    pendingSubmissionIds.push(createSub.id)
    await approveSubmission(createSub.id)

    const { data: created } = await getAdminClient()
      .from('resource')
      .select('id')
      .eq('name', name)
      .single()
    if (!created) throw new Error('Setup failed: created resource not found.')

    const deleteSub = await submitListingDelete(created.id, 'no longer in business', null)
    pendingSubmissionIds.push(deleteSub.id)
    await approveSubmission(deleteSub.id)

    const { data: archived } = await getAdminClient()
      .from('resource')
      .select('status')
      .eq('id', created.id)
      .single()
    expect(archived?.status).toBe('archived')

    // Archived listings never show in the public directory — the moderation
    // queue itself is the only place this round trip is visible.
    const pendingAfter = await listPendingSubmissions()
    expect(pendingAfter.some((s) => s.id === deleteSub.id)).toBe(false)
  })
})
