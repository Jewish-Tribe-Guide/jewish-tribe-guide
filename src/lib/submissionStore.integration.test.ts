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
  submitListingUpdate,
  approveSubmission,
  rejectSubmission,
  listPendingSubmissions,
  ReviewEditError,
  attachSubmitterEmail,
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
    await deleteCategory('philly', id)
  }
})

async function makeTestCategory() {
  const category = await createCategory('philly', { label: `Integration Test ${randomUUID().slice(0, 8)}` })
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

    const submission = await submitListingCreate('philly', listingPayload(category.id, name))
    pendingSubmissionIds.push(submission.id)

    const pendingBefore = await listPendingSubmissions('philly')
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

    const pendingAfter = await listPendingSubmissions('philly')
    expect(pendingAfter.some((s) => s.id === submission.id)).toBe(false)
  })

  // The opened card: an admin fixes a typo instead of rejecting. What goes
  // live is the fixed copy, and the submission keeps what was sent beside
  // who changed it.
  it('approving with an admin’s fix puts the fix live and records it on the submission', async () => {
    const category = await makeTestCategory()
    const sent = `Integration Listng ${randomUUID()}`
    const fixed = sent.replace('Listng', 'Listing')
    const submission = await submitListingCreate('philly', listingPayload(category.id, sent))
    pendingSubmissionIds.push(submission.id)

    await approveSubmission(submission.id, 'philly', 'admin@x.co', { ...listingPayload(category.id, fixed), category: 'someone-else' })

    const { data: resource } = await getAdminClient().from('resource').select('name, category').eq('name', fixed).single()
    expect(resource).toEqual({ name: fixed, category: category.id })
    const { data: row } = await getAdminClient().from('submission').select('payload, status').eq('id', submission.id).single()
    expect(row!.status).toBe('approved')
    expect(row!.payload.name).toBe(fixed)
    expect(row!.payload.reviewEdit).toMatchObject({ by: 'admin@x.co', fields: ['name'], asSent: { name: sent } })
  })

  it('refuses a fix that leaves the listing invalid, approving nothing', async () => {
    const category = await makeTestCategory()
    const name = `Integration Listing ${randomUUID()}`
    const submission = await submitListingCreate('philly', listingPayload(category.id, name))
    pendingSubmissionIds.push(submission.id)

    await expect(approveSubmission(submission.id, 'philly', 'admin@x.co', { ...listingPayload(category.id, name), address: '' })).rejects.toThrow(ReviewEditError)

    const { data: row } = await getAdminClient().from('submission').select('status, payload').eq('id', submission.id).single()
    expect(row!.status).toBe('pending')
    expect(row!.payload.address).toBe('123 Test St, Philadelphia, PA')
    const { data: resource } = await getAdminClient().from('resource').select('id').eq('name', name).maybeSingle()
    expect(resource).toBeNull()
  })

  // Approval is a moderator vouching for the listing, so it stamps confirmedAt
  // — the same field a visitor's "Mark as current" sets. Without it a listing
  // whose edit was just approved kept saying "Confirmed 8 months ago".
  // The "+ Add" box's email, asked once after its last Send (Oct 5): added
  // only to what it filed, read by AI, waiting, with no email yet.
  it('adds an email to the box’s own suggestions, and to nothing else', async () => {
    const category = await makeTestCategory()
    const read = { ...listingPayload(category.id, `Read ${randomUUID()}`), source: { readBy: 'ai', from: 'a message' } } as ResourceSubmission
    const fromBox = await submitListingCreate('philly', read)
    const byHand = await submitListingCreate('philly', listingPayload(category.id, `Typed ${randomUUID()}`))
    const hasEmail = await submitListingCreate('philly', { ...read, submittedBy: { email: 'first@x.co' } })
    pendingSubmissionIds.push(fromBox.id, byHand.id, hasEmail.id)

    expect(await attachSubmitterEmail('philly', [fromBox.id, byHand.id, hasEmail.id], 'me@x.co')).toBe(1)
    const { data } = await getAdminClient().from('submission').select('id, submitted_by').in('id', [fromBox.id, byHand.id, hasEmail.id])
    const by = Object.fromEntries((data ?? []).map((r) => [r.id, r.submitted_by]))
    expect(by[fromBox.id]).toEqual({ email: 'me@x.co' })
    expect(by[byHand.id]).toBeNull()
    expect(by[hasEmail.id]).toEqual({ email: 'first@x.co' })
    // Another community's id list reaches nothing.
    expect(await attachSubmitterEmail('ues', [fromBox.id], 'other@x.co')).toBe(0)
  })

  it('approving a create stamps the new listing as confirmed just now', async () => {
    const category = await makeTestCategory()
    const name = `Integration Listing ${randomUUID()}`
    const submission = await submitListingCreate('philly', listingPayload(category.id, name))
    pendingSubmissionIds.push(submission.id)
    const before = Date.now()

    await approveSubmission(submission.id)

    const { data: resource } = await getAdminClient().from('resource').select('details').eq('name', name).single()
    const stamp = Date.parse(resource!.details.confirmedAt)
    expect(stamp).toBeGreaterThanOrEqual(before - 1000)
    expect(stamp).toBeLessThanOrEqual(Date.now() + 1000)
  })

  it('approving an edit replaces an old confirmedAt with now, and keeps the listing’s other details', async () => {
    const category = await makeTestCategory()
    const name = `Integration Listing ${randomUUID()}`
    const createSub = await submitListingCreate('philly', listingPayload(category.id, name))
    pendingSubmissionIds.push(createSub.id)
    await approveSubmission(createSub.id)
    const { data: created } = await getAdminClient().from('resource').select('id').eq('name', name).single()

    const longAgo = '2020-01-01T00:00:00.000Z'
    await getAdminClient().from('resource').update({ details: { confirmedAt: longAgo, kept: 'yes' } }).eq('id', created!.id)

    const edit = { ...listingPayload(category.id, name), phone: '555-0100', details: { kept: 'yes' } }
    const updateSub = await submitListingUpdate('philly', created!.id, edit, null, null)
    pendingSubmissionIds.push(updateSub.id)
    const before = Date.now()
    await approveSubmission(updateSub.id)

    const { data: after } = await getAdminClient().from('resource').select('details, phone').eq('id', created!.id).single()
    expect(after!.phone).toBe('555-0100')
    expect(after!.details.kept).toBe('yes')
    expect(Date.parse(after!.details.confirmedAt)).toBeGreaterThanOrEqual(before - 1000)
  })

  // Oct 6: dishes read off a Food place's menu in the "+ Add" box are dated
  // "on its menu", with the link for "Full menu", as the Main dishes tab's
  // approval does; dishes added any other way are "seen", and the link
  // stays as it was.
  it('approving dishes read off a menu dates them on its menu and keeps the link; others are seen', async () => {
    const category = await makeTestCategory()
    await getAdminClient()
      .from('category')
      .update({ fields: [{ key: 'dishes', label: 'Main dishes', type: 'tags', countLabel: 'main dish' }] })
      .eq('community_id', 'philly')
      .eq('id', category.id)
    const name = `Integration Listing ${randomUUID()}`
    const createSub = await submitListingCreate('philly', { ...listingPayload(category.id, name), details: { dishes: ['Salads'] } })
    pendingSubmissionIds.push(createSub.id)
    await approveSubmission(createSub.id)
    const { data: created } = await getAdminClient().from('resource').select('id').eq('name', name).single()

    const menu = { ...listingPayload(category.id, name), details: { dishes: ['Salads', 'Dosas'] }, source: { readBy: 'ai', from: 'a message', menu: { url: 'https://saysheate.co/menu/' } } }
    const menuSub = await submitListingUpdate('philly', created!.id, menu as ResourceSubmission, null, null)
    pendingSubmissionIds.push(menuSub.id)
    const before = Date.now()
    await approveSubmission(menuSub.id)
    const { data: afterMenu } = await getAdminClient().from('resource').select('details').eq('id', created!.id).single()
    expect(Date.parse(afterMenu!.details.itemMenu.dishes.Dosas)).toBeGreaterThanOrEqual(before - 1000)
    expect(afterMenu!.details.itemSeen?.dishes?.Dosas).toBeUndefined()
    expect(afterMenu!.details.menuUrl).toBe('https://saysheate.co/menu/')

    const typed = { ...listingPayload(category.id, name), details: { dishes: ['Salads', 'Dosas', 'Kichari'], menuUrl: 'https://elsewhere.example/' } }
    const typedSub = await submitListingUpdate('philly', created!.id, typed, null, null)
    pendingSubmissionIds.push(typedSub.id)
    await approveSubmission(typedSub.id)
    const { data: afterTyped } = await getAdminClient().from('resource').select('details').eq('id', created!.id).single()
    expect(afterTyped!.details.itemSeen.dishes.Kichari).toBeTruthy()
    expect(afterTyped!.details.itemMenu.dishes.Kichari).toBeUndefined()
    expect(afterTyped!.details.itemMenu.dishes.Dosas).toBe(afterMenu!.details.itemMenu.dishes.Dosas)
    expect(afterTyped!.details.menuUrl).toBe('https://saysheate.co/menu/')
  })

  it('archiving a listing (approved removal) does not stamp it confirmed', async () => {
    const category = await makeTestCategory()
    const name = `Integration Listing ${randomUUID()}`
    const createSub = await submitListingCreate('philly', listingPayload(category.id, name))
    pendingSubmissionIds.push(createSub.id)
    await approveSubmission(createSub.id)
    const { data: created } = await getAdminClient().from('resource').select('id').eq('name', name).single()
    const longAgo = '2020-01-01T00:00:00.000Z'
    await getAdminClient().from('resource').update({ details: { confirmedAt: longAgo } }).eq('id', created!.id)

    const deleteSub = await submitListingDelete('philly', created!.id, 'closed', null)
    pendingSubmissionIds.push(deleteSub.id)
    await approveSubmission(deleteSub.id)

    const { data: after } = await getAdminClient().from('resource').select('details').eq('id', created!.id).single()
    expect(after!.details.confirmedAt).toBe(longAgo)
  })

  it('rejecting a create submission never creates a live resource', async () => {
    const category = await makeTestCategory()
    const name = `Integration Listing ${randomUUID()}`

    const submission = await submitListingCreate('philly', listingPayload(category.id, name))
    pendingSubmissionIds.push(submission.id)

    await rejectSubmission(submission.id)

    const { data: resource } = await getAdminClient()
      .from('resource')
      .select('*')
      .eq('name', name)
      .maybeSingle()
    expect(resource).toBeNull()

    const pendingAfter = await listPendingSubmissions('philly')
    expect(pendingAfter.some((s) => s.id === submission.id)).toBe(false)
  })

  it('approving a delete submission archives the resource rather than removing it', async () => {
    const category = await makeTestCategory()
    const name = `Integration Listing ${randomUUID()}`

    const createSub = await submitListingCreate('philly', listingPayload(category.id, name))
    pendingSubmissionIds.push(createSub.id)
    await approveSubmission(createSub.id)

    const { data: created } = await getAdminClient()
      .from('resource')
      .select('id')
      .eq('name', name)
      .single()
    if (!created) throw new Error('Setup failed: created resource not found.')

    const deleteSub = await submitListingDelete('philly', created.id, 'no longer in business', null)
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
    const pendingAfter = await listPendingSubmissions('philly')
    expect(pendingAfter.some((s) => s.id === deleteSub.id)).toBe(false)
  })
})
