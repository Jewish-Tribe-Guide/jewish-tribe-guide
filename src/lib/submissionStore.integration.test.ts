import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ResourceSubmission } from '@/types'
import { GOOGLE_SUBMITTER_NAME } from './activity'

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
  replacePendingSuggestion,
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

  // Oct 21: a shul's times are filed a part at a time (timesParts.ts), each
  // from the listing as it was read. Approved, a part goes on the listing
  // as it is then, so approving the Shabbos times can't undo the weekday
  // times approved a moment before.
  it('approving one part of a shul’s times keeps another part approved since it was read', async () => {
    const category = await makeTestCategory()
    const name = `Integration Shul ${randomUUID()}`
    const createSub = await submitListingCreate('philly', listingPayload(category.id, name))
    pendingSubmissionIds.push(createSub.id)
    await approveSubmission(createSub.id)
    const { data: created } = await getAdminClient().from('resource').select('id').eq('name', name).single()
    const weekday = { id: 'a', tefillah: 'shacharis', days: ['mon', 'tue', 'wed', 'thu', 'fri'], time: '6:45am' }
    const shabbos = { id: 'b', tefillah: 'shacharis', days: ['sat'], time: '9:00am' }
    await getAdminClient().from('resource').update({ details: { minyanim: [weekday, shabbos] } }).eq('id', created!.id)

    const source = (part: string) => ({ readBy: 'ai', from: 'its website', part: { part, field: 'minyanim' } })
    const file = async (minyanim: object[], part: string) => {
      const sub = await submitListingUpdate('philly', created!.id, { ...listingPayload(category.id, name), details: { minyanim }, source: source(part) } as ResourceSubmission, null, null)
      pendingSubmissionIds.push(sub.id)
      return sub
    }
    // Both read off the listing as it was: 6:45 weekdays, 9:00 Shabbos.
    const weekdays = await file([{ ...weekday, time: '7:00am' }, shabbos], 'weekday')
    const shabbosPart = await file([weekday, { ...shabbos, time: '8:30am' }], 'shabbos')
    await approveSubmission(weekdays.id)
    // And a new phone number, approved meanwhile, and a detail the listing
    // gained since the read (Oct 27: Lower Merion's hours, read with its week).
    const { data: mid } = await getAdminClient().from('resource').select('details').eq('id', created!.id).single()
    await getAdminClient().from('resource').update({ phone: '555-0199', details: { ...mid!.details, hours: 'Sun–Thu 9 AM–5 PM' } }).eq('id', created!.id)
    await approveSubmission(shabbosPart.id)

    const { data: after } = await getAdminClient().from('resource').select('details, phone').eq('id', created!.id).single()
    const times = (after!.details.minyanim as { days: string[]; time: string }[]).map((m) => `${m.days.join(',')} ${m.time}`).sort()
    expect(times).toEqual(['mon,tue,wed,thu,fri 7:00am', 'sat 8:30am'])
    expect(after!.phone).toBe('555-0199')
    expect(after!.details.hours).toBe('Sun–Thu 9 AM–5 PM')
  })

  // Oct 22: a mikvah's hours, the same way, a section at a time
  // (hoursSections.ts): using the women's hours never undoes men's hours
  // approved since they were read.
  it('approving one section of a mikvah’s hours keeps another section approved since it was read', async () => {
    const category = await makeTestCategory()
    const name = `Integration Mikvah ${randomUUID()}`
    const createSub = await submitListingCreate('philly', listingPayload(category.id, name))
    pendingSubmissionIds.push(createSub.id)
    await approveSubmission(createSub.id)
    const { data: created } = await getAdminClient().from('resource').select('id').eq('name', name).single()
    const listed = { women_s_hours: 'evenings', women_s_notes: 'By appointment.', men_s_hours: 'mornings', kept: 'yes' }
    await getAdminClient().from('resource').update({ details: listed }).eq('id', created!.id)

    const file = async (details: object, section: string, keys: string[]) => {
      const sub = await submitListingUpdate('philly', created!.id, { ...listingPayload(category.id, name), details: { ...listed, ...details }, source: { readBy: 'ai', from: 'its website', section: { section, keys } } } as ResourceSubmission, null, null)
      pendingSubmissionIds.push(sub.id)
      return sub
    }
    // Both read off the listing as it was.
    const men = await file({ men_s_hours: 'dawn' }, 'menTevillah', ['men_s_hours', 'men_s_notes'])
    const women = await file({ women_s_hours: 'late evenings' }, 'womenTevillah', ['women_s_hours', 'women_s_notes'])
    await approveSubmission(men.id)
    await approveSubmission(women.id)

    const { data: after } = await getAdminClient().from('resource').select('details').eq('id', created!.id).single()
    expect(after!.details).toMatchObject({ women_s_hours: 'late evenings', women_s_notes: 'By appointment.', men_s_hours: 'dawn', kept: 'yes' })
  })

  // Oct 22: a page's phone and email are a section too (contactRead.ts),
  // the phone the listing's own column: approving it sets the phone and
  // undoes nothing approved since; an admin's Edit of it sets theirs.
  it('approving a page’s phone sets the phone and keeps everything approved since it was read', async () => {
    const category = await makeTestCategory()
    const name = `Integration Food ${randomUUID()}`
    const createSub = await submitListingCreate('philly', { ...listingPayload(category.id, name), phone: '(215) 555-0100' })
    pendingSubmissionIds.push(createSub.id)
    await approveSubmission(createSub.id)
    const { data: created } = await getAdminClient().from('resource').select('id').eq('name', name).single()
    const listed = { kept: 'yes' }
    await getAdminClient().from('resource').update({ details: listed }).eq('id', created!.id)

    const contact = async (phone: string) => {
      const sub = await submitListingUpdate('philly', created!.id, { ...listingPayload(category.id, name), phone, details: listed, source: { readBy: 'ai', from: 'its website', section: { section: 'contact', keys: ['phone'] } } } as ResourceSubmission, null, null)
      pendingSubmissionIds.push(sub.id)
      return sub
    }
    const read = await contact('(215) 555-0123')
    // Approved meanwhile: a detail, from someone else.
    const other = await submitListingUpdate('philly', created!.id, { ...listingPayload(category.id, name), phone: '(215) 555-0100', details: { kept: 'changed since' } }, null, null)
    pendingSubmissionIds.push(other.id)
    await approveSubmission(other.id)
    await approveSubmission(read.id)
    const { data: after } = await getAdminClient().from('resource').select('details, phone').eq('id', created!.id).single()
    expect(after!.phone).toBe('(215) 555-0123')
    expect(after!.details).toMatchObject({ kept: 'changed since' })

    // Edit: the admin's number, not the page's.
    const edited = await contact('(215) 555-0199')
    await approveSubmission(edited.id, undefined, 'admin@example.org', { phone: '(215) 555-0177', details: {} })
    const { data: last } = await getAdminClient().from('resource').select('details, phone').eq('id', created!.id).single()
    expect(last!.phone).toBe('(215) 555-0177')
    expect(last!.details).toMatchObject({ kept: 'changed since' })
  })

  it('a pending suggestion is said again better in place; one decided meanwhile is left as decided', async () => {
    const category = await makeTestCategory()
    const name = `Integration Shul ${randomUUID()}`
    const createSub = await submitListingCreate('philly', listingPayload(category.id, name))
    pendingSubmissionIds.push(createSub.id)
    await approveSubmission(createSub.id)
    const { data: created } = await getAdminClient().from('resource').select('id').eq('name', name).single()
    const sub = await submitListingUpdate('philly', created!.id, { ...listingPayload(category.id, name), details: { kept: 'one' } }, 'first', null)
    pendingSubmissionIds.push(sub.id)

    expect(await replacePendingSuggestion('philly', sub.id, { ...listingPayload(category.id, name), details: { kept: 'two' } }, 'second')).toBe(true)
    const { data: replaced } = await getAdminClient().from('submission').select('payload, note, status').eq('id', sub.id).single()
    expect([replaced!.payload.details.kept, replaced!.note, replaced!.status]).toEqual(['two', 'second', 'pending'])

    await rejectSubmission(sub.id)
    expect(await replacePendingSuggestion('philly', sub.id, { ...listingPayload(category.id, name), details: { kept: 'three' } }, 'third')).toBe(false)
    expect(await replacePendingSuggestion('ues', sub.id, { ...listingPayload(category.id, name), details: { kept: 'three' } }, 'third')).toBe(false)
    const { data: decided } = await getAdminClient().from('submission').select('payload').eq('id', sub.id).single()
    expect(decided!.payload.details.kept).toBe('two')
  })

  // Oct 6: dishes read off a Food place's menu in the "+ Add" box are dated
  // "on its menu", with the link for "Full menu", as the Main dishes tab's
  // approval does; dishes added any other way are "seen". Since Oct 17 the
  // link is a person's to suggest too: a typed one replaces it, '' takes it
  // off, and an edit that doesn't mention it leaves it as it was.
  it('approving dishes read off a menu dates them on its menu and keeps the link; others are seen; a typed link replaces it', async () => {
    const category = await makeTestCategory()
    await getAdminClient()
      .from('category')
      .update({ fields: [{ key: 'dishes', label: 'Main dishes', type: 'tags', showCountInHeader: true, countLabel: 'main dish' }] })
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
    expect(afterTyped!.details.menuUrl).toBe('https://elsewhere.example/')

    const silent = { ...listingPayload(category.id, name), details: { dishes: ['Salads', 'Dosas', 'Kichari'] } }
    const silentSub = await submitListingUpdate('philly', created!.id, silent, null, null)
    pendingSubmissionIds.push(silentSub.id)
    await approveSubmission(silentSub.id)
    const { data: afterSilent } = await getAdminClient().from('resource').select('details').eq('id', created!.id).single()
    expect(afterSilent!.details.menuUrl).toBe('https://elsewhere.example/')

    const cleared = { ...listingPayload(category.id, name), details: { dishes: ['Salads', 'Dosas', 'Kichari'], menuUrl: '' } }
    const clearedSub = await submitListingUpdate('philly', created!.id, cleared, null, null)
    pendingSubmissionIds.push(clearedSub.id)
    await approveSubmission(clearedSub.id)
    const { data: afterCleared } = await getAdminClient().from('resource').select('details').eq('id', created!.id).single()
    expect(afterCleared!.details.menuUrl).toBeUndefined()
  })

  // Oct 17: a change an outside source made dates the listing "From
  // Refuah, Oct 20"; the next approval of anyone else's change takes it off.
  it('approving a change from a named outside source records it beside the date; the next approval clears it', async () => {
    const category = await makeTestCategory()
    const name = `Integration Listing ${randomUUID()}`
    const createSub = await submitListingCreate('philly', listingPayload(category.id, name))
    pendingSubmissionIds.push(createSub.id)
    await approveSubmission(createSub.id)
    const { data: created } = await getAdminClient().from('resource').select('id, details').eq('name', name).single()
    expect(created!.details.confirmedFrom).toBeUndefined()

    const fromRefuah = { ...listingPayload(category.id, name), phone: '555-0101', source: { readBy: 'ai', from: 'Refuah', named: 'Refuah' } }
    const refuahSub = await submitListingUpdate('philly', created!.id, fromRefuah as ResourceSubmission, null, null)
    pendingSubmissionIds.push(refuahSub.id)
    await approveSubmission(refuahSub.id)
    const { data: afterRefuah } = await getAdminClient().from('resource').select('details').eq('id', created!.id).single()
    expect(afterRefuah!.details.confirmedFrom).toEqual({ from: 'Refuah', at: afterRefuah!.details.confirmedAt })

    const byPerson = { ...listingPayload(category.id, name), phone: '555-0102' }
    const personSub = await submitListingUpdate('philly', created!.id, byPerson, null, null)
    pendingSubmissionIds.push(personSub.id)
    await approveSubmission(personSub.id)
    const { data: afterPerson } = await getAdminClient().from('resource').select('details').eq('id', created!.id).single()
    expect(afterPerson!.details.confirmedFrom).toBeUndefined()
    // A person's change: "Confirmed by community" (Oct 17).
    expect(afterPerson!.details.confirmedBy).toEqual({ by: 'edit', at: afterPerson!.details.confirmedAt })

    // The source's own approval carried none: "Confirmed by Refuah".
    expect(afterRefuah!.details.confirmedBy).toBeUndefined()

    // An admin's own change (the console's direct add) is a person's too
    // (Oct 18).
    const admin = 'integration-admin@example.org'
    const byAdmin = { ...listingPayload(category.id, name), phone: '555-0103' }
    const adminSub = await submitListingUpdate('philly', created!.id, byAdmin, null, { name: admin, email: admin })
    pendingSubmissionIds.push(adminSub.id)
    await approveSubmission(adminSub.id, undefined, admin)
    const { data: afterAdmin } = await getAdminClient().from('resource').select('details').eq('id', created!.id).single()
    expect(afterAdmin!.details.confirmedBy).toEqual({ by: 'edit', at: afterAdmin!.details.confirmedAt })
    expect(afterAdmin!.details.confirmedFrom).toBeUndefined()

    // Google's change (a closure it reports): "Checked with Google".
    const fromGoogle = { ...listingPayload(category.id, name), phone: '555-0104' }
    const googleSub = await submitListingUpdate('philly', created!.id, fromGoogle, null, { name: GOOGLE_SUBMITTER_NAME })
    pendingSubmissionIds.push(googleSub.id)
    await approveSubmission(googleSub.id)
    const { data: afterGoogle } = await getAdminClient().from('resource').select('details').eq('id', created!.id).single()
    expect(afterGoogle!.details.confirmedFrom).toEqual({ from: 'Google', at: afterGoogle!.details.confirmedAt })
    expect(afterGoogle!.details.confirmedBy).toBeUndefined()
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
