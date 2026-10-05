import { describe, expect, it } from 'vitest'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { changeableFields, fieldsEdit, readFieldChanges } from './fieldChanges'

// The box's "any field" reading (Oct 5): the hechsher, hours, phone, website
// and the rest, from what someone wrote, against the listing as it is now.

const food = makeCategory({
  id: 'restaurant',
  label: 'Food',
  detailFields: [
    { key: 'hours', label: 'Hours', type: 'hours' },
    { key: 'website', label: 'Website', type: 'url' },
    { key: 'kosherCert', label: 'Kosher Certification', type: 'select', options: ['IKC', 'Keystone-K', 'OU'].map((v) => ({ value: v, label: v })) },
    { key: 'kosherPartial', label: 'Everything here is kosher', type: 'boolean' },
    { key: 'dishes', label: 'Main dishes', type: 'tags' },
    { key: 'photo', label: 'Photo', type: 'image' },
  ],
})
const mikvah = makeCategory({ id: 'mikvah', label: 'Mikvah', detailFields: [{ key: 'women_s_hours', label: 'Women’s Hours', type: 'hours' }] })
const day = (open: string, close: string) => ({ open, close })
const week = { sun: day('11:00', '21:00'), mon: null, tue: day('11:00', '21:00'), wed: day('11:00', '21:00'), thu: day('11:00', '21:00'), fri: day('11:00', '15:00'), sat: null }
const sayShe = makeListing({ id: 'say', name: 'Say She Ate', category: 'restaurant', address: '1408 South St', phone: '(215) 650-7577', hours: week, kosherCert: 'IKC', website: 'https://old.example' })
const hours = (h: Partial<{ days: string[] | 'all'; open: string | null; close: string | null; closed: boolean; when: 'every_week' | 'one_day' | 'unclear' }>) => ({
  days: ['wed'],
  open: null,
  close: null,
  closed: false,
  when: 'every_week' as const,
  ...h,
}) as never

describe('changeableFields', () => {
  it('is the name, address, phone and every field a person types or picks, never items, times or photos', () => {
    expect(changeableFields(food).map((f) => f.key)).toEqual(['name', 'address', 'phone', 'hours', 'website', 'kosherCert', 'kosherPartial'])
    expect(changeableFields(makeCategory({ hasAddress: false, hasPhone: false })).map((f) => f.key)).toEqual(['name'])
  })
})

describe('readFieldChanges', () => {
  it('changes a hechsher to one of the category’s choices, however it was written', () => {
    const r = readFieldChanges(food, sayShe, [{ key: 'kosherCert', value: 'keystone k' }])
    expect(r.values).toEqual({ kosherCert: 'Keystone-K' })
    expect(r.lines).toEqual(['Kosher Certification: IKC → Keystone-K'])
  })

  it('keeps a choice the category doesn’t have as a note for the admin, never in the field', () => {
    const r = readFieldChanges(food, sayShe, [{ key: 'kosherCert', value: 'Chof-K' }])
    expect(r.values).toEqual({})
    expect(r.notes).toEqual(['Kosher Certification: “Chof-K” isn’t one of the guide’s choices'])
  })

  it('formats a phone and a website the way the forms do, and says what they were', () => {
    const r = readFieldChanges(food, sayShe, [
      { key: 'phone', value: '215-555-0199' },
      { key: 'website', value: 'sayshe.com' },
    ])
    expect(r.values).toEqual({ phone: '(215) 555-0199', website: 'https://sayshe.com' })
    expect(r.lines).toEqual(['Phone: (215) 650-7577 → (215) 555-0199', 'Website: https://old.example → https://sayshe.com'])
  })

  it('changes one day of the week, keeping the rest, a line for the day', () => {
    const r = readFieldChanges(food, sayShe, [{ key: 'hours', hours: hours({ days: ['wed'], close: '15:00' }) }])
    expect(r.values.hours).toEqual({ ...week, wed: day('11:00', '15:00') })
    expect(r.lines).toEqual(['Hours, Wednesday: 11:00 AM–9:00 PM → 11:00 AM–3:00 PM'])
    expect(r.askWhen).toBeNull()
  })

  it('asks “every Wednesday, or just this one?” when a day is named and it wasn’t said', () => {
    const r = readFieldChanges(food, sayShe, [{ key: 'hours', hours: hours({ close: '15:00', when: 'unclear' }) }])
    expect(r.askWhen).toMatchObject({ key: 'hours', question: 'Every Wednesday, or just this one?' })
    expect(r.askWhen!.oneDay).toContain('one day only: closes 3:00 PM')
  })

  it('takes “until 4 now”, with no day named, as every day it’s open, from now on', () => {
    const r = readFieldChanges(food, sayShe, [{ key: 'hours', hours: hours({ days: 'all', close: '16:00', when: 'unclear' }) }])
    expect(r.askWhen).toBeNull()
    expect(r.values.hours).toMatchObject({ sun: day('11:00', '16:00'), mon: null, fri: day('11:00', '16:00'), sat: null })
  })

  it('closes a day', () => {
    const r = readFieldChanges(food, sayShe, [{ key: 'hours', hours: hours({ days: ['sun'], closed: true }) }])
    expect(r.lines).toEqual(['Hours, Sunday: 11:00 AM–9:00 PM → Closed'])
  })

  // A one-day change ("closing early this Friday") has nowhere to go in a
  // week's hours: the admin sees it as a note, and the hours stay.
  it('sends a one-day change to the admin as a note, changing nothing', () => {
    const r = readFieldChanges(food, sayShe, [{ key: 'hours', hours: hours({ days: ['fri'], close: '14:00', when: 'one_day' }) }])
    expect(r.values).toEqual({})
    expect(r.notes[0]).toContain('Hours, Friday, one day only: closes 2:00 PM')
  })

  // Lower Merion's women's hours are 8:30–10:30 PM on dev; "goes until 4pm
  // now" isn't about those, and 8:30 PM–4:00 PM is no day at all.
  it('keeps one time that doesn’t fit the hours listed as a note', () => {
    const lm = makeListing({ category: 'mikvah', women_s_hours: { mon: day('20:30', '22:30'), sun: null } })
    const r = readFieldChanges(mikvah, lm, [{ key: 'women_s_hours', hours: hours({ days: 'all', close: '16:00' }) }])
    expect(r.values).toEqual({})
    expect(r.notes).toEqual(['Women’s Hours, every day: closes 4:00 PM, which doesn’t fit the hours listed (8:30 PM–10:30 PM)'])
  })

  it('says which days isn’t known when a place has no hours and none are named', () => {
    const r = readFieldChanges(mikvah, makeListing({ category: 'mikvah' }), [{ key: 'women_s_hours', hours: hours({ days: 'all', close: '16:00' }) }])
    expect(r.notes).toEqual(['Women’s Hours: closes 4:00 PM, but which days isn’t said'])
  })

  it('changes nothing it already says, and nothing it isn’t a field of', () => {
    const r = readFieldChanges(food, sayShe, [
      { key: 'kosherCert', value: 'IKC' },
      { key: 'dishes', value: 'Pizza' },
      { key: 'nope', value: 'x' },
    ])
    expect(r.values).toEqual({})
    expect(r.held).toEqual(['Kosher Certification: already says that'])
  })
})

describe('fieldsEdit', () => {
  it('files only what a person can change, checked again, and only what differs', () => {
    const { submission, lines } = fieldsEdit(food, sayShe, {
      kosherCert: 'Keystone-K',
      website: 'https://old.example',
      dishes: ['Pizza'],
      googleSyncedAt: 'now',
      kosherPartial: 'yes',
      hours: { wed: { open: '11:00', close: '99:00' } },
    })
    expect(lines).toEqual(['Kosher Certification: IKC → Keystone-K'])
    expect(submission.details).toMatchObject({ kosherCert: 'Keystone-K', website: 'https://old.example', hours: week })
    expect(submission.details).not.toHaveProperty('googleSyncedAt')
  })

  it('moves the name, phone and address, dropping the old map pin with the address', () => {
    const withPin = makeListing({ ...sayShe, geo: { lat: 1, lng: 2 } })
    const { submission } = fieldsEdit(food, withPin, { name: 'SayShe Ate', address: '1500 South St', phone: '2155550199' })
    expect(submission).toMatchObject({ name: 'SayShe Ate', address: '1500 South St', phone: '(215) 555-0199', geo: null })
  })
})
