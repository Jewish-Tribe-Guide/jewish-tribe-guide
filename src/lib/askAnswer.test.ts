import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import type { DirectoryResource } from '@/types'
import { searchAsk } from './askSearch'
import { answerFor, type AnswerSchedule } from './askAnswer'
import type { MinyanSlot } from './upcomingDavening'

const synagogue = makeCategory({
  id: 'synagogue',
  label: 'Synagogue',
  pluralLabel: 'Synagogues',
  detailFields: [{ key: 'denomination', label: 'Denomination', type: 'text' }],
})
const grocery = makeCategory({
  id: 'grocery',
  label: 'Grocery Store',
  pluralLabel: 'Grocery Stores',
  detailFields: [{ key: 'm', label: 'Kosher items', type: 'tags' }],
})
const restaurant = makeCategory({
  id: 'restaurant',
  label: 'Food Establishment',
  pluralLabel: 'Food Establishments',
  detailFields: [{ key: 'hours', label: 'Hours', type: 'hours' }],
})
const hospital = makeCategory({ id: 'hospital', label: 'Hospital', pluralLabel: 'Hospitals' })
const categories = [synagogue, grocery, restaurant, hospital]

function listing(category: string, id: string, name: string, lat: number, details: Record<string, unknown> = {}): DirectoryResource {
  return { id, category, name, anchorId: 'community', distance: 0, address: '', geo: { lat, lng: -75.17 }, ...details }
}

const mekor = listing('synagogue', 'mekor', 'Mekor Habracha', 39.95, { denomination: 'Orthodox (Ashkenazi)' })
const shtiebel = listing('synagogue', 'shtiebel', 'South Philly Shtiebel', 39.93, { denomination: 'Orthodox (Ashkenazi)' })
const bethZion = listing('synagogue', 'bz', 'Temple Beth Zion', 39.951, { denomination: 'Conservative' })
const shoprite = listing('grocery', 'shoprite', 'ShopRite', 39.93, { m: ['Chalav Yisroel Milk', 'Challah'] })
const giant = listing('grocery', 'giant', 'GIANT', 39.94, { m: ['Wine'], m_sometimes: ['Challah'] })
const hup = listing('hospital', 'hup', 'Hospital of the University of Pennsylvania', 39.9496)
const cookies = listing('restaurant', 'cookies', 'Insomnia Cookies', 39.952)
const listings = [mekor, shtiebel, bethZion, shoprite, giant, hup, cookies]

const slot = (shul: DirectoryResource, tefillah: MinyanSlot['tefillah'], h: number, m = 0): MinyanSlot => ({
  shulId: shul.id,
  shulName: shul.name,
  shulGeo: shul.geo,
  tefillah,
  time: '',
  minutes: h * 60 + m,
})
// A weekday: morning Shacharis, afternoon Mincha, evening Maariv, and a
// combined Mincha & Maariv at the Conservative shul.
const today = [
  slot(mekor, 'shacharis', 7),
  slot(shtiebel, 'shacharis', 6, 45),
  slot(mekor, 'mincha', 13, 30),
  slot(bethZion, 'mincha_maariv', 18, 30),
  slot(shtiebel, 'maariv', 19, 15),
  slot(mekor, 'maariv', 21, 0),
].sort((a, b) => a.minutes - b.minutes)
const tomorrow = [slot(shtiebel, 'shacharis', 6, 45), slot(mekor, 'shacharis', 7), slot(shtiebel, 'maariv', 19, 15)]
const at = (h: number, m = 0): AnswerSchedule => ({ today, tomorrow, nowMinutes: h * 60 + m })

const ask = (input: string, schedule: AnswerSchedule | null = null) =>
  answerFor(searchAsk(listings, categories, input), { schedule })

describe('answerFor — minyan questions', () => {
  it('"next minyan at an orthodox shul": the next one at an Orthodox shul only', () => {
    // 6:00 PM: Beth Zion's 6:30 is next overall, but it's Conservative.
    const answer = ask("what's the next minyan at an orthodox shul", at(18))
    expect(answer?.text).toBe('Next minyan: 7:15 PM, South Philly Shtiebel. 1 more today.')
    expect(answer?.rows.map((r) => r.shulName)).toEqual(['South Philly Shtiebel', 'Mekor Habracha'])
  })

  it('"is there a maariv minyan at 6:45": yes, counting a combined Mincha & Maariv close by', () => {
    const answer = ask('is there a maariv minyan at 6:45', at(12))
    expect(answer?.text).toBe('Yes: Mincha & Maariv at 6:30 PM, Temple Beth Zion.')
  })

  it('"a maariv at 8": no, and the closest ones either side', () => {
    const answer = ask('is there a maariv at 8', at(12))
    expect(answer?.text).toBe('No Maariv at 8:00 PM in the guide. Closest: 7:15 PM and 9:00 PM.')
  })

  it('"is there still a maariv minyan tonight": yes, with how many are left', () => {
    expect(ask('is there still a maariv minyan tonight', at(19))?.text).toBe(
      'Next Maariv: 7:15 PM (in 15 min), South Philly Shtiebel. 1 more today.',
    )
  })

  it('"still a maariv tonight" after the last one: no, and when tomorrow’s is', () => {
    expect(ask('is there still a maariv tonight', at(21, 30))?.text).toBe(
      'No more Maariv today. First tomorrow: 7:15 PM, South Philly Shtiebel.',
    )
  })

  it('"next minyan" after the last one says minyanim, plural', () => {
    expect(ask('next minyan', at(22))?.text).toBe('No more minyanim today. First tomorrow: 6:45 AM, South Philly Shtiebel.')
  })

  it('"upcoming minyanim": the rest of today, in time order', () => {
    const answer = ask('can you pull up a list of upcoming minyanim', at(13))
    expect(answer?.rows.map((r) => `${r.time} ${r.label}`)).toEqual([
      '1:30 PM Mincha',
      '6:30 PM Mincha & Maariv',
      '7:15 PM Maariv',
      '9:00 PM Maariv',
    ])
  })

  it('reads a bare time by the tefillah: Shacharis at 7 is morning', () => {
    // At 8 AM the next "7:00" on the clock is 7 PM; the tefillah says morning.
    expect(ask('shacharis at 7', at(8))?.text).toBe('Yes: Shacharis at 7:00 AM, Mekor Habracha. 1 more within 15 min.')
  })

  it('reads a bare time with no tefillah as the next time the clock shows it', () => {
    // At 8 AM, "a minyan at 7" means this evening, where 7:15 is close enough.
    expect(ask('minyan at 7', at(8))?.text).toBe('Yes: Maariv at 7:15 PM, South Philly Shtiebel.')
  })
})

describe('answerFor — other questions', () => {
  it('says who has an item, and when only one place does', () => {
    expect(ask('cholov yisroel milk')?.text).toBe('ShopRite has Chalav Yisroel Milk.')
    expect(ask('challah')?.text).toBe('2 places have Challah (1 only sometimes).')
  })

  it('names the closest place to the one a question is about', () => {
    expect(ask('kosher food near HUP')?.text).toBe('Closest food establishments to Hospital of the University of Pennsylvania: Insomnia Cookies, 0.2 mi.')
  })

  it('says plainly when nothing that matches is open', () => {
    const result = { ...searchAsk(listings, categories, 'food open now'), hits: [], closedCount: 3 }
    expect(answerFor(result)?.text).toBe('Nothing open right now. 3 places match, but all are closed.')
  })

  it('says a distance limit needs a location, rather than ignoring it', () => {
    expect(ask('challah within a 10 minute walk')?.text).toBe(
      '2 places have Challah (1 only sometimes). Set your location to see only places within about a 10-minute walk.',
    )
  })

  it('keeps a minyan answer to shuls within the distance asked', () => {
    const answer = answerFor(searchAsk(listings, categories, 'maariv within a 10 minute walk'), {
      schedule: at(19),
      coords: { lat: 39.93, lng: -75.17 },
    })
    // From beside the Shtiebel, a 10-minute walk (about 0.4 mi) doesn't reach Mekor.
    expect(answer?.rows.map((r) => r.shulName)).toEqual(['South Philly Shtiebel'])
  })

  it('says nothing rather than something vague', () => {
    expect(ask('mekor habracha')).toBeNull()
    expect(ask('frozen gefilte fish')).toBeNull()
  })
})
