import { describe, expect, it } from 'vitest'
import { compareRefuah, refuahEntry, refuahFields, refuahHospitalId, refuahKey, refuahNote, type RefuahHospital } from './refuahWatch'

// HUP's record as Refuah's data service gave it on Oct 17, 2026, trimmed to
// what the watch reads.
const HUP: RefuahHospital = {
  _id: 'jx77h9d00qztqgbbe8e0rfj1r589mgf5',
  name: 'Hospital Of The University Of Pennsylvania HUP',
  liaisons: [{ info: 'Mrs. Schwartz', name: 'Bikur Cholim of Philadelphia', phone1: '+1 215-805-8668', phone2: '+1 610-389-1412' }],
  services: [
    { info: 'Directions: Pavilion Building Near The Cafeteria Across From The Patient Caregiver Center\n\nOrganization: Bikur Cholim of Philadelphia', name: '1st Floor', phone1: '+1 215-805-8668', type: 'pantry' },
    { info: 'Food Packages To Hospitals, Call To Arrange', name: 'Bikur Cholim of Philadelphia', phone1: '+1 215-805-8668', type: 'food_packages' },
    { info: 'Coordinated By: Malky Schwartz\r\nWeb: https://bikkurcholimphilly.org/hospitality/', name: 'Bikur Cholim of Philadelphia', phone1: '+1 215-805-8668', type: 'accommodations' },
    { info: 'Transportation Form To Doctors Appointments And Hospitals From Monroe', name: 'Gemach Hatzolah – Monroe', phone1: '+1 845-782-5376', type: 'transportations' },
    { info: 'Servicing: Monsey', name: 'Darchei Chesed', phone1: '+1 845-425-4070', type: 'transportations' },
    { email: 'bikurcholimphilly@gmail.com', info: 'Servicing Philadelphia', name: 'Bikur Cholim of Philadelphia', phone1: '+1 215-805-8668', type: 'transportations' },
    { info: 'Rides: to and from Boro Park for appointments and family members taking shifts', name: 'Chesed of Boro Park', phone1: '+1 718-431-0111', type: 'transportations' },
  ],
}

// HUP's listing on the dev database: read from Refuah's page by the AI
// reader on Oct 6, so reworded ("call to arrange."), names merged with
// directions, where-from pulled out.
const HUP_LISTING = {
  liaisons: [{ who: 'Mrs. Schwartz', name: 'Bikur Cholim of Philadelphia', phones: ['+1 215-805-8668', '+1 610-389-1412'] }],
  pantry: [{ who: 'Bikur Cholim of Philadelphia', name: '1st Floor, Pavilion Building Near The Cafeteria Across From The Patient Caregiver Center', phones: ['+1 215-805-8668'] }],
  food_packages: [{ name: 'Bikur Cholim of Philadelphia', note: 'Food packages to hospitals; call to arrange.', phones: ['+1 215-805-8668'] }],
  accommodations: [{ web: 'https://bikkurcholimphilly.org/hospitality/', who: 'Malky Schwartz', name: 'Bikur Cholim of Philadelphia', phones: ['+1 215-805-8668'] }],
  transportation: [
    { from: 'Monroe', name: 'Gemach Hatzolah – Monroe', note: 'Transportation form to doctors appointments and hospitals.', phones: ['+1 845-782-5376'] },
    { from: 'Monsey', name: 'Darchei Chesed', phones: ['+1 845-425-4070'] },
    { from: 'Philadelphia', name: 'Bikur Cholim of Philadelphia', email: 'bikurcholimphilly@gmail.com', phones: ['+1 215-805-8668'] },
    { from: 'Boro Park', name: 'Chesed of Boro Park', note: 'Rides to and from Boro Park for appointments and family members taking shifts.', phones: ['+1 718-431-0111'] },
  ],
}

const KEYS = new Set(['liaisons', 'pantry', 'food_packages', 'accommodations', 'transportation', 'miscellaneous'])
const FROM = new Set(['transportation'])
const hup = () => refuahFields(HUP, KEYS, FROM)

describe('refuahHospitalId', () => {
  it('reads a hospital’s own page, on either of Refuah’s addresses', () => {
    expect(refuahHospitalId('https://refuah.com/hospitals/jx77h9d00qztqgbbe8e0rfj1r589mgf5?q=Hospital')).toBe('jx77h9d00qztqgbbe8e0rfj1r589mgf5')
    expect(refuahHospitalId('https://refuah.lrbcol.org/hospitals/jx77h9d00qztqgbbe8e0rfj1r589mgf5/')).toBe('jx77h9d00qztqgbbe8e0rfj1r589mgf5')
  })

  it('isn’t fooled by a search, the home page, or another site', () => {
    expect(refuahHospitalId('https://refuah.com/?q=Hospital+of+the+University+of+Pennsylvania')).toBeNull()
    expect(refuahHospitalId('https://refuah.com/')).toBeNull()
    expect(refuahHospitalId('https://notrefuah.com/hospitals/jx77h9d00qztqgbbe8e0rfj1r589mgf5')).toBeNull()
    expect(refuahHospitalId('not a url')).toBeNull()
  })
})

describe('refuahEntry — Refuah’s “Label: value” lines', () => {
  it('directions go with the name, the organisation is who, a web line the website', () => {
    expect(refuahEntry(HUP.services![0])).toEqual({
      name: '1st Floor, Pavilion Building Near The Cafeteria Across From The Patient Caregiver Center',
      who: 'Bikur Cholim of Philadelphia',
      phones: ['+1 215-805-8668'],
    })
    expect(refuahEntry(HUP.services![2])).toMatchObject({ who: 'Malky Schwartz', web: 'https://bikkurcholimphilly.org/hospitality/' })
  })

  it('“Servicing” is where it’s from, with or without a colon, where the field says where from', () => {
    expect(refuahEntry(HUP.services![4], { from: true })).toMatchObject({ from: 'Monsey' })
    expect(refuahEntry(HUP.services![5], { from: true })).toMatchObject({ from: 'Philadelphia', email: 'bikurcholimphilly@gmail.com' })
    expect(refuahEntry(HUP.services![4])).toMatchObject({ note: 'Monsey' })
  })

  it('a liaison’s info is the person', () => {
    expect(refuahEntry(HUP.liaisons![0], { liaison: true })).toEqual({ name: 'Bikur Cholim of Philadelphia', who: 'Mrs. Schwartz', phones: ['+1 215-805-8668', '+1 610-389-1412'] })
  })
})

describe('compareRefuah', () => {
  // The whole point of comparing what people act on rather than words: the
  // guide's entries were reworded when they were read in, and none of that
  // is a difference. Against a word-for-word comparison every one would be.
  it('finds nothing where the guide has what Refuah has, however it’s worded', () => {
    expect(compareRefuah(HUP_LISTING, hup())).toEqual([])
  })

  it('a new entry on Refuah is suggested, added after the guide’s own', () => {
    const more = { ...HUP, services: [...HUP.services!, { name: 'Chai Lifeline', phone1: '+1 215-555-0100', info: 'Servicing: Lakewood', type: 'transportations' }] }
    const [diff] = compareRefuah(HUP_LISTING, refuahFields(more, KEYS, FROM), { transportation: 'Transportation' })
    expect(diff.key).toBe('transportation')
    expect(diff.after.map((e) => e.name)).toEqual(['Gemach Hatzolah – Monroe', 'Darchei Chesed', 'Bikur Cholim of Philadelphia', 'Chesed of Boro Park', 'Chai Lifeline'])
    expect(diff.lines).toEqual(['+ Transportation: From Lakewood: Chai Lifeline · (215) 555-0100'])
  })

  it('a changed phone, email or website is suggested on the guide’s entry, its wording kept', () => {
    const moved = { ...HUP, services: HUP.services!.map((s) => (s.type === 'food_packages' ? { ...s, phone1: '+1 215-805-9000', email: 'food@bcp.org' } : s)) }
    const [diff] = compareRefuah(HUP_LISTING, refuahFields(moved, KEYS, FROM), { food_packages: 'Food packages' })
    expect(diff.after).toEqual([{ name: 'Bikur Cholim of Philadelphia', note: 'Food packages to hospitals; call to arrange.', phones: ['+1 215-805-9000'], email: 'food@bcp.org' }])
    expect(diff.lines).toEqual(['Food packages, Bikur Cholim of Philadelphia: phone +1 215-805-8668 → +1 215-805-9000; email none → food@bcp.org'])
  })

  it('matches by a phone only one entry has, when the name was reworded', () => {
    const renamed = { ...HUP_LISTING, transportation: HUP_LISTING.transportation.map((e) => (e.name === 'Darchei Chesed' ? { ...e, name: 'Darchei Chesed (Monsey rides)' } : e)) }
    expect(compareRefuah(renamed, hup())).toEqual([])
  })

  it('removes nothing: an entry Refuah doesn’t have is kept and said on the card', () => {
    const extra = { ...HUP_LISTING, transportation: [...HUP_LISTING.transportation, { name: 'Philly Chesed Rides', phones: ['+1 215-555-0199'] }] }
    const more = { ...HUP, services: [...HUP.services!, { name: 'Chai Lifeline', phone1: '+1 215-555-0100', type: 'transportations' }] }
    const [diff] = compareRefuah(extra, refuahFields(more, KEYS, FROM))
    expect(diff.after.map((e) => e.name)).toContain('Philly Chesed Rides')
    expect(diff.notOnRefuah).toEqual(['Philly Chesed Rides'])
    expect(refuahNote('HUP', 'https://refuah.com/hospitals/x', [diff])).toContain('In the guide, not on Refuah (kept, not removed): Philly Chesed Rides')
  })

  it('an empty field in the guide takes Refuah’s entries', () => {
    const [diff] = compareRefuah({ ...HUP_LISTING, pantry: [] }, hup())
    expect(diff.key).toBe('pantry')
    expect(diff.after).toHaveLength(1)
  })
})

describe('refuahKey', () => {
  it('is the same for the same suggestion, and differs when Refuah’s does', () => {
    const a = refuahKey('l1', { pantry: HUP_LISTING.pantry })
    expect(refuahKey('l1', { pantry: structuredClone(HUP_LISTING.pantry) })).toBe(a)
    expect(refuahKey('l1', { pantry: [{ ...HUP_LISTING.pantry[0], phones: ['+1 215-000-0000'] }] })).not.toBe(a)
  })
})
