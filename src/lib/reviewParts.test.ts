import { describe, expect, it } from 'vitest'
import { approvingPart, leavingPart, reviewParts } from './reviewParts'
import { onListingNow } from './editedFields'
import type { CategoryConfig, CategoryField } from './categories'
import type { Minyan } from './davening'
import type { ResourceRow, ResourceSubmission } from '@/types'

const FIELDS: CategoryField[] = [
  { key: 'kosher', label: 'Kosher', type: 'tags' },
  { key: 'minyanim', label: 'Minyanim', type: 'minyanim' },
]

const shacharis: Minyan = { id: 's', tefillah: 'shacharis', days: ['mon', 'tue', 'wed', 'thu', 'fri'], time: '7:00am' }
const shabbos: Minyan = { id: 'b', tefillah: 'shacharis', days: ['sat'], time: '9:00am' }

const row = (details: Record<string, unknown> = {}): ResourceRow =>
  ({ id: 'r1', category: 'shul', name: 'Sons of Israel', anchor_id: 'community', distance: 0, address: '1 Main St', phone: '(215) 555-0100', details: { minyanim: [shacharis, shabbos], ...details } }) as unknown as ResourceRow

const sentFrom = (r: ResourceRow, over: Partial<ResourceSubmission> = {}): ResourceSubmission => ({
  category: r.category,
  name: r.name,
  anchorId: r.anchor_id,
  distance: null,
  address: r.address ?? '',
  phone: r.phone ?? '',
  details: { ...r.details },
  ...over,
})

// One person's change to a shul: its phone, and both boxes of its times.
const listed = row()
const sent = sentFrom(listed, {
  phone: '(215) 555-0199',
  details: { ...listed.details, minyanim: [{ ...shacharis, time: '6:45am' }, { ...shabbos, time: '8:45am' }] },
  editedFields: ['phone', 'minyanim', 'minyanim_schedules'],
})

describe('reviewParts', () => {
  it('a field is a part, and a shul’s usual times a part per box', () => {
    expect(reviewParts(listed, sent, FIELDS).map((p) => p.label)).toEqual(['Phone', 'Usual weekday times', 'Usual Shabbos times'])
  })

  it('approving one box puts only it on the listing; the other is still waiting after', () => {
    const [, weekday] = reviewParts(listed, sent, FIELDS)
    const approved = onListingNow(approvingPart(sent, listed, weekday, FIELDS), listed, FIELDS)
    expect(approved.phone).toBe(listed.phone)
    expect(approved.details.minyanim).toEqual([{ ...shacharis, time: '6:45am' }, shabbos])

    // The listing as it is once that's approved: Shabbos's and the phone still differ.
    const after = row({ minyanim: approved.details.minyanim })
    expect(reviewParts(after, onListingNow(sent, after, FIELDS), FIELDS).map((p) => p.label)).toEqual(['Phone', 'Usual Shabbos times'])
  })

  it('leaving one takes it out of the change, the rest still proposed', () => {
    const [phone, , shabbosBox] = reviewParts(listed, sent, FIELDS)
    const noPhone = leavingPart(sent, listed, phone, FIELDS)
    expect(reviewParts(listed, onListingNow(noPhone, listed, FIELDS), FIELDS).map((p) => p.label)).toEqual(['Usual weekday times', 'Usual Shabbos times'])
    const noShabbos = leavingPart(noPhone, listed, shabbosBox, FIELDS)
    expect(reviewParts(listed, onListingNow(noShabbos, listed, FIELDS), FIELDS).map((p) => p.label)).toEqual(['Usual weekday times'])
  })

  it('a change filed before edits recorded their fields is left a part at a time too', () => {
    const old = { ...sent, editedFields: undefined }
    const [phone] = reviewParts(listed, old, FIELDS)
    const left = leavingPart(old, listed, phone, FIELDS)
    expect(left.phone).toBe(listed.phone)
    expect(reviewParts(listed, left, FIELDS).map((p) => p.label)).toEqual(['Usual weekday times', 'Usual Shabbos times'])
  })

  it('a tags field’s “sometimes” goes with it', () => {
    const r = row({ kosher: ['Keystone-K'] })
    const s = sentFrom(r, { details: { ...r.details, kosher: ['OU'], kosher_sometimes: ['OU'] }, editedFields: ['kosher', 'kosher_sometimes'] })
    const [kosher] = reviewParts(r, s, FIELDS)
    expect(approvingPart(s, r, kosher, FIELDS).editedFields).toEqual(['kosher', 'kosher_sometimes'])
    expect(leavingPart(s, r, kosher, FIELDS).editedFields).toEqual([])
  })
})

// R5Link: a hechsher and its certificate's link sit in one row of the
// listing's editor, "Kosher", so they're one part, answered together.
describe('reviewParts, by the editor’s rows', () => {
  const FOOD = {
    id: 'restaurant',
    label: 'Food',
    detailFields: [
      { key: 'kosherCert', label: 'Kosher Certification', type: 'select', renderAs: 'badge', caveat: { flagField: 'kosherPartial', noteField: 'kosherNote' } },
      { key: 'k', label: 'Kosher Certification URL', type: 'url' },
      { key: 'phoneNote', label: 'Phone note', type: 'text' },
    ],
  } as unknown as CategoryConfig
  const place = { ...row({ kosherCert: ['Keystone-K'], k: 'https://keystone-k.org' }), category: 'restaurant' } as ResourceRow
  const change = sentFrom(place, { phone: '(215) 555-0199', details: { ...place.details, kosherCert: ['IKC'], k: 'https://mekorhabracha.org/p' }, editedFields: ['phone', 'kosherCert', 'k'] })

  it('a hechsher and its link are one part, Kosher', () => {
    const parts = reviewParts(place, change, FOOD)
    expect(parts.map((p) => p.label)).toEqual(['Phone', 'Kosher'])
    expect(parts[1].keys).toEqual(['kosherCert', 'k'])
  })

  it('approving it puts both on; leaving it takes both out', () => {
    const kosher = reviewParts(place, change, FOOD)[1]
    const on = onListingNow(approvingPart(change, place, kosher, FOOD.detailFields), place, FOOD.detailFields)
    expect(on.details).toMatchObject({ kosherCert: ['IKC'], k: 'https://mekorhabracha.org/p' })
    expect(on.phone).toBe(place.phone)
    const left = leavingPart(change, place, kosher, FOOD.detailFields)
    expect(left.editedFields).toEqual(['phone'])
  })

  it('without the category, a field each, as before', () => {
    expect(reviewParts(place, change, FOOD.detailFields).map((p) => p.label)).toEqual(['Phone', 'Kosher Certification', 'Kosher Certification URL'])
  })
})
