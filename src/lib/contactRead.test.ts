import { describe, expect, it } from 'vitest'
import { contactBoxName, contactFields, googleKeeps, listedContact, pageContacts, readContacts } from './contactRead'
import type { CategoryField } from './categories'

const mikvah = {
  hasPhone: true,
  detailFields: [
    { key: 'hours', label: 'Hours', type: 'hours' },
    { key: 'e', label: 'Email', type: 'text' },
    { key: 'womenTevillah', label: 'Women’s Tevillah', type: 'boolean' },
    { key: 'women_s_phone', label: 'Women’s Phone', type: 'tel', audienceKey: 'womenTevillah' },
    { key: 'women_s_email', label: 'Women’s Email', type: 'text', audienceKey: 'womenTevillah' },
    { key: 'menTevillah', label: 'Men’s Tevillah', type: 'boolean' },
    { key: 'men_s_phone', label: "Men's Phone", type: 'tel', audienceKey: 'menTevillah' },
  ] as CategoryField[],
}
const restaurant = { hasPhone: true, detailFields: [{ key: 'hours', label: 'Hours', type: 'hours' }] as CategoryField[] }

describe('which fields the website checks', () => {
  it('leaves out a phone Google keeps, never an email', () => {
    // Lower Merion, as it is on live (Oct 22).
    const lowerMerion = { phone: '(484) 808-5626', placeId: 'ChIJ', googleFields: ['name', 'hours', 'phone', 'website'], e: 'office@lmcmikvah.org' }
    expect(googleKeeps(lowerMerion, 'phone')).toBe(true)
    expect(contactFields(mikvah, lowerMerion).map((f) => f.key)).toEqual(['e'])
    expect(contactBoxName(contactFields(mikvah, lowerMerion))).toBe('Email')
  })

  it('checks the phone of a place Google has no match for, and a section’s only when it has that section', () => {
    expect(contactFields(mikvah, { phone: '(917) 991-1887' }).map((f) => f.key)).toEqual(['phone', 'e'])
    expect(contactFields(mikvah, { womenTevillah: true, menTevillah: true }).map((f) => f.key)).toEqual(['phone', 'e', 'women_s_phone', 'women_s_email', 'men_s_phone'])
    // A placeId without phone among Google's fields: the website's.
    expect(contactFields(restaurant, { placeId: 'x', googleFields: ['name', 'hours'] }).map((f) => f.key)).toEqual(['phone'])
    expect(contactFields({ ...restaurant, hasPhone: false }, {})).toEqual([])
  })

  it('gives the box as the listing has it, said the guide’s way, or none', () => {
    expect(listedContact(mikvah, { phone: '9179911887' })).toEqual({
      name: 'Contact',
      fields: [
        { key: 'phone', label: 'Phone', kind: 'phone', value: '(917) 991-1887' },
        { key: 'e', label: 'Email', kind: 'email', value: null },
      ],
    })
    expect(listedContact({ hasPhone: true, detailFields: [] }, { placeId: 'g', googleFields: ['phone'] })).toBeNull()
  })

  it('names the box for its one field, else Contact', () => {
    expect(contactBoxName(contactFields(restaurant, {}))).toBe('Phone')
    expect(contactBoxName(contactFields(mikvah, {}))).toBe('Contact')
  })
})

describe('reading a page’s phones and emails', () => {
  it('reads them in its words and its links, each once', () => {
    const got = pageContacts('Call 215.629.1995 or (215) 629-1995\nEmail info@leyvhair.org.', '<a href="tel:+1-267-225-2651">Call</a><a href="mailto:Office@LMCMikvah.org?subject=Hi">Write</a>')
    expect(got.phones).toEqual(['2156291995', '2672252651'])
    expect(got.emails).toEqual(['info@leyvhair.org', 'office@lmcmikvah.org'])
  })

  it('leaves out a fax, and an image named like an address', () => {
    expect(pageContacts('Phone: 929 666 1482 · Fax: 929-666-1483').phones).toEqual(['9296661482'])
    expect(pageContacts('logo@2x.png').emails).toEqual([])
  })
})

describe('setting them beside the listing', () => {
  it('says the same when the listing’s value is on the page, however it is written', () => {
    const page = pageContacts('929 666 1482')
    expect(readContacts(contactFields(restaurant, {}), { phone: '(929) 666-1482' }, page)).toEqual({ same: ['phone'], changes: {} })
  })

  it('proposes a changed number when one is gone and one new is there', () => {
    const page = pageContacts('Call us at 215-555-0100')
    expect(readContacts(contactFields(restaurant, {}), { phone: '(215) 629-1995' }, page)).toEqual({ same: [], changes: { phone: '(215) 555-0100' } })
  })

  it('says nothing when it can’t tell which number is the place’s', () => {
    const page = pageContacts('Office 215-555-0100. Catering 215-555-0199.')
    expect(readContacts(contactFields(restaurant, {}), { phone: '(215) 629-1995' }, page)).toEqual({ same: [], changes: {} })
  })

  it('fills an empty phone only when the listing has none of that kind', () => {
    const page = pageContacts('Call 215-555-0100')
    expect(readContacts(contactFields(restaurant, {}), {}, page).changes).toEqual({ phone: '(215) 555-0100' })
    // Moishe Zvi: no phone of its own, its sections' on the page, and one
    // more number: whose it is can't be told.
    const moisheZvi = { women_s_phone: '267.496.1990', men_s_phone: '267.738.8995', womenTevillah: true, menTevillah: true }
    const got = readContacts(contactFields(mikvah, moisheZvi), moisheZvi, pageContacts('267.738.8995 · 267.496.1990 · 215-555-0100'))
    expect(got).toEqual({ same: ['women_s_phone', 'men_s_phone'], changes: {} })
  })

  it('never counts a number Google keeps as a new one', () => {
    // Lower Merion's page gives its phone (Google's) and its email.
    const lowerMerion = { phone: '(484) 808-5626', placeId: 'ChIJ', googleFields: ['phone'], e: 'office@lmcmikvah.org' }
    const page = pageContacts('484-808-5626 office@lmcmikvah.org')
    expect(readContacts(contactFields(mikvah, lowerMerion), lowerMerion, page)).toEqual({ same: ['e'], changes: {} })
  })

  it('leaves an email be when the page has two the listing doesn’t know (Mei Shalva’s)', () => {
    const meiShalva = { phone: '(267) 225-2651', e: 'centercitymikvah@gmail.com' }
    const page = pageContacts('(267) 225-2651 support@philamikvah.org centercitymikvah@gmail.com')
    expect(readContacts(contactFields(mikvah, meiShalva), meiShalva, page)).toEqual({ same: ['phone', 'e'], changes: {} })
    const moved = pageContacts('(267) 225-2651 hello@philamikvah.org')
    expect(readContacts(contactFields(mikvah, meiShalva), meiShalva, moved)).toEqual({ same: ['phone'], changes: { e: 'hello@philamikvah.org' } })
  })
})
