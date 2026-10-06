// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import type { DirectoryResource } from '@/types'
import ListingView from './ListingView'
import { forgetLoadedPlaces } from './WalkList'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))

// A mile due north is 1/69 of a degree of latitude, near enough.
const at = { lat: 39.95, lng: -75.16 }
const milesNorth = (miles: number) => ({ lat: at.lat + miles / 69.05, lng: at.lng })

const shuls = makeCategory({
  id: 'synagogue',
  label: 'Synagogue',
  pluralLabel: 'Synagogues',
  detailFields: [
    {
      key: 'denomination',
      label: 'Denomination',
      type: 'select',
      filterable: true,
      renderAs: 'badge',
      options: [
        { value: 'orthodox', label: 'Orthodox (Ashkenazi)' },
        { value: 'conservative', label: 'Conservative' },
      ],
    },
    { key: 'minyanim', label: 'Minyanim', type: 'minyanim' },
  ],
})
const hotels = makeCategory({
  id: 'hotel',
  label: 'Hotel',
  pluralLabel: 'Hotels',
  walkList: { categoryId: 'synagogue', maxMinutes: 30 },
})
const hotel = makeListing({ id: 'h1', category: 'hotel', name: 'Hotel Palomar', geo: at }) as DirectoryResource
const shul = (id: string, name: string, miles: number, denomination: string) =>
  makeListing({ id, category: 'synagogue', name, denomination, geo: milesNorth(miles), address: '1 Pine St, Philadelphia, PA 19106, USA' }) as DirectoryResource
const nearby = [
  shul('s1', 'Society Hill Synagogue', 0.32, 'conservative'), // 8 min
  shul('s2', 'Mikveh Israel', 0.6, 'orthodox'), // 15 min
  shul('s3', 'Beth Zion', 1.0, 'orthodox'), // 25 min
  shul('s4', 'Far Away Shul', 2, 'orthodox'), // 50 min: out
]

const fetchMock = vi.fn()
const answer = (resources: DirectoryResource[]) => new Response(JSON.stringify({ ok: true, resources }), { status: 200 })
beforeEach(() => {
  forgetLoadedPlaces()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => answer(nearby))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** The places' own loads, not the sunset times the shuls' rows ask for. */
const placeLoads = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/resources')).length

const open = (item = hotel, category = hotels) =>
  renderWithProviders(<ListingView item={item} category={category} color="#000" path="/test" foot={null} />, { content: { categories: [hotels, shuls] } })

/** The box's line for a kind, opened to its list. */
const openKind = async (name: RegExp) => {
  const row = await screen.findByRole('button', { name })
  fireEvent.click(row)
  return row.closest('[data-testid="walk-list"]') as HTMLElement
}

describe('A hotel’s synagogues within a walk', () => {
  it('one box, a line a kind (Oct 6): how many and the nearest, the list a tap away', async () => {
    open()
    const box = await screen.findByTestId('walk-lists')
    expect(within(box).getByRole('heading', { name: 'Within a walk' })).toBeInTheDocument()
    const row = await within(box).findByRole('button', { name: /Synagogues · 3/ })
    expect(row).toHaveTextContent('Nearest: Society Hill Synagogue, 8 min')
    expect(row).toHaveAttribute('aria-expanded', 'false')
    expect(within(box).queryByRole('link')).not.toBeInTheDocument()

    const section = await openKind(/Synagogues · 3/)
    const headings = within(section).getAllByRole('heading', { level: 4 }).map((h) => h.textContent)
    expect(headings).toEqual(['Under 20 minutes · 2', '20 to 30 minutes · 1'])
    const rows = within(section).getAllByRole('link', { name: /min/ }).map((a) => a.textContent)
    // Each says what the Synagogues page says: its denomination and its
    // davening.
    expect(rows).toEqual([
      '8 minSociety Hill SynagogueConservative · No davening times listed',
      '15 minMikveh IsraelOrthodox (Ashkenazi) · No davening times listed',
      '25 minBeth ZionOrthodox (Ashkenazi) · No davening times listed',
    ])
    expect(within(section).queryByText('Far Away Shul')).not.toBeInTheDocument()
    // A place's row opens it; only the kind's line has a chevron (Oct 6).
    expect(within(section).getAllByRole('link', { name: /min/ }).every((l) => !l.querySelector('svg'))).toBe(true)
    // The same places on the Map, from the hotel.
    expect(within(section).getByRole('link', { name: 'See them on the map' })).toHaveAttribute('href', '/test-community/map?cat=hotel%2Csynagogue&place=h1')
    expect(fetchMock).toHaveBeenCalledWith('/api/resources?category=synagogue&community=test-community')
    expect(placeLoads()).toBe(1)
  })

  it('opens a shul on its own page, and says how rough the times are', async () => {
    open()
    await openKind(/Synagogues · 3/)
    const link = screen.getByRole('link', { name: /Mikveh Israel/ })
    expect(link.getAttribute('href')).toMatch(/^\/test-community\/synagogue\/mikveh-israel/)
    expect(screen.getByTestId('walk-lists')).toHaveTextContent('Rough walking times from the hotel, in a straight line at 25 minutes a mile')
    expect(screen.getByText('Tap one for its Shabbos times.')).toBeInTheDocument()
  })

  it('says when there are none within the walk, and names the nearest', async () => {
    fetchMock.mockImplementation(async () => answer([nearby[3]]))
    open()
    const box = await screen.findByTestId('walk-lists')
    await vi.waitFor(() => expect(box).toHaveTextContent('None within a 30-minute walk. Nearest: Far Away Shul, 50 min.'))
    expect(within(box).getByRole('link', { name: 'Far Away Shul' })).toBeInTheDocument()
    expect(within(box).queryByRole('button')).not.toBeInTheDocument()
  })

  it('says when they couldn’t load, and tries again the next time', async () => {
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ ok: false }), { status: 502 }))
    open()
    expect(await screen.findByText('The synagogues nearby couldn’t load.')).toBeInTheDocument()
    cleanup()
    open()
    expect(await screen.findByRole('button', { name: /Synagogues · 3/ })).toBeInTheDocument()
    expect(placeLoads()).toBe(2)
  })

  it('loads the shuls once for every hotel opened after', async () => {
    open()
    await screen.findByRole('button', { name: /Synagogues · 3/ })
    cleanup()
    open({ ...hotel, id: 'h2', name: 'Another Hotel' })
    await screen.findByRole('button', { name: /Synagogues · 3/ })
    expect(placeLoads()).toBe(1)
  })

  it('leaves nothing behind when the category it lists is gone', () => {
    renderWithProviders(<ListingView item={hotel} category={hotels} color="#000" path="/test" foot={null} />, { content: { categories: [hotels] } })
    expect(screen.queryByTestId('walk-lists')).not.toBeInTheDocument()
  })

  it('isn’t there for a hotel with no location, or a category that doesn’t ask for it', () => {
    open({ ...hotel, geo: undefined })
    expect(screen.queryByTestId('walk-lists')).not.toBeInTheDocument()
    cleanup()
    open(hotel, { ...hotels, walkList: undefined })
    expect(screen.queryByTestId('walk-lists')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// A hospital's lists (step 5): food grouped by Store Type, shuls, hotels by
// Shabbat friendly.
describe('A hospital’s places within a walk', () => {
  const food = makeCategory({
    id: 'restaurant',
    label: 'Food',
    pluralLabel: 'Food',
    detailFields: [
      { key: 't', label: 'Food Type', type: 'select', renderAs: 'badge', filterable: true, options: [{ value: 'Parve', label: 'Parve' }] },
      {
        key: 'foodType',
        label: 'Store Type',
        type: 'select',
        renderAs: 'badge',
        filterable: true,
        options: [
          { value: 'Restaurant', label: 'Restaurant' },
          { value: 'Bakery', label: 'Bakery' },
        ],
      },
    ],
  })
  const hotelsCat = makeCategory({
    id: 'hotel',
    label: 'Hotel',
    pluralLabel: 'Hotels',
    detailFields: [{ key: 'shabbatFriendly', label: 'Shabbat friendly', type: 'boolean', renderAs: 'badge', filterable: true }],
  })
  const hospitals = makeCategory({
    id: 'hospital',
    label: 'Hospital',
    pluralLabel: 'Hospitals',
    walkList: [
      { categoryId: 'restaurant', maxMinutes: 30, groupBy: 'foodType' },
      { categoryId: 'synagogue', maxMinutes: 30 },
      { categoryId: 'hotel', maxMinutes: 30, groupBy: 'shabbatFriendly' },
    ],
  })
  const hup = makeListing({ id: 'hup', category: 'hospital', name: 'HUP', geo: at }) as DirectoryResource
  const placeAt = (category: string, id: string, miles: number, details: Record<string, unknown>) =>
    makeListing({ id, category, name: id, geo: milesNorth(miles), ...details }) as DirectoryResource
  const byCategory: Record<string, DirectoryResource[]> = {
    restaurant: [
      placeAt('restaurant', '20th Street Pizza', 1.08, { t: 'Parve', foodType: 'Restaurant' }), // 27 min
      placeAt('restaurant', 'Insomnia Cookies', 0.24, { foodType: 'Bakery' }), // 6 min
    ],
    synagogue: [shul('mekor', 'Mekor Habracha', 1.48, 'orthodox')], // 37 min: out
    hotel: [placeAt('hotel', 'Marriott', 0.64, { shabbatFriendly: true }), placeAt('hotel', 'Morris House', 0.16, {})],
  }
  const openHospital = (lists = byCategory) => {
    fetchMock.mockImplementation(async (url: string) => {
      const id = new URL(String(url), 'http://x').searchParams.get('category')
      return answer(id ? (lists[id] ?? []) : [])
    })
    return renderWithProviders(<ListingView item={hup} category={hospitals} color="#000" path="/test" foot={null} />, {
      content: { categories: [hospitals, food, shuls, hotelsCat] },
    })
  }

  it('a line for each, the food opening grouped as chosen, answering with the nearest restaurant and what’s nearer', async () => {
    openHospital()
    const box = await screen.findByTestId('walk-lists')
    await within(box).findByRole('button', { name: /Food · 2/ })
    const [foodRow, shulRow, hotelRow] = within(box).getAllByTestId('walk-list')
    expect(foodRow).toHaveTextContent('Nearest: Insomnia Cookies, 6 min')
    await vi.waitFor(() => expect(shulRow).toHaveTextContent('None within a 30-minute walk. Nearest: Mekor Habracha, 37 min.'))
    expect(hotelRow).toHaveTextContent('Hotels · 2')

    fireEvent.click(within(foodRow).getByRole('button', { name: /Food · 2/ }))
    expect(within(foodRow).getByTestId('walk-answer')).toHaveTextContent('Nearest restaurant: 20th Street Pizza, 27 min. Nearer: Insomnia Cookies, a bakery, 6 min.')
    expect(within(foodRow).getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual(['Restaurant · 1', 'Bakery · 1'])
    // The row's facts, less the Store Type it's grouped by.
    expect(within(foodRow).getByRole('link', { name: /20th Street Pizza/ })).toHaveTextContent('27 min20th Street PizzaParve')

    fireEvent.click(within(hotelRow).getByRole('button', { name: /Hotels · 2/ }))
    expect(within(hotelRow).getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual(['Shabbat friendly · 1', 'Doesn’t say · 1'])
    expect(placeLoads()).toBe(3)
  })

  it('says so on each line when nothing on any list is within the walk, naming the nearest', async () => {
    openHospital({ restaurant: [placeAt('restaurant', 'Rolings Bakery', 2.5, { foodType: 'Bakery' })], synagogue: [], hotel: [] })
    const box = await screen.findByTestId('walk-lists')
    await vi.waitFor(() => expect(within(box).getAllByTestId('walk-list')[0]).toHaveTextContent('None within a 30-minute walk. Nearest: Rolings Bakery, 2.5 mi.'))
    expect(within(box).getAllByTestId('walk-list')[1]).toHaveTextContent('Synagogues')
    expect(within(box).getAllByTestId('walk-list')[1]).toHaveTextContent('None within a 30-minute walk.')
  })
})
