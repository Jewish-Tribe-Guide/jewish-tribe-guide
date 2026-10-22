import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import { boxOf, boxPill, contactBoxes, contactRows } from './hospitalBoxes'

// The hospital category as dev has it (Oct 22).
const HOSPITAL = makeCategory({
  id: 'hospital',
  detailFields: [
    { key: 'r', label: 'Refuah Link', type: 'url' },
    { key: 'liaisons', label: 'Liaisons', type: 'contacts' },
    { key: 'pantry', label: 'Pantry', type: 'contacts' },
    { key: 'food_packages', label: 'Food packages', type: 'contacts' },
    { key: 'accommodations', label: 'Accommodations', type: 'contacts' },
    { key: 'transportation', label: 'Transportation', type: 'contacts', entryFrom: true },
    { key: 'miscellaneous', label: 'Miscellaneous', type: 'contacts' },
    { key: 'sukkah', label: 'Sukkah', type: 'textarea' },
  ],
  listingParts: {
    boxes: [
      { title: 'Who to call', fields: ['liaisons'] },
      { title: 'Kosher food', fields: ['pantry', 'food_packages'] },
      { title: 'A place to stay', fields: ['accommodations'] },
      { title: 'Rides', fields: ['transportation'] },
      { title: 'Also', fields: ['miscellaneous'] },
    ],
  },
})

describe('contactBoxes', () => {
  it('is the listing’s own boxes, in its order, each with its lists of contacts', () => {
    expect(contactBoxes(HOSPITAL, {})).toEqual([
      { title: 'Who to call', keys: ['liaisons'] },
      { title: 'Kosher food', keys: ['pantry', 'food_packages'] },
      { title: 'A place to stay', keys: ['accommodations'] },
      { title: 'Rides', keys: ['transportation'] },
      { title: 'Also', keys: ['miscellaneous'] },
    ])
  })

  it('a list in no box is a box of its own, under its label, as the listing shows it', () => {
    const loose = makeCategory({ detailFields: [{ key: 'liaisons', label: 'Liaisons', type: 'contacts' }] })
    expect(contactBoxes(loose, {})).toEqual([{ title: 'Liaisons', keys: ['liaisons'] }])
    expect(boxOf([], 'pantry', 'Pantry')).toEqual({ title: 'Pantry', keys: ['pantry'] })
  })
})

// HUP's rides as the drawing has them (Oct 21).
const RIDES = [
  { from: 'Monroe', name: 'Gemach Hatzolah – Monroe', phones: ['+1 845-782-5376'] },
  { from: 'Monsey', name: 'Darchei Chesed', phones: ['+1 845-425-4070'] },
  { from: 'Philadelphia', name: 'Bikur Cholim of Philadelphia', phones: ['+1 215-805-8668'] },
  { from: 'Boro Park', name: 'Chesed of Boro Park', phones: ['+1 718-431-0111'] },
]

describe('contactRows', () => {
  it('marks each entry the same, changed beside what it was, or going, then the ones Refuah adds', () => {
    const next = [RIDES[0], { ...RIDES[1], phones: ['+1 845-555-0118'] }, RIDES[2], { from: 'Lakewood', name: 'Lakewood rides', phones: ['+1 732-555-0100'] }]
    const rows = contactRows(RIDES, next)
    expect(rows.map((r) => [r.name, r.mark])).toEqual([
      ['Gemach Hatzolah – Monroe', 'same'],
      ['Darchei Chesed', 'changed'],
      ['Bikur Cholim of Philadelphia', 'same'],
      ['Chesed of Boro Park', 'gone'],
      ['Lakewood rides', 'new'],
    ])
    expect(rows[1]).toMatchObject({ right: '(845) 555-0118', was: '(845) 425-4070', sub: 'From Monsey' })
    expect(boxPill(rows)).toBe('3 updates')
  })

  it('a box of one kind of update says which', () => {
    expect(boxPill(contactRows(RIDES, [...RIDES, { name: 'Lakewood rides' }]))).toBe('1 new')
    expect(boxPill(contactRows(RIDES, RIDES.map((e) => ({ ...e, phones: ['+1 215-555-0000'] }))))).toBe('4 changes')
    expect(boxPill(contactRows(RIDES, RIDES.slice(0, 3)))).toBe('1 not on Refuah')
  })

  it('a changed email or website is shown beside what it was too; a box the same is unmarked', () => {
    const [r] = contactRows([{ name: 'BCP', email: 'a@b.org' }], [{ name: 'BCP', email: 'c@d.org' }])
    expect(r).toMatchObject({ mark: 'changed', right: 'c@d.org', was: 'a@b.org', sub: '' })
    expect(contactRows(RIDES).every((x) => x.mark === 'same')).toBe(true)
  })

  // Bikur Cholim's row on the drawing: its email under the name, its phone
  // on the right; with no phone, the email is the right side instead.
  it('an email is under the name when phones are on the right', () => {
    const bcp = { from: 'Philadelphia', name: 'Bikur Cholim of Philadelphia', email: 'bikurcholimphilly@gmail.com', phones: ['+1 215-805-8668'] }
    expect(contactRows([bcp])[0]).toMatchObject({ sub: 'From Philadelphia · bikurcholimphilly@gmail.com', right: '(215) 805-8668' })
    expect(contactRows([{ ...bcp, phones: [] }])[0]).toMatchObject({ sub: 'From Philadelphia', right: 'bikurcholimphilly@gmail.com' })
    expect(contactRows([bcp], [{ ...bcp, phones: ['+1 215-555-0000'] }])[0]).toMatchObject({ sub: 'From Philadelphia · bikurcholimphilly@gmail.com', was: '(215) 805-8668' })
  })
})
