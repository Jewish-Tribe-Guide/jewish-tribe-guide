import { describe, expect, it } from 'vitest'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { resolveCapabilities, type CategoryField } from './categories'
import {
  audienceGroups,
  audienceStatus,
  compactWeek,
  confirmPlace,
  firstSentence,
  googleKeepsBox,
  siteName,
  isStale,
  listingActions,
  listingDistance,
  listingFacts,
  listingKind,
  mainThing,
  nearbyListings,
} from './listingView'

// Fields as the live categories have them (read Sep 30), trimmed.
const hours: CategoryField = { key: 'hours', label: 'Hours', type: 'hours', renderAs: 'row' }
const website: CategoryField = { key: 'website', label: 'Website', type: 'url', renderAs: 'row' }
const foodType: CategoryField = {
  key: 'foodType',
  label: 'Store Type',
  type: 'select',
  renderAs: 'badge',
  filterable: true,
  options: [{ value: 'Restaurant', label: 'Restaurant' }, { value: 'Bakery', label: 'Bakery' }],
}
const t: CategoryField = {
  key: 't',
  label: 'Food Type',
  type: 'select',
  renderAs: 'badge',
  filterable: true,
  options: [{ value: 'Meat', label: 'Meat' }, { value: 'Dairy', label: 'Dairy' }],
}
const cert: CategoryField = {
  key: 'kosherCert',
  label: 'Kosher Certification',
  type: 'select',
  renderAs: 'badge',
  filterable: true,
  caveat: { flagField: 'kosherPartial', noteField: 'kosherNote' },
  options: [{ value: 'Keystone-K', label: 'Keystone-K' }],
}
const certLink: CategoryField = { key: 'k', label: 'Certificate', type: 'url', renderAs: 'row' }
const food = makeCategory({ id: 'restaurant', label: 'Food', detailFields: [hours, website, t, cert, foodType, certLink] })

const denomination: CategoryField = { key: 'denomination', label: 'Denomination', type: 'select', renderAs: 'badge', filterable: true }
const minyanim: CategoryField = { key: 'minyanim', label: 'Davening Times', type: 'minyanim', renderAs: 'row' }
const shuls = makeCategory({ id: 'synagogue', label: 'Synagogue', detailFields: [website, denomination, minyanim] })

const isKosher: CategoryField = {
  key: 'isKosher',
  label: 'Kosher Store',
  type: 'select',
  renderAs: 'badge',
  filterable: true,
  options: [{ value: 'Kosher Items', label: 'Kosher Items' }, { value: 'Kosher Store', label: 'Kosher Store' }],
}
const m: CategoryField = { key: 'm', label: 'Kosher items available', type: 'tags', renderAs: 'badge', showCountInHeader: true, countReplacesKey: 'isKosher' }
const grocery = makeCategory({ id: 'grocery', label: 'Grocery Store', detailFields: [hours, website, isKosher, m] })

const flag = (key: string, label: string, filterLabel: string): CategoryField => ({ key, label, filterLabel, type: 'boolean', renderAs: 'badge', filterable: true })
const scoped = (key: string, type: CategoryField['type'], audienceKey: string): CategoryField => ({ key, label: key, type, renderAs: 'row', audienceKey })
const email: CategoryField = { key: 'e', label: 'Email', type: 'text', renderAs: 'row' }
const mikvah = makeCategory({
  id: 'mikvah',
  label: 'Mikvah',
  detailFields: [
    hours,
    website,
    email,
    flag('womenTevillah', 'Women’s Tevillah', 'Women’s'),
    flag('menTevillah', 'Men’s Tevillah', 'Men’s'),
    flag('keilim', 'Keilim', 'Keilim'),
    scoped('women_s_hours', 'hours', 'womenTevillah'),
    scoped('women_s_notes', 'textarea', 'womenTevillah'),
    scoped('men_s_hours', 'hours', 'menTevillah'),
    scoped('men_s_phone', 'tel', 'menTevillah'),
    scoped('keilim_hours', 'hours', 'keilim'),
  ],
})

const link: CategoryField = { key: 'link', label: 'Join group', type: 'url', renderAs: 'row', linkLabel: 'Join group', showInHeader: true }
const whatsapp = makeCategory({ id: 'whatsapp', label: 'WhatsApp Group', hasAddress: false, detailFields: [{ key: 'description', label: 'Description', type: 'textarea', renderAs: 'row' }, link] })

// Fri Oct 9 2026, 1:30 PM, local time.
const FRIDAY = new Date(2026, 9, 9, 13, 30)

describe('what kind of place, and the facts that decide it', () => {
  it('Food: the kind is its type, the facts are meat/dairy/parve and the hechsher', () => {
    const judah = makeListing({ foodType: 'Restaurant', t: ['Meat'], kosherCert: 'Keystone-K' })
    expect(listingKind(judah, food)).toBe('Restaurant')
    expect(listingFacts(judah, food)).toEqual(['Meat', 'Keystone-K'])
  })

  it('a shul: the kind is its denomination', () => {
    expect(listingKind(makeListing({ denomination: 'Orthodox (Ashkenazi)' }), shuls)).toBe('Orthodox (Ashkenazi)')
  })

  it('a grocery: its kosher badge is a fact, not a kind, so the kind is the category', () => {
    const store = makeListing({ isKosher: 'Kosher Store', m: ['Challah'] })
    expect(listingKind(store, grocery)).toBe('Grocery Store')
    expect(listingFacts(store, grocery)).toEqual(['Kosher Store'])
  })

  it('a grocery: as on the row, not "Kosher Items" over a list of kosher items', () => {
    expect(listingFacts(makeListing({ isKosher: 'Kosher Items', m: ['Challah'] }), grocery)).toEqual([])
    // With no items listed yet, it's the only thing saying so.
    expect(listingFacts(makeListing({ isKosher: 'Kosher Items', m: [] }), grocery)).toEqual(['Kosher Items'])
  })

  it('a mikvah: yes/no badges are facts, in their filter words', () => {
    const lmcm = makeListing({ womenTevillah: true, menTevillah: true, keilim: true })
    expect(listingKind(lmcm, mikvah)).toBe('Mikvah')
    expect(listingFacts(lmcm, mikvah)).toEqual(['Women’s', 'Men’s', 'Keilim'])
  })

  it('with nothing filled in, the category name and no facts', () => {
    expect(listingKind(makeListing(), food)).toBe('Food')
    expect(listingFacts(makeListing(), food)).toEqual([])
  })
})

describe('listingDistance', () => {
  it('from the visitor when a location is set', () => {
    expect(listingDistance(makeListing({ milesFromAddress: 3.46 }), 'Philadelphia')).toBe('3.5 mi away')
  })
  it('in feet from somewhere on the same block, not "0 mi away"', () => {
    expect(listingDistance(makeListing({ milesFromAddress: 0.04 }), 'Philadelphia')).toBe('200 ft away')
  })
  it('from the centre otherwise, saying so', () => {
    expect(listingDistance(makeListing({ milesFromCenter: 11.24 }), 'Philadelphia')).toBe('11.2 mi from central Philadelphia')
  })
  it('nothing for a place in the centre itself', () => {
    expect(listingDistance(makeListing({ milesFromCenter: 0.2 }), 'Philadelphia')).toBeNull()
  })
})

describe('mainThing', () => {
  it('a shul with times: the times', () => {
    const shul = makeListing({ minyanim: [{ id: 'm1', tefillah: 'shacharis', days: ['sat'], time: '9:00am' }] })
    expect(mainThing(shul, shuls)).toBe('davening')
  })
  it('a shul with none: nothing to lead with', () => {
    expect(mainThing(makeListing({ minyanim: [] }), shuls)).toBeNull()
  })
  it('a grocery with items: the items, even though it has hours', () => {
    expect(mainThing(makeListing({ m: ['Challah'], hours: { fri: { open: '09:00', close: '21:00' } } }), grocery)).toBe('items')
  })
  it('a grocery with only sometimes-items still leads with them', () => {
    expect(mainThing(makeListing({ m: [], m_sometimes: ['Steak'] }), grocery)).toBe('items')
  })
  it('a mikvah with its own sections: one per audience', () => {
    expect(mainThing(makeListing({ menTevillah: true, men_s_hours: { mon: { open: '04:30', close: '10:00' } } }), mikvah)).toBe('groups')
  })
  it('a WhatsApp group: Join', () => {
    expect(mainThing(makeListing({ address: '', link: 'https://chat.whatsapp.com/x' }), whatsapp)).toBe('join')
  })
  it('hours never lead on their own: they sit in the contact box (Oct 6), Food with no list of dishes included', () => {
    expect(mainThing(makeListing({ hours: { fri: { open: '11:00', close: '15:00' } } }), food)).toBeNull()
  })
  it('a category with an item list leads with it while it’s empty too, over the hours (agreed Oct 1)', () => {
    const open = makeListing({ m: [], hours: { fri: { open: '09:00', close: '21:00' } } })
    expect(mainThing(open, grocery)).toBe('items')
    const dishes: CategoryField = { key: 'dishes', label: 'Main dishes', type: 'tags', showCountInHeader: true, countLabel: 'dish' }
    expect(mainThing(open, makeCategory({ ...food, detailFields: [...food.detailFields, dishes] }))).toBe('items')
  })
  it('but not where nobody can add to it: nothing leads, the hours stay in the contact box', () => {
    const closed = makeCategory({ ...grocery, capabilities: { ...resolveCapabilities(grocery.capabilities), edit: false } })
    expect(mainThing(makeListing({ hours: { fri: { open: '09:00', close: '21:00' } } }), closed)).toBeNull()
  })
  it('hours saved empty every day are no hours', () => {
    expect(mainThing(makeListing({ hours: { fri: null, sat: null } }), food)).toBeNull()
  })
})

describe('audienceGroups', () => {
  it('one per audience served that has something filled in, in the category’s order', () => {
    const lmcm = makeListing({
      womenTevillah: true,
      menTevillah: true,
      keilim: true,
      women_s_notes: 'By appointment',
      men_s_hours: { mon: { open: '04:30', close: '10:00' } },
      men_s_phone: '267.738.8995',
    })
    const groups = audienceGroups(lmcm, mikvah)
    expect(groups.map((g) => g.label)).toEqual(['Women’s', 'Men’s'])
    expect(groups[1].fields.map((f) => f.key)).toEqual(['men_s_hours', 'men_s_phone'])
  })
  it('an audience not served is left out, whatever its fields hold', () => {
    const groups = audienceGroups(makeListing({ menTevillah: false, men_s_hours: { mon: { open: '04:30', close: '10:00' } } }), mikvah)
    expect(groups).toEqual([])
  })
})

describe('audienceStatus', () => {
  const lmcm = makeListing({
    womenTevillah: true,
    menTevillah: true,
    keilim: true,
    women_s_hours: { mon: { open: '20:30', close: '22:30' } },
    men_s_hours: { fri: { open: '04:30', close: '23:59' } },
    keilim_hours: { fri: { open: '06:00', close: '19:00' } },
  })
  it('names the open ones; a closed one says nothing', () => {
    expect(audienceStatus(lmcm, mikvah, FRIDAY)).toEqual([
      { text: 'Men’s open now', tone: 'open' },
      { text: 'Keilim until 7 PM', tone: 'plain' },
    ])
  })
  it('nothing before the page knows the time', () => {
    expect(audienceStatus(lmcm, mikvah, null)).toEqual([])
  })
})

describe('compactWeek', () => {
  it('runs equal days together and keeps today on its own line', () => {
    const judah = {
      sun: { open: '11:00', close: '20:00' },
      mon: { open: '11:00', close: '20:00' },
      tue: { open: '11:00', close: '20:00' },
      wed: { open: '11:00', close: '20:00' },
      thu: { open: '11:00', close: '20:00' },
      fri: { open: '11:00', close: '15:00' },
      sat: null,
    }
    expect(compactWeek(judah, FRIDAY)).toEqual([
      { label: 'Sun – Thu', text: '11 AM – 8 PM', isToday: false },
      { label: 'Fri', text: '11 AM – 3 PM', isToday: true },
      { label: 'Sat', text: 'Closed', isToday: false },
    ])
  })
  it('today stays separate even when it matches its neighbours', () => {
    const everyDay = Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open: '09:00', close: '21:00' }]))
    expect(compactWeek(everyDay, FRIDAY)!.map((l) => l.label)).toEqual(['Sun – Thu', 'Fri', 'Sat'])
  })
  it('keepRuns: equal days stay together, today among them', () => {
    const everyDay = Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open: '09:00', close: '21:00' }]))
    expect(compactWeek(everyDay, FRIDAY, { keepRuns: true })).toEqual([{ label: 'Sun – Sat', text: '9 AM – 9 PM', isToday: true }])
  })
  it('a day never filled in is not a closed day', () => {
    const women = { mon: { open: '20:30', close: '22:30' }, sat: null }
    const week = compactWeek(women, FRIDAY)!
    expect(week.find((l) => l.label === 'Fri')?.text).toBe('No hours listed')
    expect(week.find((l) => l.label === 'Sat')?.text).toBe('Closed')
  })
  it('null for hours written as text', () => {
    expect(compactWeek('Mon–Fri 9–5', FRIDAY)).toBeNull()
  })
})

describe('nearbyListings', () => {
  const at = (id: string, lat: number) => makeListing({ id, name: id, geo: { lat, lng: -75 } })
  it('the nearest others, nearest first, with how far each is', () => {
    const near = nearbyListings(at('me', 40), [at('me', 40), at('far', 40.2), at('near', 40.01), at('mid', 40.05)], 2)
    expect(near.map((n) => n.item.id)).toEqual(['near', 'mid'])
    expect(near[0].miles).toBeCloseTo(0.69, 1)
  })
  it('no address: the others, alphabetically', () => {
    const me = makeListing({ id: 'kp', name: 'Kosher In Philly' })
    const near = nearbyListings(me, [me, makeListing({ id: 'z', name: 'Zmanim chat' }), makeListing({ id: 'sb', name: 'Shabbat Board Games' })])
    expect(near.map((n) => n.item.name)).toEqual(['Shabbat Board Games', 'Zmanim chat'])
  })
})

describe('listingActions', () => {
  it('Directions, Call, then each link: Judah’s website and certificate', () => {
    const judah = makeListing({ phone: '(215) 613-6110', website: 'http://judahgrill.com', k: 'https://keystone-k.org/judah' })
    const { buttons, extra } = listingActions(judah, food)
    expect(buttons.map((b) => (b.kind === 'link' ? b.field.label : b.kind))).toEqual(['directions', 'call', 'Website', 'Certificate'])
    expect(extra).toEqual([])
  })
  it('an email in a text field becomes a button; four at most, the rest kept for the details', () => {
    const lmcm = makeListing({ phone: '(484) 808-5626', website: 'http://lmcmikvah.org', e: 'office@lmcmikvah.org', men_s_phone: '267.738.8995' })
    const { buttons } = listingActions(lmcm, mikvah)
    expect(buttons.map((b) => b.kind)).toEqual(['directions', 'call', 'link', 'email'])
    const busy = makeListing({ phone: '1', website: 'http://a', k: 'http://b', e: 'x@y.org' })
    const cat = makeCategory({ detailFields: [website, certLink, email] })
    expect(listingActions(busy, cat).extra.map((a) => a.kind)).toEqual(['email'])
  })
  it('a WhatsApp group’s Join is not a button: it’s the main thing', () => {
    expect(listingActions(makeListing({ address: '', link: 'https://chat.whatsapp.com/x' }), whatsapp).buttons).toEqual([])
  })
})

describe('isStale: when a confirmation asks again', () => {
  const now = Date.parse('2026-09-24T12:00:00Z')
  it('at 90 days, not at 89', () => {
    expect(isStale('2026-06-26T12:00:00Z', now)).toBe(true)
    expect(isStale('2026-06-27T12:00:00Z', now)).toBe(false)
  })
  it('never before the page knows the time', () => {
    expect(isStale('2020-01-01T00:00:00Z', null)).toBe(false)
  })
})

describe('googleKeepsBox', () => {
  // Oct 6: the contact box says when Google last updated it, one date for
  // the box, so all that matters is whether Google keeps any of it.
  const synced = { placeId: 'p1', googleSyncedAt: '2026-09-30T07:00:00Z' }
  it('when the sync keeps something the box shows: its phone, website, or hours', () => {
    expect(googleKeepsBox(makeListing({ ...synced, googleFields: ['phone'], phone: '1' }))).toBe(true)
    expect(googleKeepsBox(makeListing({ ...synced, googleFields: ['website'], website: 'http://x' }))).toBe(true)
    expect(googleKeepsBox(makeListing({ ...synced, googleFields: ['hours'] }), { hours: true })).toBe(true)
  })
  it('not for what the box doesn’t show', () => {
    expect(googleKeepsBox(makeListing({ ...synced, googleFields: ['hours'] }), { hours: false })).toBe(false)
    expect(googleKeepsBox(makeListing({ ...synced, googleFields: ['phone', 'name'], phone: undefined }))).toBe(false)
  })
  it('nothing for a listing no longer matched to Google, whatever it once kept', () => {
    expect(googleKeepsBox(makeListing({ googleSyncedAt: '2026-09-30T07:00:00Z', googleFields: ['phone'], phone: '1' }))).toBe(false)
  })
})

describe('siteName', () => {
  it('a website as people say it', () => {
    expect(siteName('https://www.judahkosher.com/menu?x=1')).toBe('judahkosher.com')
    expect(siteName('http://tribe12.org')).toBe('tribe12.org')
    expect(siteName('not a link')).toBeNull()
  })
})

describe('confirmPlace', () => {
  it('what changes often, asked about in its card: a shul’s times, a mikvah’s hours', () => {
    expect(confirmPlace(makeListing({ minyanim: [{ id: 'm1', tefillah: 'shacharis', days: ['sun'], time: '8:00am' }] }), shuls)).toEqual({ at: 'card', subject: 'Times' })
    expect(confirmPlace(makeListing({ womenTevillah: true, women_s_notes: 'By appointment' }), mikvah)).toEqual({ at: 'sections' })
  })
  it('what hardly changes isn’t dated at all (Oct 6): the certificate proves a hechsher; a grocery’s items carry their own dates', () => {
    expect(confirmPlace(makeListing({ t: ['Meat'], kosherCert: 'Keystone-K', foodType: 'Restaurant' }), food)).toBeNull()
    expect(confirmPlace(makeListing({ m: ['Challah'], isKosher: 'Kosher Items' }), grocery)).toBeNull()
  })
  it('a restaurant’s dishes are dated each on their own, and its kosher details aren’t dated either', () => {
    const dishes: CategoryField = { key: 'dishes', label: 'Main dishes', type: 'tags', showCountInHeader: true, countLabel: 'dish' }
    const withDishes = makeCategory({ ...food, detailFields: [...food.detailFields, dishes] })
    const listing = makeListing({ t: ['Meat'], kosherCert: 'Keystone-K', foodType: 'Restaurant', dishes: ['Shawarma'] })
    expect(mainThing(listing, withDishes)).toBe('items')
    expect(confirmPlace(listing, withDishes)).toBeNull()
  })
  it('nor a hotel’s "Shabbat friendly"', () => {
    const shabbat: CategoryField = { key: 'shabbatFriendly', label: 'Shabbat friendly', type: 'boolean', renderAs: 'badge', filterable: true }
    expect(confirmPlace(makeListing({ shabbatFriendly: true }), makeCategory({ detailFields: [shabbat] }))).toBeNull()
  })
  it('a group with no address: its join link', () => {
    const link: CategoryField = { key: 'link', label: 'Join', type: 'url', renderAs: 'row', showInHeader: true }
    expect(confirmPlace(makeListing({ link: 'https://chat.whatsapp.com/x' }), makeCategory({ hasAddress: false, detailFields: [link] }))).toEqual({ at: 'join' })
  })
  it('but not a network’s website (Oct 6): only a link that joins something is asked about', () => {
    const w: CategoryField = { key: 'w', label: 'Website', type: 'url', renderAs: 'row', showInHeader: true }
    expect(confirmPlace(makeListing({ w: 'https://tribe12.org' }), makeCategory({ hasAddress: false, detailFields: [w] }))).toBeNull()
  })
  it('nothing when nothing is the community’s to confirm: no broad question instead', () => {
    expect(confirmPlace(makeListing({ hours: { mon: { open: '09:00', close: '17:00' } } }), food)).toBeNull()
  })
})

// A hospital (step 5, Oct 2): a card the admin names comes first, and Set as
// location is among its buttons (listingParts.ts).
describe('a category’s own main card and Set as location', () => {
  const who: CategoryField = { key: 'who', label: 'Who to call first', type: 'text' }
  const whoPhone: CategoryField = { key: 'who_phone', label: 'Their phone', type: 'tel' }
  const whoSite: CategoryField = { key: 'who_site', label: 'Their website', type: 'url' }
  const refuah: CategoryField = { key: 'r', label: 'Refuah Link', type: 'url' }
  const hospital = makeCategory({
    id: 'hospital',
    detailFields: [website, refuah, who, whoPhone, whoSite],
    listingParts: { main: { title: 'Who to call first', fields: ['who', 'who_phone', 'who_site'] }, setLocation: true },
  })
  const hup = makeListing({ phone: '(215) 662-4000', website: 'https://pennmedicine.org', r: 'https://refuah.com/hup', geo: { lat: 39.95, lng: -75.19 } })

  it('leads with the named card, even before anyone has filled it in', () => {
    expect(mainThing(hup, hospital)).toBe('section')
    expect(mainThing(makeListing({ who: 'Bikur Cholim' }), hospital)).toBe('section')
  })
  it('asks "Still right?" in that card', () => {
    expect(confirmPlace(hup, hospital)).toEqual({ at: 'card', subject: 'Who to call first' })
  })
  it('isn’t the main thing once none of its fields exist', () => {
    const gone = makeCategory({ ...hospital, detailFields: [website, refuah] })
    expect(mainThing(hup, gone)).not.toBe('section')
  })
  it('ends the buttons with Set as location, taking the fourth place; a link on the card isn’t a button too', () => {
    const { buttons, extra } = listingActions({ ...hup, who_site: 'https://bikurcholim.org' }, hospital)
    expect(buttons.map((b) => (b.kind === 'link' ? b.field.label : b.kind))).toEqual(['directions', 'call', 'Website', 'location'])
    expect(extra.map((b) => (b.kind === 'link' ? b.field.label : b.kind))).toEqual(['Refuah Link'])
  })
  it('no Set as location for a place the map can’t find', () => {
    expect(listingActions({ ...hup, geo: undefined }, hospital).buttons.map((b) => b.kind)).not.toContain('location')
  })
})

describe('firstSentence', () => {
  it('splits a note after its first sentence', () => {
    expect(firstSentence('On Shabbos, by appointment only. On Motzei Shabbos, open 2 hours.')).toEqual({
      first: 'On Shabbos, by appointment only.',
      rest: 'On Motzei Shabbos, open 2 hours.',
    })
  })
  it('a first line with no full stop is the first sentence', () => {
    expect(firstSentence('Friday: 4:30 AM – 1 hours before Candle Lighting\n\nThe entrance is on the right side.')).toEqual({
      first: 'Friday: 4:30 AM – 1 hours before Candle Lighting',
      rest: 'The entrance is on the right side.',
    })
  })
  it('one sentence leaves nothing to fold', () => {
    expect(firstSentence('Schedule your appointment (48 hours advance notice would be appreciated)')).toEqual({
      first: 'Schedule your appointment (48 hours advance notice would be appreciated)',
      rest: '',
    })
  })
  it('a decimal or a time isn’t the end of a sentence', () => {
    expect(firstSentence('Open 8:30 PM. Call first.').first).toBe('Open 8:30 PM.')
  })
})
