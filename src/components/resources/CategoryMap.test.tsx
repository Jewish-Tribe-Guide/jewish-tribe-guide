// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import type { DirectoryResource } from '@/types'
import type { MapPoint } from '@/components/map/ResourceMap'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// The Google map itself is out of scope (ResourceMap has its own tests):
// a stand-in shows the pins it's given, and which is drawn larger.
// Counts whether the map's code was fetched at all, not just drawn.
const loaded = vi.hoisted(() => ({ count: 0, brokenOnLight: false }))
vi.mock('@/components/map/ResourceMap', () => {
  loaded.count++
  return {
  default: function ResourceMap({ points, selectedId, onSelectPoint }: { points: MapPoint[]; selectedId?: string; onSelectPoint: (p: MapPoint) => void }) {
      // As Google's own code did when it had refused the map.
      if (loaded.brokenOnLight && selectedId) throw new TypeError("Cannot read properties of undefined (reading 'keys')")
      return (
        <div data-testid="google-map">
          {points.map((p) => (
            <button key={p.id} onClick={() => onSelectPoint(p)}>
              {p.name}
              {p.id === selectedId ? ' (larger)' : ''}
            </button>
          ))}
        </div>
      )
  },
  }
})

const { default: CategoryMap, createHighlight } = await import('./CategoryMap')

/** A screen of the given width, as matchMedia reports it. */
function screenWidth(width: number) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('min-width: 1024px') ? width >= 1024 : query.includes('max-width: 639px') ? width < 640 : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

const food = makeCategory({ id: 'restaurant', label: 'Food', icon: '🍽️' })
const items = [
  makeListing({ id: 'a', name: 'Alpha Grill', geo: { lat: 39.95, lng: -75.17 } }),
  makeListing({ id: 'b', name: 'No Address' }),
  makeListing({ id: 'c', name: 'Cafe', geo: { lat: 39.94, lng: -75.16 } }),
] as DirectoryResource[]
const original = window.matchMedia

afterEach(() => {
  cleanup()
  window.matchMedia = original
})

const render = (props: Partial<Parameters<typeof CategoryMap>[0]> = {}) => {
  const highlight = createHighlight()
  const onSelect = vi.fn()
  const onHide = vi.fn()
  renderWithProviders(
    <CategoryMap category={food} items={items} searchActive={false} highlight={highlight} onSelect={onSelect} onHide={onHide} fullMapHref="/test-community/map?cat=restaurant" {...props} />,
  )
  return { highlight, onSelect, onHide }
}

describe('CategoryMap', () => {
  // First, before anything here has fetched the map's code.
  it('fetches none of the map’s code on a screen too narrow to show it', async () => {
    screenWidth(800)
    render()
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByTestId('google-map')).not.toBeInTheDocument()
    expect(loaded.count).toBe(0)
  })

  it('pins every place the list shows that has an address', async () => {
    screenWidth(1440)
    render()
    expect(await screen.findByRole('button', { name: 'Alpha Grill' })).toBeInTheDocument()
    expect(loaded.count).toBe(1)
    expect(screen.getByRole('button', { name: 'Cafe' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'No Address' })).not.toBeInTheDocument()
  })

  it('draws the pin of the row the pointer is on larger', async () => {
    screenWidth(1440)
    const { highlight } = render()
    await screen.findByTestId('google-map')
    act(() => highlight.set('c'))
    expect(screen.getByRole('button', { name: 'Cafe (larger)' })).toBeInTheDocument()
  })

  it('finds a pin’s row when the pin is clicked', async () => {
    screenWidth(1440)
    const user = userEvent.setup()
    const { onSelect } = render()
    await user.click(await screen.findByRole('button', { name: 'Cafe' }))
    expect(onSelect).toHaveBeenCalledWith('c')
  })

  it('keeps a map that fails to itself: its box says so, and nothing reaches the page', async () => {
    screenWidth(1440)
    loaded.brokenOnLight = true
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { highlight } = render()
      await screen.findByTestId('google-map')
      act(() => highlight.set('c'))
      expect(screen.getByRole('status')).toHaveTextContent('The map couldn’t load. Everything on it is in the list.')
      expect(screen.getByRole('button', { name: 'Hide map' })).toBeInTheDocument()
    } finally {
      loaded.brokenOnLight = false
      quiet.mockRestore()
    }
  })

  it('has Hide map, and a way to the full Map page', async () => {
    screenWidth(1440)
    const user = userEvent.setup()
    const { onHide } = render()
    await user.click(screen.getByRole('button', { name: 'Hide map' }))
    expect(onHide).toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Open the full map' })).toHaveAttribute('href', '/test-community/map?cat=restaurant')
  })
})
