// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import type { CategoryField } from '@/lib/categories'
import type { DirectoryResource, ZmanimData } from '@/types'
import ListingView from './ListingView'
import { forgetLoadedPlaces } from './WalkList'
import { clearEruvStatuses } from '@/lib/useEruvStatuses'

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))
// This week's candle lighting, Friday Oct 9 at 6:13 PM.
const zmanim = {
  dayOfWeek: 5,
  isFriday: true,
  shabbos: { candleLighting: { label: 'Friday', time: '6:13 PM', iso: '2026-10-09T18:13:00' }, havdalah: null },
} as unknown as ZmanimData
vi.mock('@/lib/useZmanim', () => ({ useZmanim: () => ({ data: zmanim, status: 'ready' }) }))
const location = { anchorListingId: null as string | null, setListingAnchor: vi.fn(), unsetListingAnchor: vi.fn(), directionsOrigin: null }
vi.mock('@/lib/locationContext', () => ({ useOptionalLocation: () => location }))

// The Hospitals category as step 5 sets it up: who to call first as the main
// card, a Shabbos card with the eruv and kosher food inside, Set as location,
// and the shuls within a walk.
const fields: CategoryField[] = [
  { key: 'w', label: 'Website', type: 'url', renderAs: 'row' },
  { key: 'who', label: 'Who to call first', type: 'text' },
  { key: 'who_phone', label: 'Their phone', type: 'tel' },
  { key: 'who_helps', label: 'What they help with', type: 'textarea' },
  {
    key: 'eruv',
    label: 'Eruv',
    type: 'select',
    renderAs: 'row',
    options: [
      { value: 'uc', label: 'University City Eruv' },
      { value: 'none', label: 'Not inside an eruv' },
    ],
  },
  { key: 'kosher_inside', label: 'Kosher food inside', type: 'textarea' },
]
const hospitals = makeCategory({
  id: 'hospital',
  label: 'Hospital',
  pluralLabel: 'Hospitals',
  detailFields: fields,
  walkList: [{ categoryId: 'synagogue', maxMinutes: 30 }],
  listingParts: {
    main: { title: 'Who to call first', fields: ['who', 'who_phone', 'who_helps'] },
    shabbos: { fields: ['eruv', 'kosher_inside'] },
    setLocation: true,
  },
})
const shuls = makeCategory({ id: 'synagogue', label: 'Synagogue', pluralLabel: 'Synagogues', detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] })
const hup = makeListing({
  id: 'hup',
  category: 'hospital',
  name: 'Hospital of the University of Pennsylvania',
  phone: '(215) 662-4000',
  w: 'https://pennmedicine.org',
  geo: { lat: 39.9501, lng: -75.1939 },
  who: 'Bikur Cholim of Philadelphia',
  who_phone: '2155550100',
  who_helps: 'Meals, a place to stay, Shabbos.',
  eruv: 'uc',
}) as DirectoryResource

const open = (item: DirectoryResource = hup) =>
  renderWithProviders(<ListingView item={item} category={hospitals} color="#000" path="/test" foot={null} />, { content: { categories: [hospitals, shuls] } })
/** The parts of the page, top to bottom, by test id. */
const order = () =>
  [...document.querySelectorAll('[data-testid="listing-view"] [data-testid]')]
    .map((el) => el.getAttribute('data-testid'))
    .filter((id) => ['listing-section', 'listing-shabbos', 'walk-list'].includes(id!))

beforeEach(() => {
  forgetLoadedPlaces()
  clearEruvStatuses()
  location.anchorListingId = null
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ ok: true, resources: [] }), { status: 200 })),
  )
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('A hospital’s own main card', () => {
  it('leads with who to call: their name, what they help with, and a Call button named for them', () => {
    vi.setSystemTime(new Date(2026, 9, 6, 13, 30)) // Tue Oct 6
    open()
    const card = screen.getByTestId('listing-section')
    expect(within(card).getByRole('heading', { name: 'Who to call first' })).toBeInTheDocument()
    expect(card).toHaveTextContent('Bikur Cholim of Philadelphia')
    expect(card).toHaveTextContent('Meals, a place to stay, Shabbos.')
    expect(within(card).getByRole('link', { name: 'Call Bikur Cholim of Philadelphia' })).toHaveAttribute('href', 'tel:2155550100')
    // Said there, not again in the details.
    expect(screen.queryByTestId('listing-details')).not.toHaveTextContent('Bikur Cholim')
  })

  it('says it isn’t in the guide yet, rather than leaving a gap', () => {
    vi.setSystemTime(new Date(2026, 9, 6, 13, 30))
    open({ ...hup, who: '', who_phone: '', who_helps: '' })
    // And asks nobody to confirm that.
    expect(screen.getByTestId('listing-section')).toHaveTextContent(/^Who to call firstNot in the guide yet\.$/)
  })

  it('asks "Still right?" about what it says once it says something', () => {
    vi.setSystemTime(new Date(2026, 9, 6, 13, 30))
    open()
    expect(screen.getByTestId('listing-section')).toHaveTextContent('Who to call first not confirmed by anyone yet')
  })
})

describe('A hotel’s own main card (Oct 6)', () => {
  // "Shabbos friendly" leads with the yes/no it's about: shown only for a
  // yes with something more to say, and the yes isn't said again inside.
  const hotels = makeCategory({
    id: 'hotel',
    label: 'Hotel',
    detailFields: [
      { key: 'shabbatFriendly', label: 'Shabbat friendly', type: 'boolean', renderAs: 'badge', filterable: true },
      { key: 'notes', label: 'Notes', type: 'textarea', renderAs: 'row' },
    ],
    listingParts: { main: { title: 'Shabbos friendly', fields: ['shabbatFriendly', 'notes'] } },
  })
  const hotel = (details: Record<string, unknown>) => {
    vi.setSystemTime(new Date(2026, 9, 6, 13, 30))
    renderWithProviders(<ListingView item={makeListing({ id: 'cambria', ...details }) as DirectoryResource} category={hotels} color="#000" path="/test" foot={null} />, {
      content: { categories: [hotels] },
    })
  }

  it('a Shabbos-friendly hotel: the title, then how it works there', () => {
    hotel({ shabbatFriendly: true, notes: 'Electronic keys, but reception will open door for you' })
    expect(screen.getByTestId('listing-section')).toHaveTextContent(/^Shabbos friendlyElectronic keys, but reception will open door for you/)
  })

  it('no box for a hotel that isn’t, or doesn’t say', () => {
    hotel({ shabbatFriendly: false, notes: 'Electronic keys only' })
    expect(screen.queryByTestId('listing-section')).not.toBeInTheDocument()
    cleanup()
    hotel({ notes: 'Electronic keys only' })
    expect(screen.queryByTestId('listing-section')).not.toBeInTheDocument()
  })

  it('no box with nothing more to say than the yes the header already says', () => {
    hotel({ shabbatFriendly: true })
    expect(screen.queryByTestId('listing-section')).not.toBeInTheDocument()
  })
})

describe('This Shabbos', () => {
  it('on a Friday before candle lighting, comes right after the main card, with tonight’s time', () => {
    vi.setSystemTime(new Date(2026, 9, 9, 13, 30)) // Fri Oct 9, 1:30 PM
    open()
    expect(order()).toEqual(['listing-section', 'listing-shabbos', 'walk-list'])
    const card = screen.getByTestId('listing-shabbos')
    expect(within(card).getByRole('heading', { name: 'This Shabbos' })).toBeInTheDocument()
    expect(card).toHaveTextContent('Candle lighting6:13 PM tonight, for Test Region')
  })

  it('the rest of the week, after the places within a walk, with Friday’s time', () => {
    vi.setSystemTime(new Date(2026, 9, 6, 13, 30)) // Tue Oct 6
    open()
    expect(order()).toEqual(['listing-section', 'walk-list', 'listing-shabbos'])
    expect(screen.getByTestId('listing-shabbos')).toHaveTextContent('Candle lightingFriday 6:13 PM, for Test Region')
  })

  it('an eruv shows its status as the Eruv page does, read from its own site, and opens that page', async () => {
    vi.setSystemTime(new Date('2026-10-09T19:00:00Z')) // Fri 3 PM
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).startsWith('/api/eruv')
          ? new Response(JSON.stringify({ ok: true, available: true, timezone: 'America/New_York', candles: 18 * 60 + 12, eruvim: [{ id: 'university-city', name: 'University City Eruv', statusUrl: 'https://www.pennocp.org/eruv', statusDated: false, status: 'up', statusWords: 'The Eruv is Up!', statusPostedOn: null, statusCheckedAt: '2026-10-09T18:55:00Z', statusErrorAt: null, statusError: null, line: null }] }))
          : new Response(JSON.stringify({ ok: true, resources: [] })),
      ),
    )
    open()
    const status = await screen.findByTestId('shabbos-eruv-status')
    expect(status).toHaveTextContent('Up for this Shabbos')
    expect(status).toHaveAttribute('href', '/test-community/eruv')
    expect(screen.getByTestId('listing-shabbos')).toHaveTextContent('Checked 2:55 PM · every 15 minutes until candle lighting')
    expect(within(screen.getByTestId('listing-shabbos')).queryByRole('link', { name: 'This week’s status ↗' })).not.toBeInTheDocument()
  })

  it('without the eruv table, an eruv links to its weekly status; what nobody has filled in says so', async () => {
    vi.setSystemTime(new Date(2026, 9, 6, 13, 30))
    open()
    const card = screen.getByTestId('listing-shabbos')
    expect(await within(card).findByRole('link', { name: 'This week’s status ↗' })).toHaveAttribute('href', 'https://www.pennocp.org/eruv')
    expect(card).toHaveTextContent('EruvUniversity City Eruv · This week’s status ↗')
    expect(card).toHaveTextContent('Kosher food insideNot in the guide yet.')
    cleanup()
    open({ ...hup, eruv: 'none' })
    expect(screen.getByTestId('listing-shabbos')).toHaveTextContent('EruvNot inside an eruv')
    expect(within(screen.getByTestId('listing-shabbos')).queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('Set as my location', () => {
  // Oct 6: a row under the address, out of the round buttons, which are
  // every listing's (Directions, Call, Website, Share).
  it('is a row under the address, not a button, and sets the hospital as where every page measures from', () => {
    vi.setSystemTime(new Date(2026, 9, 6, 13, 30))
    open()
    expect(within(screen.getByTestId('listing-actions')).queryByRole('button', { name: /location/i })).not.toBeInTheDocument()
    const details = screen.getByTestId('listing-details')
    fireEvent.click(within(details).getByRole('button', { name: 'Set as my location' }))
    expect(location.setListingAnchor).toHaveBeenCalledWith({ id: 'hup', name: hup.name, coords: hup.geo })
    expect(details).toHaveTextContent('The guide’s distances, from here')
  })

  it('once set, says so, and a tap unsets it', () => {
    vi.setSystemTime(new Date(2026, 9, 6, 13, 30))
    location.anchorListingId = 'hup'
    open()
    const button = within(screen.getByTestId('listing-details')).getByRole('button', { name: 'Your location' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(button)
    expect(location.unsetListingAnchor).toHaveBeenCalled()
  })
})

// ── Oct 6: a hospital on Refuah's sections ─────────────────────────────────
// Lists of contacts in the admin's boxes, in the order a family arriving
// needs them, This Shabbos placed among them. Entries copied from Refuah's
// CHOP page, Oct 6.
describe('A hospital’s boxes', () => {
  const lists: CategoryField[] = [
    { key: 'liaisons', label: 'Liaisons', type: 'contacts' },
    { key: 'pantry', label: 'Pantry', type: 'contacts' },
    { key: 'packages', label: 'Food packages', type: 'contacts' },
    { key: 'stay', label: 'Accommodations', type: 'contacts' },
    { key: 'rides', label: 'Transportation', type: 'contacts', entryFrom: true },
    { key: 'also', label: 'Miscellaneous', type: 'contacts' },
    { key: 'eruv', label: 'Eruv', type: 'select', renderAs: 'row', options: [{ value: 'uc', label: 'University City Eruv' }] },
    { key: 'sukkah', label: 'Sukkah', type: 'textarea', shownAround: 'sukkos' },
  ]
  const refuah = makeCategory({
    id: 'hospital',
    label: 'Hospital',
    pluralLabel: 'Hospitals',
    detailFields: lists,
    walkList: [{ categoryId: 'synagogue', maxMinutes: 30 }],
    listingParts: {
      boxes: [
        { title: 'Who to call', fields: ['liaisons'] },
        { title: 'Kosher food', fields: ['pantry', 'packages'] },
        { title: 'A place to stay', fields: ['stay'] },
        { title: 'Rides', fields: ['rides'] },
      ],
      shabbos: { fields: ['eruv', 'sukkah'], after: 3 },
      setLocation: true,
    },
  })
  const CL = 'Chai Lifeline NJ/PA'
  const chop = makeListing({
    id: 'chop',
    category: 'hospital',
    name: 'Children’s Hospital of Philadelphia',
    geo: { lat: 39.9483, lng: -75.1953 },
    liaisons: [
      { name: CL, phones: ['732-719-1700'] },
      { name: 'Mrs. Naomi Gorelick', who: CL, phones: ['908-770-5145'], email: 'ngorelick@chailifeline.org' },
      { name: 'Yehoshua Brodsky', who: CL, phones: ['732-485-5555'] },
      { name: 'Heshy Horovitz', who: CL, phones: ['732-810-7700'] },
    ],
    pantry: [
      { name: 'Main Hospital, right off the Food Court', who: CL, phones: ['732-719-1760'] },
      { name: 'Buerger Center, off the Main Lobby in the Welcome Center', who: CL, phones: ['732-719-1700'] },
    ],
    packages: [{ name: 'Bikur Cholim of Philadelphia', phones: ['215-805-8668'], note: 'Call to arrange.' }],
    stay: [{ name: 'Bikur Cholim of Philadelphia', who: 'Coordinated by Malky Schwartz', phones: ['215-805-8668'], web: 'https://bikkurcholimphilly.org/hospitality' }],
    rides: [{ name: 'Darchei Chesed', phones: ['845-425-4070'], from: 'Monsey' }],
    also: [{ name: 'Medical supplies', phones: ['215-725-2957'], note: 'Wheelchairs, walkers, crutches and more.' }],
    eruv: 'uc',
    sukkah: 'In the Brodsky Garden, between the Main Entrance and the ER.',
  }) as DirectoryResource
  const show = (item: DirectoryResource = chop) =>
    renderWithProviders(<ListingView item={item} category={refuah} color="#000" path="/test" foot={null} />, { content: { categories: [refuah, shuls] } })
  const parts = () =>
    [...document.querySelectorAll('[data-testid="listing-view"] [data-testid]')]
      .filter((el) => ['listing-box', 'listing-shabbos', 'walk-list', 'listing-details'].includes(el.getAttribute('data-testid')!))
      .map((el) => (el.getAttribute('data-testid') === 'listing-box' ? el.querySelector('h2')!.textContent : el.getAttribute('data-testid')))

  it('in the admin’s order, This Shabbos where they put it, then the places within a walk and the contact box', () => {
    vi.setSystemTime(new Date(2026, 9, 6, 13, 30)) // Tue Oct 6
    show()
    expect(parts()).toEqual(['Who to call · 4', 'Kosher food', 'A place to stay', 'listing-shabbos', 'Rides', 'Miscellaneous', 'walk-list', 'listing-details'])
  })

  it('on a Friday before candles, This Shabbos comes first', () => {
    vi.setSystemTime(new Date(2026, 9, 9, 13, 30)) // Fri Oct 9
    show()
    expect(parts().slice(0, 2)).toEqual(['listing-shabbos', 'Who to call · 4'])
  })

  it('two lists in one box each under its own heading, with a count when there’s more than one', () => {
    vi.setSystemTime(new Date(2026, 9, 6, 13, 30))
    show()
    const food = screen.getAllByTestId('listing-box')[1]
    expect(food).toHaveTextContent('Pantry · 2')
    expect(food).toHaveTextContent(/Food packages(?! ·)/)
    expect(within(food).getAllByTestId('contact')).toHaveLength(3)
  })

  it('each entry: who, where from, the note, its phones to call, its email and website', () => {
    vi.setSystemTime(new Date(2026, 9, 6, 13, 30))
    show()
    const [call, , stay, rides, also] = screen.getAllByTestId('listing-box')
    const naomi = within(call).getAllByTestId('contact')[1]
    expect(naomi).toHaveTextContent(`Mrs. Naomi Gorelick${CL}`)
    expect(within(naomi).getByRole('link', { name: '(908) 770-5145' })).toHaveAttribute('href', 'tel:9087705145')
    expect(within(naomi).getByRole('link', { name: 'ngorelick@chailifeline.org' })).toHaveAttribute('href', 'mailto:ngorelick@chailifeline.org')
    expect(within(stay).getByRole('link', { name: 'bikkurcholimphilly.org/hospitality' })).toHaveAttribute('href', 'https://bikkurcholimphilly.org/hospitality')
    expect(rides).toHaveTextContent('From MonseyDarchei Chesed')
    expect(also).toHaveTextContent('Wheelchairs, walkers, crutches and more.')
  })

  it('a box with nothing in it isn’t shown', () => {
    vi.setSystemTime(new Date(2026, 9, 6, 13, 30))
    show({ ...chop, pantry: [], packages: undefined, rides: [{ nope: 1 }] } as DirectoryResource)
    expect(parts()).toEqual(['Who to call · 4', 'A place to stay', 'listing-shabbos', 'Miscellaneous', 'walk-list', 'listing-details'])
  })

  it('each box asks “Still right?” on its own date', () => {
    vi.setSystemTime(new Date(2026, 9, 6, 13, 30))
    show({ ...chop, sectionConfirmed: { pantry: '2026-10-05T12:00:00Z' } } as DirectoryResource)
    const boxes = screen.getAllByTestId('listing-box')
    for (const box of boxes) expect(within(box).getByTestId('freshness')).toBeInTheDocument()
    expect(boxes[1]).toHaveTextContent('Oct 5')
    expect(boxes[0]).not.toHaveTextContent('Oct 5')
  })

  it('the sukkah only from Rosh Hashanah to the end of Sukkos', () => {
    vi.setSystemTime(new Date(2026, 8, 30, 13, 30)) // Wed Sep 30, Chol HaMoed
    show()
    expect(screen.getByTestId('listing-shabbos')).toHaveTextContent('SukkahIn the Brodsky Garden')
    cleanup()
    vi.setSystemTime(new Date(2026, 9, 6, 13, 30)) // Tue Oct 6, after Sukkos
    show()
    expect(screen.getByTestId('listing-shabbos')).not.toHaveTextContent('Sukkah')
    // Nor anywhere else on the listing.
    expect(screen.getByTestId('listing-view')).not.toHaveTextContent('Brodsky Garden')
  })
})
