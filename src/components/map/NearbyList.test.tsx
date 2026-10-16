// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { PinnedProvider } from '@/lib/pinnedContext'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import type { MapPoint } from './ResourceMap'
import NearbyList from './NearbyList'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// hoverCapable's `(hover: hover) and (pointer: fine)` query — the global
// vitest.setup.ts stub always reports `matches: false` (its own default is
// tuned for useIsMobile's SSR-safe fallback), which would put these rows on
// the touch drag path instead of the desktop wheel path this file tests.
window.matchMedia = ((query: string) => ({
  matches: true,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function makePoint(overrides: Partial<MapPoint & { filterId: string }> = {}) {
  return {
    id: 'listing-1',
    filterId: 'grocery',
    lat: 0,
    lng: 0,
    name: 'Test Grocery',
    color: '#000',
    ...overrides,
  }
}

function renderRow(point = makePoint()) {
  renderWithProviders(
    <PinnedProvider>
      <NearbyList points={[point]} userLocation={null} onViewListing={vi.fn()} />
    </PinnedProvider>,
  )
  // The row's sliding content, found through the row's own name: the
  // Save/Share strip is only mounted while a row is swiped open (see
  // SwipeRow), so there's no Save button to find it by at rest.
  const content = screen.getByText('Test Grocery').closest('div.px-4') as HTMLElement
  // The wrapper spans the content and the revealed strip both, and is where
  // the wheel listener lives — see the closing-swipe test below.
  const wrapper = content.parentElement as HTMLElement
  return { wrapper, content }
}

const pinButton = () => screen.getByRole('button', { name: /^Save Test Grocery/ })

// A trackpad swipe has no discrete "end" the way a touch release does — the
// row treats a 150ms gap since the last wheel tick as the gesture finishing
// (see NearbyList's own wheelSettleTimer comment).
async function settle() {
  await new Promise((r) => setTimeout(r, 200))
}

describe('NearbyList row swipe (desktop trackpad)', () => {
  it('opens on a leftward swipe, revealing the Save/Share strip', async () => {
    const { content } = renderRow()
    expect(content.style.transform).toBe('')
    expect(screen.queryByRole('button', { name: /^Save Test Grocery/ })).not.toBeInTheDocument()

    fireEvent.wheel(content, { deltaX: 100, deltaY: 0 })
    await settle()

    expect(content.style.transform).toBe('translateX(-104px)')
    expect(pinButton()).toBeInTheDocument()
  })

  // The bug this guards: the wheel listener used to live on the content row
  // only, which had already slid REVEAL_WIDTH out from under the cursor once
  // open — a closing swipe starting with the pointer over the now-revealed
  // Save button landed on that button (no wheel listener of its own) and did
  // nothing at all. Moving the listener to the row's outer wrapper (which
  // spans the revealed strip too, regardless of the content's own transform)
  // is what makes this pass.
  it('closes on a rightward swipe even when it starts over the revealed Save button', async () => {
    const { content } = renderRow()

    fireEvent.wheel(content, { deltaX: 100, deltaY: 0 })
    await settle()
    expect(content.style.transform).toBe('translateX(-104px)')

    fireEvent.wheel(pinButton(), { deltaX: -100, deltaY: 0 })
    await settle()

    expect(content.style.transform).toBe('')
  })

  // Regression guard for the "requires too big a swipe" complaint: a swipe
  // well short of half the reveal width (40 of 104px, vs. a 50%/52px line)
  // should still commit the row open, matching iMessage/Mail's own lower
  // reveal threshold. Fails against a half-width threshold, which would
  // leave this swipe short and snap the row back closed.
  it('opens on a swipe well short of half the reveal width', async () => {
    const { content } = renderRow()

    fireEvent.wheel(content, { deltaX: 40, deltaY: 0 })
    await settle()

    expect(content.style.transform).toBe('translateX(-104px)')
  })

  // A rubber-band give past the limit (drag past -168px, spring back on
  // release) was tried and reverted — reported live as an unwanted "snap
  // back" once the finger let go. Dragging well past the reveal width
  // should just hard-stop exactly at it, mid-drag, with no overshoot to
  // correct back from afterward.
  it('hard-stops at the reveal width instead of overshooting past it', async () => {
    const { content } = renderRow()

    fireEvent.wheel(content, { deltaX: 300, deltaY: 0 })

    expect(content.style.transform).toBe('translateX(-104px)')

    await settle()
    expect(content.style.transform).toBe('translateX(-104px)')
  })

  // A row's own `pinned` badge is driven by the `points` prop its parent
  // passes in (ResourceMapView recomputes that from PinnedContext) — not
  // something NearbyList re-derives for itself mid-render — so this checks
  // the actual persisted effect of the click (localStorage, via
  // PinnedProvider) rather than an aria-label this component doesn't own.
  it('still lets a plain click on the Save button save the place', async () => {
    const { content } = renderRow()
    fireEvent.wheel(content, { deltaX: 100, deltaY: 0 })
    await settle()

    fireEvent.click(pinButton())

    expect(localStorage.getItem('jpc:pinned-listings')).toContain('listing-1')
  })

  // The left avatar's own SavedBadge (see GenericListingCard's identical
  // treatment) — the row's right-side category badge used to draw its own
  // separate overlay too, which repeated the same fact twice on one row;
  // that overlay is gone now, so a saved row shows the badge exactly once.
  it('shows the saved badge on the left avatar only when the point is saved', () => {
    renderWithProviders(
      <PinnedProvider>
        <NearbyList points={[makePoint({ pinned: false })]} userLocation={null} onViewListing={vi.fn()} />
      </PinnedProvider>,
    )
    expect(screen.queryByTestId('saved-badge')).not.toBeInTheDocument()

    cleanup()
    renderWithProviders(
      <PinnedProvider>
        <NearbyList points={[makePoint({ pinned: true })]} userLocation={null} onViewListing={vi.fn()} />
      </PinnedProvider>,
    )
    expect(screen.getAllByTestId('saved-badge')).toHaveLength(1)
  })

  // The Eruv chip from everything (Oct 15): with the lines alone on the map,
  // the list has the eruvim, not "nothing to show"; a row opens its eruv.
  it('lists the eruvim, each with its status, when they are all the map shows', () => {
    const onSelectEruv = vi.fn()
    renderWithProviders(
      <PinnedProvider>
        <NearbyList
          points={[]}
          userLocation={null}
          onViewListing={vi.fn()}
          eruvim={[
            { id: 'center-city', name: 'Center City Eruv', tone: 'green', label: 'Up' },
            { id: 'university-city', name: 'University City Eruv', tone: 'red', label: 'Down' },
          ]}
          onSelectEruv={onSelectEruv}
        />
      </PinnedProvider>,
    )
    const list = screen.getByTestId('nearby-eruvim')
    expect(list).toHaveTextContent('Center City EruvUp')
    expect(list).toHaveTextContent('University City EruvDown')
    fireEvent.click(screen.getByText('University City Eruv'))
    expect(onSelectEruv).toHaveBeenCalledWith('university-city')
  })

  // The user, Oct 15: picking a category with the lines on made the eruvim
  // "disappear". They stay, first, with the places under them.
  it('keeps the eruvim first when there are places too, the places under them', () => {
    renderWithProviders(
      <PinnedProvider>
        <NearbyList points={[makePoint()]} userLocation={null} onViewListing={vi.fn()} eruvim={[{ id: 'center-city', name: 'Center City Eruv', tone: 'green', label: 'Up' }]} />
      </PinnedProvider>,
    )
    const eruvim = screen.getByTestId('nearby-eruvim')
    expect(eruvim).toHaveTextContent('Center City EruvUp')
    const place = screen.getByText('Test Grocery')
    expect(eruvim.compareDocumentPosition(place) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

// The user, Oct 15: the map's rows felt small beside a category page's
// ("hospital listings feel pristine"). They say what a category page's row
// says: where it is beside the name, then whether it's open and its
// hechsher, not its category and a street address cut off halfway.
describe('NearbyList — what a row says', () => {
  const hours = { key: 'hours', label: 'Hours', type: 'hours' as const, renderAs: 'row' as const }
  const cert = { key: 'kosherCert', label: 'Kosher Certification', type: 'select' as const, renderAs: 'badge' as const, filterable: true }
  const food = makeCategory({ id: 'restaurant', label: 'Food', pluralLabel: 'Food', detailFields: [hours, cert] })
  const everyDay = Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open: '00:00', close: '23:59' }]))

  it('a listing: its name and where, then its facts line, in a category page’s sizes; no street address', () => {
    const raw = makeListing({ id: 'judah', category: 'restaurant', name: 'Judah', address: '1 Main St, Philadelphia, PA 19103, USA', hours: everyDay, kosherCert: 'Keystone-K' })
    renderWithProviders(
      <PinnedProvider>
        <NearbyList points={[makePoint({ id: 'judah', filterId: 'restaurant', name: 'Judah', categoryLabel: 'Food', address: raw.address, raw } as Partial<MapPoint & { filterId: string }>)]} userLocation={null} onViewListing={vi.fn()} />
      </PinnedProvider>,
      { content: { categories: [food] } },
    )
    const name = screen.getByTestId('nearby-name')
    expect(name).toHaveTextContent(/^Judah/)
    // The page's name size, not the old 14px.
    expect(name.className).not.toMatch(/\btext-sm\b/)
    const facts = screen.getByTestId('nearby-facts')
    expect(facts).toHaveTextContent(/^Open( until [^·]+)?·Keystone-K$/)
    expect(facts.className).toMatch(/text-\[13\.5px\]/)
    expect(screen.queryByText(/1 Main St/)).not.toBeInTheDocument()
  })

  it('a hospital, with no listing behind it, still says what and where', () => {
    renderWithProviders(
      <PinnedProvider>
        <NearbyList points={[makePoint({ id: 'h1', filterId: '__hospitals__', name: 'Jefferson', categoryLabel: 'Hospital', address: '111 S 11th St' } as Partial<MapPoint & { filterId: string }>)]} userLocation={null} />
      </PinnedProvider>,
    )
    expect(screen.getByTestId('nearby-facts')).toHaveTextContent('Hospital · 111 S 11th St')
  })
})

// The user, Oct 16: with several kinds of place in the list, people want to
// know which each is. Said first on the second line, in its pins' colour;
// not in a list of one kind, where it would say the same thing every row.
describe('NearbyList — which kind of place', () => {
  const hours = { key: 'hours', label: 'Hours', type: 'hours' as const, renderAs: 'row' as const }
  const food = makeCategory({ id: 'restaurant', label: 'Food', detailFields: [hours] })
  const grocery = makeCategory({ id: 'grocery', label: 'Grocery', detailFields: [hours] })
  const everyDay = Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open: '00:00', close: '23:59' }]))
  const point = (id: string, filterId: string, categoryLabel: string, color: string) =>
    makePoint({ id, filterId, name: id, categoryLabel, color, raw: makeListing({ id, category: filterId, name: id, hours: everyDay }) } as Partial<MapPoint & { filterId: string }>)
  const list = (points: ReturnType<typeof point>[]) =>
    renderWithProviders(
      <PinnedProvider>
        <NearbyList points={points} userLocation={null} onViewListing={vi.fn()} />
      </PinnedProvider>,
      { content: { categories: [food, grocery] } },
    )

  it('says each row’s category first, in its colour, when the list mixes kinds', () => {
    list([point('Judah', 'restaurant', 'Food', '#0f766e'), point('Acme', 'grocery', 'Grocery', '#be185d')])
    const words = screen.getAllByTestId('nearby-category')
    expect(words.map((w) => w.textContent)).toEqual(expect.arrayContaining(['Food', 'Grocery']))
    const food = words.find((w) => w.textContent === 'Food')!
    expect(food).toHaveStyle({ color: '#0f766e' })
    expect(food.closest('[data-testid="nearby-facts"]')).toHaveTextContent(/^Food·Open/)
  })

  // Oct 16: a hotel with no hours fell to the plain grey line, so only some
  // hotels had their colour.
  it('colours it on a row with nothing else to say too', () => {
    const hotel = makePoint({ id: 'Loews', filterId: 'hotel', name: 'Loews', categoryLabel: 'Hotel', color: '#4338ca', address: '1200 Market St' } as Partial<MapPoint & { filterId: string }>)
    list([point('Judah', 'restaurant', 'Food', '#0f766e'), hotel])
    const word = screen.getAllByTestId('nearby-category').find((w) => w.textContent === 'Hotel')
    expect(word).toHaveStyle({ color: '#4338ca' })
    expect(word!.closest('[data-testid="nearby-facts"]')).toHaveTextContent('Hotel · 1200 Market St')
  })

  it('says nothing of it when every row is the same kind', () => {
    list([point('Judah', 'restaurant', 'Food', '#0f766e'), point('Goldie', 'restaurant', 'Food', '#0f766e')])
    expect(screen.queryByTestId('nearby-category')).not.toBeInTheDocument()
  })
})
