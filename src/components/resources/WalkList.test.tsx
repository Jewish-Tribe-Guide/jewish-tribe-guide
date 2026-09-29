// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import type { DirectoryResource } from '@/types'
import PlaceDetailBody from './PlaceDetailBody'
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

const open = (item = hotel, category = hotels) =>
  renderWithProviders(<PlaceDetailBody item={item} category={category} />, { content: { categories: [hotels, shuls] } })

describe('A hotel’s synagogues within a walk', () => {
  it('lists every shul within the walk, nearest first, under and past 20 minutes', async () => {
    open()
    const section = await screen.findByTestId('walk-list')
    expect(within(section).getByRole('heading', { name: 'Synagogues within a walk' })).toBeInTheDocument()
    await within(section).findByText('Society Hill Synagogue')

    const headings = within(section).getAllByRole('heading', { level: 4 }).map((h) => h.textContent)
    expect(headings).toEqual(['Under 20 minutes · 2', '20 to 30 minutes · 1'])
    const rows = within(section).getAllByRole('link').map((a) => a.textContent)
    expect(rows).toEqual([
      '8 minSociety Hill SynagogueConservative · Philadelphia',
      '15 minMikveh IsraelOrthodox (Ashkenazi) · Philadelphia',
      '25 minBeth ZionOrthodox (Ashkenazi) · Philadelphia',
    ])
    expect(within(section).queryByText('Far Away Shul')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/resources?category=synagogue&community=test-community')
  })

  it('opens a shul on its own page, and says how rough the times are', async () => {
    open()
    const link = await screen.findByRole('link', { name: /Mikveh Israel/ })
    expect(link.getAttribute('href')).toMatch(/^\/test-community\/synagogue\/mikveh-israel/)
    expect(screen.getByText(/Rough walking times from the hotel, in a straight line at 25 minutes a mile/)).toHaveTextContent(
      'Tap one for its Shabbos times.',
    )
  })

  it('says when there are none within the walk', async () => {
    fetchMock.mockImplementation(async () => answer([nearby[3]]))
    open()
    expect(await screen.findByText('No synagogues listed within a 30-minute walk.')).toBeInTheDocument()
  })

  it('says when they couldn’t load, and tries again the next time', async () => {
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ ok: false }), { status: 502 }))
    open()
    expect(await screen.findByText('The synagogues nearby couldn’t load.')).toBeInTheDocument()
    cleanup()
    open()
    expect(await screen.findByText('Society Hill Synagogue')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('loads the shuls once for every hotel opened after', async () => {
    open()
    await screen.findByText('Society Hill Synagogue')
    cleanup()
    open({ ...hotel, id: 'h2', name: 'Another Hotel' })
    await screen.findByText('Society Hill Synagogue')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('leaves nothing behind, not even its divider, when the category it lists is gone', () => {
    const { container } = renderWithProviders(<PlaceDetailBody item={hotel} category={hotels} />, { content: { categories: [hotels] } })
    expect(screen.queryByTestId('walk-list')).not.toBeInTheDocument()
    expect(container.querySelector('hr:last-child')).toBeNull()
  })

  it('isn’t there for a hotel with no location, or a category that doesn’t ask for it', () => {
    open({ ...hotel, geo: undefined })
    expect(screen.queryByTestId('walk-list')).not.toBeInTheDocument()
    cleanup()
    open(hotel, { ...hotels, walkList: undefined })
    expect(screen.queryByTestId('walk-list')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
