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
  it('says a yes/no once, as a ticked line, then the note', () => {
    vi.setSystemTime(new Date(2026, 9, 6, 13, 30))
    const hotels = makeCategory({
      id: 'hotel',
      label: 'Hotel',
      detailFields: [
        { key: 'shabbatFriendly', label: 'Shabbat friendly', type: 'boolean', renderAs: 'badge', filterable: true },
        { key: 'notes', label: 'Notes', type: 'textarea', renderAs: 'row' },
      ],
      listingParts: { main: { title: 'Shabbos here', fields: ['shabbatFriendly', 'notes'] } },
    })
    const cambria = makeListing({ id: 'cambria', shabbatFriendly: true, notes: 'Electronic keys, but reception will open door for you' }) as DirectoryResource
    renderWithProviders(<ListingView item={cambria} category={hotels} color="#000" path="/test" foot={null} />, { content: { categories: [hotels] } })
    const card = screen.getByTestId('listing-section')
    expect(card).toHaveTextContent(/^Shabbos hereShabbat friendlyElectronic keys/)
    expect(card).not.toHaveTextContent('Shabbat friendly:')
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

  it('an eruv the eruv page knows links to its weekly status; what nobody has filled in says so', () => {
    vi.setSystemTime(new Date(2026, 9, 6, 13, 30))
    open()
    const card = screen.getByTestId('listing-shabbos')
    expect(card).toHaveTextContent('EruvUniversity City Eruv · This week’s status ↗')
    expect(within(card).getByRole('link', { name: 'This week’s status ↗' })).toHaveAttribute('href', 'https://www.pennocp.org/eruv')
    expect(card).toHaveTextContent('Kosher food insideNot in the guide yet.')
    cleanup()
    open({ ...hup, eruv: 'none' })
    expect(screen.getByTestId('listing-shabbos')).toHaveTextContent('EruvNot inside an eruv')
    expect(within(screen.getByTestId('listing-shabbos')).queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('Set as location', () => {
  it('is among the buttons, and sets the hospital as where every page measures from', () => {
    vi.setSystemTime(new Date(2026, 9, 6, 13, 30))
    open()
    const actions = screen.getByTestId('listing-actions')
    fireEvent.click(within(actions).getByRole('button', { name: 'Set as location' }))
    expect(location.setListingAnchor).toHaveBeenCalledWith({ id: 'hup', name: hup.name, coords: hup.geo })
  })

  it('once set, says so, and a tap unsets it', () => {
    vi.setSystemTime(new Date(2026, 9, 6, 13, 30))
    location.anchorListingId = 'hup'
    open()
    const button = within(screen.getByTestId('listing-actions')).getByRole('button', { name: 'Location set' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(button)
    expect(location.unsetListingAnchor).toHaveBeenCalled()
  })
})
