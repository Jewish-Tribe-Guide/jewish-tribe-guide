// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Activity, useCallback, useState } from 'react'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import type { DirectoryResource } from '@/types'
import ListingView from './ListingView'
import { forgetLoadedPlaces, forgetLoadedWalkRoutes } from './WalkList'
import { WalkOnMapContext } from './walkOnMap'
import { createHighlight } from './CategoryMap'

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
  forgetLoadedWalkRoutes()
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
    // Just how many: the list says which is nearest (the user, Oct 15).
    expect(row).toHaveTextContent(/^Synagogues · 3$/)
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

  // Oct 15: walks worked out along the streets (walkRoutes.ts) replace the
  // straight-line estimate, while neither end has moved since.
  describe('along the streets', () => {
    const route = (to: DirectoryResource, minutes: number, miles: number) => ({ from: at, to: to.geo, minutes, meters: Math.round(miles * 1609.344) })
    const withRoutes = (routes: Record<string, unknown>) =>
      fetchMock.mockImplementation(async (url: string) =>
        String(url).startsWith('/api/walk-routes') ? new Response(JSON.stringify({ ok: true, routes }), { status: 200 }) : answer(nearby),
      )

    it('lists each place by its walk along the streets, nearest first, and says where the times are from', async () => {
      // Society Hill is across a highway: 8 minutes as the crow flies, 22
      // on foot. Far Away Shul has a straight path: in reach after all.
      withRoutes({ s1: route(nearby[0], 22, 0.9), s2: route(nearby[1], 14, 0.6), s3: route(nearby[2], 24, 1.0), s4: route(nearby[3], 29, 1.5) })
      open()
      const section = await openKind(/Synagogues · 4/)
      expect(within(section).getAllByRole('link', { name: /min/ }).map((a) => a.textContent)).toEqual([
        '14 minMikveh IsraelOrthodox (Ashkenazi) · No davening times listed',
        '22 minSociety Hill SynagogueConservative · No davening times listed',
        '24 minBeth ZionOrthodox (Ashkenazi) · No davening times listed',
        '29 minFar Away ShulOrthodox (Ashkenazi) · No davening times listed',
      ])
      expect(screen.getByTestId('walk-lists')).toHaveTextContent('Walking times from the hotel along the streets, from openrouteservice.org and © OpenStreetMap contributors.')
      expect(screen.getByTestId('walk-lists')).not.toHaveTextContent('rough estimate')
    })

    it('a place that moved since its walk was worked out shows the estimate, and the box says some are rough', async () => {
      withRoutes({ s1: { ...route(nearby[0], 22, 0.9), to: milesNorth(0.1) }, s2: route(nearby[1], 14, 0.6), s3: route(nearby[2], 24, 1.0) })
      open()
      const section = await openKind(/Synagogues · 3/)
      await vi.waitFor(() => expect(within(section).getAllByRole('link', { name: /min/ })[0]).toHaveTextContent(/^8 minSociety Hill/))
      expect(screen.getByTestId('walk-lists')).toHaveTextContent('A place added since last night is a rough estimate until then.')
    })
  })

  // Oct 15: the shuls' minyanim by time, a line of its own under theirs
  // ("two lists, keep it simple"), one open at a time.
  describe('their minyanim, by time', () => {
    const davening = (s: DirectoryResource, ...minyanim: { tefillah: string; days: string[]; time: string }[]) => ({
      ...s,
      minyanim: minyanim.map((m, i) => ({ id: `${s.id}${i}`, ...m })),
    })
    const withMinyanim = () => [
      davening(nearby[0], { tefillah: 'mincha', days: ['mon'], time: '6:30pm' }, { tefillah: 'shacharis', days: ['tue'], time: '7:00am' }),
      davening(nearby[1], { tefillah: 'mincha', days: ['mon'], time: '6:20pm' }, { tefillah: 'shacharis', days: ['mon'], time: '7:00am' }),
      nearby[2],
      // Out of the walk: not here.
      davening(nearby[3], { tefillah: 'maariv', days: ['mon'], time: '8:00pm' }),
    ]
    const at5pmMonday = () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-09-28T17:00:00-04:00'))
    }
    afterEach(() => vi.useRealTimers())

    it('a line beside the shuls: how many are left today and the next, opening to them by time with each walk', async () => {
      at5pmMonday()
      fetchMock.mockImplementation(async () => answer(withMinyanim()))
      open()
      const line = await screen.findByRole('button', { name: /Minyanim · 2 left today/ })
      // Just how many: the list says which is next (the user, Oct 15).
      expect(line).toHaveTextContent(/^Minyanim · 2 left today$/)
      expect(line).toHaveAttribute('aria-expanded', 'false')

      // The shuls' own list doesn't open with "Nearest minyan": the
      // Minyanim line has them by time.
      await openKind(/Synagogues · 3/)
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(screen.queryByTestId('walk-answer')).not.toBeInTheDocument()
      fireEvent.click(line)
      const section = line.closest('[data-testid="walk-minyanim"]') as HTMLElement
      expect(within(section).getByRole('heading', { level: 4 })).toHaveTextContent('Today · 2')
      expect(within(section).getAllByRole('link').map((a) => a.textContent)).toEqual([
        '6:20 PMMikveh IsraelMincha · Orthodox (Ashkenazi) · 15 min walk',
        '6:30 PMSociety Hill SynagogueMincha · Conservative · 8 min walk',
      ])
      expect(within(section).getAllByRole('link')[0].getAttribute('href')).toMatch(/^\/test-community\/synagogue\/mikveh-israel/)
      // One open at a time: the shuls' own line closed.
      expect(screen.getByRole('button', { name: /Synagogues · 3/ })).toHaveAttribute('aria-expanded', 'false')
    })

    it('with none left today, tomorrow’s', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-09-28T21:00:00-04:00'))
      fetchMock.mockImplementation(async () => answer(withMinyanim()))
      open()
      const line = await screen.findByRole('button', { name: /^Minyanim/ })
      expect(line).toHaveTextContent(/^Minyanim · 1 tomorrow$/)
      fireEvent.click(line)
      expect(within(line.closest('[data-testid="walk-minyanim"]') as HTMLElement).getByRole('heading', { level: 4 })).toHaveTextContent('Tomorrow · 1')
    })

    it('isn’t there when no shul in the walk lists its times', async () => {
      open()
      await screen.findByRole('button', { name: /Synagogues · 3/ })
      expect(screen.queryByTestId('walk-minyanim')).not.toBeInTheDocument()
    })
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

// Oct 6: where the category's map is beside the listing, an opened kind's
// places go on it, a row under the pointer lights its pin, and there's no
// "See them on the map" (the map is right there).
describe('Within a walk, on the map beside it', () => {
  it('shows the opened kind’s places on the map, lights a row’s pin, and clears them when closed', async () => {
    const show = vi.fn()
    const highlight = createHighlight()
    renderWithProviders(
      <WalkOnMapContext.Provider value={{ show, highlight }}>
        <ListingView item={hotel} category={hotels} color="#000" path="/test" foot={null} />
      </WalkOnMapContext.Provider>,
      { content: { categories: [hotels, shuls] } },
    )
    const section = await openKind(/Synagogues · 3/)
    expect(show).toHaveBeenLastCalledWith({ categoryId: 'synagogue', places: [nearby[0], nearby[1], nearby[2]] })
    expect(within(section).queryByRole('link', { name: 'See them on the map' })).not.toBeInTheDocument()

    fireEvent.mouseEnter(within(section).getByRole('link', { name: /Mikveh Israel/ }))
    expect(highlight.get()).toBe('s2')
    fireEvent.mouseLeave(within(section).getByRole('link', { name: /Mikveh Israel/ }))
    expect(highlight.get()).toBeNull()

    fireEvent.click(within(section).getByRole('button', { name: /Synagogues · 3/ }))
    expect(show).toHaveBeenLastCalledWith(null)
  })

  // Oct 15, on the preview: hovering a shul lit no pin and a row was slow
  // to open. The map beside the listing is the page's state, so showing
  // places on it renders the listing again; the places shown changed on
  // every render, so they were shown again, and again, each time clearing
  // the pin under the pointer. A map that renders the page, as the real one
  // does, not a function that records calls.
  it('shows them once, with a map that renders the page, and a hovered pin stays lit', async () => {
    const highlight = createHighlight()
    const shows: unknown[] = []
    function Page() {
      const [, setShown] = useState<unknown>(null)
      const show = useCallback((shown: unknown) => {
        shows.push(shown)
        // Past 20 the loop is plain: stop it here, so the test fails
        // rather than hanging (the loop never yields to a timeout).
        if (shows.length <= 20) setShown(shown)
      }, [])
      return (
        <WalkOnMapContext.Provider value={{ show, highlight }}>
          <ListingView item={hotel} category={hotels} color="#000" path="/test" foot={null} />
        </WalkOnMapContext.Provider>
      )
    }
    renderWithProviders(<Page />, { content: { categories: [hotels, shuls] } })
    const section = await openKind(/Synagogues · 3/)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(shows.filter(Boolean).length).toBe(1)

    fireEvent.mouseEnter(within(section).getByRole('link', { name: /Mikveh Israel/ }))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(highlight.get()).toBe('s2')
  })

  // Oct 6: a shul in the list opened, then Back. The hotel comes back as it
  // was left, kept while hidden, with Synagogues still open; its places
  // must come back on the map with it, not just the open list.
  it('puts the open kind’s places back on the map when the listing is shown again', async () => {
    const show = vi.fn()
    const highlight = createHighlight()
    function Page({ mode }: { mode: 'visible' | 'hidden' }) {
      return (
        <WalkOnMapContext.Provider value={{ show, highlight }}>
          <Activity mode={mode}>
            <ListingView item={hotel} category={hotels} color="#000" path="/test" foot={null} />
          </Activity>
        </WalkOnMapContext.Provider>
      )
    }
    const { rerenderWithProviders: rerender } = renderWithProviders(<Page mode="visible" />, { content: { categories: [hotels, shuls] } })
    await openKind(/Synagogues · 3/)
    expect(show).toHaveBeenLastCalledWith({ categoryId: 'synagogue', places: [nearby[0], nearby[1], nearby[2]] })

    // Opened by a click: the pointer never leaves its row.
    fireEvent.mouseEnter(screen.getByRole('link', { name: /Mikveh Israel/ }))
    rerender(<Page mode="hidden" />)
    expect(show).toHaveBeenLastCalledWith(null)
    expect(highlight.get()).toBeNull()
    rerender(<Page mode="visible" />)
    expect(screen.getByRole('button', { name: /Synagogues · 3/ })).toHaveAttribute('aria-expanded', 'true')
    expect(show).toHaveBeenLastCalledWith({ categoryId: 'synagogue', places: [nearby[0], nearby[1], nearby[2]] })
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

  it('a line for each, the food opening grouped as chosen, with no answer over it', async () => {
    openHospital()
    const box = await screen.findByTestId('walk-lists')
    await within(box).findByRole('button', { name: /Food · 2/ })
    const [foodRow, shulRow, hotelRow] = within(box).getAllByTestId('walk-list')
    expect(foodRow).not.toHaveTextContent('Nearest: Insomnia Cookies')
    await vi.waitFor(() => expect(shulRow).toHaveTextContent('None within a 30-minute walk. Nearest: Mekor Habracha, 37 min.'))
    expect(hotelRow).toHaveTextContent('Hotels · 2')

    fireEvent.click(within(foodRow).getByRole('button', { name: /Food · 2/ }))
    // No "Nearest restaurant" over it: the list says it (the user, Oct 15).
    expect(within(foodRow).queryByTestId('walk-answer')).not.toBeInTheDocument()
    expect(foodRow).not.toHaveTextContent('Nearest restaurant')
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
