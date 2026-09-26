import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import type { DirectoryResource } from '@/types'
import { searchAsk } from './askSearch'
import { answerFor, hitHoursNote, type AnswerSchedule } from './askAnswer'
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
const here = { lat: 39.95, lng: -75.17 }

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

  it('names the nearer of two shuls with a minyan at the same time', () => {
    // Reported: two 9:00 Shacharises, and the sentence named the farther one
    // because the schedule breaks ties by name.
    const nine = [slot(mekor, 'shacharis', 9), slot(shtiebel, 'shacharis', 9)]
    const nearShtiebel = { lat: 39.93, lng: -75.17 }
    const answer = answerFor(searchAsk(listings, categories, 'next minyan'), {
      schedule: { today: nine, tomorrow: [], nowMinutes: 7 * 60 },
      coords: nearShtiebel,
    })
    expect(answer?.text).toMatch(/^Next minyan: 9:00 AM, South Philly Shtiebel \(/)
  })

  it('keeps every minyan left today, showing the first few', () => {
    // "9 more today" was a count with nowhere to go: the list stopped at 5.
    const many = Array.from({ length: 8 }, (_, i) => slot(mekor, 'maariv', 18, i * 5))
    const answer = ask('next maariv', { today: many, tomorrow: [], nowMinutes: 17 * 60 })
    expect(answer?.text).toBe('Next Maariv: 6:00 PM, Mekor Habracha. 7 more today.')
    expect(answer?.rows).toHaveLength(8)
    expect(answer?.shown).toBe(5)
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

  it('counts every place with the item, however each one words it', () => {
    // Reported: nine stores with cheese came out as "Food & Friends has
    // Sliced Cheeses", because only exact wordings were counted.
    const cheeses = [
      listing('grocery', 'c1', 'Food & Friends', 39.951, { m: ['Sliced Cheeses'] }),
      listing('grocery', 'c2', 'Spruce Market', 39.952, { m: ['Shredded Cheese'] }),
      listing('grocery', 'c3', 'ALDI', 39.953, { m: ['Goat Cheese'] }),
    ]
    const answer = answerFor(searchAsk(cheeses, categories, 'is there a place that sells cheese', { coords: here }), { coords: here })
    expect(answer?.text).toBe('3 places have cheese. Nearest: Food & Friends, 0.1 mi.')
  })

  it('names the nearest place, not the best-matching one', () => {
    // Mid-word, "cheese st" ranks GIANT's Cheese Sticks first; ALDI is nearer.
    const cheeses = [
      listing('grocery', 'g', 'GIANT', 39.99, { m: ['Cheese Sticks'] }),
      listing('grocery', 'a', 'ALDI', 39.951, { m: ['Goat Cheese'] }),
    ]
    const result = searchAsk(cheeses, categories, 'cheese st', { coords: here })
    expect(result.hits[0].item.name).toBe('GIANT')
    expect(answerFor(result, { coords: here })?.text).toBe('2 places have cheese. Nearest: ALDI, 0.1 mi.')
  })

  it('counts only places with as good a match as the best', () => {
    // A store with plain "Goat Cheese" doesn't have sliced goat cheese.
    const cheeses = [
      listing('grocery', 'f', 'Far Market', 39.99, { m: ['Sliced Goat Cheese'] }),
      listing('grocery', 'n', 'Near Market', 39.951, { m: ['Goat Cheese'] }),
    ]
    // Three words need two to match, so the search does find Near Market.
    const result = searchAsk(cheeses, categories, 'sliced goat cheese near me', { coords: here })
    expect(result.hits).toHaveLength(2)
    expect(answerFor(result, { coords: here })?.text).toBe('Far Market has Sliced Goat Cheese, 2.8 mi.')
  })

  it('for "open", counts the open places and says how many more are closed', () => {
    const nineToTen = Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open: '09:00', close: '22:00' }]))
    const shut = Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, null]))
    const storeWithHours = makeCategory({
      id: 'grocery',
      label: 'Grocery Store',
      pluralLabel: 'Grocery Stores',
      detailFields: [
        { key: 'hours', label: 'Hours', type: 'hours' },
        { key: 'm', label: 'Kosher items', type: 'tags' },
      ],
    })
    const stores = [
      listing('grocery', 'o1', 'GIANT', 39.955, { m: ['Cheese'], hours: nineToTen }),
      listing('grocery', 'o2', 'ShopRite', 39.99, { m: ['Mozzarella Cheese'], hours: nineToTen }),
      listing('grocery', 'x', 'Food & Friends', 39.951, { m: ['Sliced Cheeses'], hours: { ...shut, sat: { open: '06:00', close: '08:00' } } }),
    ]
    const result = searchAsk(stores, [storeWithHours], 'is there a place open that sells cheese', {
      coords: here,
      now: new Date(2026, 8, 26, 12, 0),
    })
    expect(answerFor(result, { coords: here })?.text).toBe(
      '2 open places have cheese. Nearest: GIANT, 0.3 mi, open until 10:00 PM. 1 more is closed right now.',
    )
  })

  it('counts a food place that serves it, by its description or name, not only stores that stock it', () => {
    // Reported: "pretzels" answered "ALDI has Pretzel Buns" over two pretzel
    // bakeries, because only item lists counted.
    const food = makeCategory({
      id: 'restaurant',
      label: 'Food',
      pluralLabel: 'Food',
      detailFields: [{ key: 'googleDescription', label: 'Description', type: 'textarea' }],
    })
    const places = [
      listing('grocery', 'aldi', 'ALDI', 39.99, { m: ['Pretzel Buns'] }),
      listing('restaurant', 'twisters', 'Tasty Twisters Bakery', 39.951, { googleDescription: 'Family-owned bakery crafting hand-rolled soft pretzels.' }),
      listing('restaurant', 'pretzelco', 'Center City Pretzel Co.', 39.96),
    ]
    const result = searchAsk(places, [grocery, food], 'pretzels', { coords: here })
    // The bakery is nearest, and its description counts as fully as an item.
    expect(result.hits[0].item.name).toBe('Tasty Twisters Bakery')
    expect(answerFor(result, { coords: here })?.text).toBe('3 places have pretzels. Nearest: Tasty Twisters Bakery, 0.1 mi.')
  })

  it('answers when one word of a place’s name is what was asked for', () => {
    // "restaurant with pretzels": Center City Pretzel Co. is on top, but one
    // word of its four isn't looking it up by name.
    const food = makeCategory({ id: 'restaurant', label: 'Food', pluralLabel: 'Food' })
    const places = [listing('restaurant', 'pc', 'Center City Pretzel Co.', 39.951)]
    expect(answerFor(searchAsk(places, [food], 'restaurant with pretzels'))?.text).toBe('Center City Pretzel Co. has pretzels.')
  })

  it("does not say a shul 'has' what its name or denomination says", () => {
    // Food places are described by their text and names; a shul isn't:
    // "orthodox shtiebel" is looking for a shul, not asking who has something.
    expect(ask('orthodox shtiebel')).toBeNull()
  })

  it('says nothing about having it when the question is a place’s own name', () => {
    const food = makeCategory({ id: 'restaurant', label: 'Food', pluralLabel: 'Food', detailFields: [{ key: 'd', label: 'Description', type: 'textarea' }] })
    const pizza = listing('restaurant', 'p', '20th Street Pizza', 39.95, { d: 'Kosher pizza on 20th Street.' })
    expect(answerFor(searchAsk([pizza], [food], '20th street pizza'))).toBeNull()
  })

  it('answers when the item is the word still being typed', () => {
    // "giant wine", before a space: the last word was set aside as still
    // being typed, which left nothing to answer with.
    expect(ask('giant wine')?.text).toBe('GIANT has Wine.')
  })

  it('names the closest place to the one a question is about', () => {
    expect(ask('kosher food near HUP')?.text).toBe('Closest food establishments to Hospital of the University of Pennsylvania: Insomnia Cookies, 0.2 mi.')
  })

  it('says plainly when nothing that matches is open', () => {
    const result = { ...searchAsk(listings, categories, 'food open now'), hits: [], closedCount: 3, noHours: [] }
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

describe('answerFor — "is there a mikvah open today"', () => {
  const mikvah = makeCategory({
    id: 'mikvah',
    label: 'Mikvah',
    pluralLabel: 'Mikvaot',
    detailFields: [
      { key: 'women_s_hours', label: 'Women’s Hours', type: 'hours' },
      { key: 'men_s_hours', label: "Men's Hours", type: 'hours' },
    ],
  })
  const allWeek = (open: string, close: string) =>
    Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open, close }]))
  const lowerMerion = listing('mikvah', 'lm', 'Lower Merion Community Mikvah', 39.95, {
    men_s_hours: allWeek('04:30', '10:00'),
    women_s_hours: allWeek('20:00', '22:00'),
  })
  const noHours = listing('mikvah', 'oh', 'Mikvah Ohel Leah', 39.96)
  const at = (h: number) => new Date(2026, 8, 26, h, 0)
  const answer = (input: string, h: number, places = [lowerMerion, noHours]) =>
    answerFor(searchAsk(places, [mikvah], input, { now: at(h) }))

  it("says which of its hours are open — a mikvah's men's hours are not its women's", () => {
    // Reported: at 7 AM this came back as just the mikvah's name, with
    // nothing to say it was the men's mikvah that was open.
    expect(answer("is there a mikvah that's open today", 7)?.text).toBe(
      "Lower Merion Community Mikvah: Men's open until 10:00 AM, Women’s opens 8:00 PM. 1 more has no hours listed.",
    )
  })

  it('for "open now", names only what is open now', () => {
    expect(answer('mikvah open now', 7)?.text).toBe(
      "Lower Merion Community Mikvah: Men's open until 10:00 AM. 1 more has no hours listed.",
    )
  })

  it('does not call a place with no hours closed', () => {
    expect(answer('mikvah open today', 23)?.text).toBe('Nothing listed as open for the rest of today. 1 has no hours listed. 1 is closed.')
  })

  it('marks each result with the hours that answer the question, or none listed', () => {
    const result = searchAsk([lowerMerion, noHours], [mikvah], 'mikvah open now', { now: at(7) })
    expect(hitHoursNote(result.hits[0], result.query)).toEqual({ text: "Men's open until 10:00 AM", known: true })
    expect(hitHoursNote(result.noHours[0], result.query)).toEqual({ text: 'No hours listed', known: false })
    const plain = searchAsk([lowerMerion], [mikvah], 'mikvah', { now: at(7) })
    expect(hitHoursNote(plain.hits[0], plain.query)).toBeNull()
  })
})
