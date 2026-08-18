// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import {
  mockRouter,
  mockSearchParams,
  pushSyncingSearchParams,
  resetMockRouter,
  setMockSearchParams,
} from '@/test/nextNavigationMock'
import type { DirectoryResource, Hospital } from '@/types'
import FindResources from './FindResources'

// FindResources is a router — which sub-screen renders for a given `view`,
// and how the URL's ?item=/?q=/?hospital=/?form= params drive it — not a
// renderer of any one of those screens itself. Every real sub-screen
// (HospitalsDirectory, AboutYourHospital, EruvInfo, ZmanimCard,
// ResourceLoader, ListingForm, ReportListing) is its own component with its
// own concerns and gets mocked out to a stub that surfaces just enough props
// to assert the routing decision was right — same approach as Landing.test.tsx.

// Real Next.js router.push updates useSearchParams() for the very next
// render — this component relies on exactly that (its `action` derivation
// gates on `params.get('form')`, not just its own local state) — hence
// pushSyncingSearchParams instead of the plain no-op mockRouter.push.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ ...mockRouter, push: pushSyncingSearchParams }),
  usePathname: () => '/philly/grocery',
  useSearchParams: () => mockSearchParams(),
}))

vi.mock('@/components/resources/HospitalsDirectory', () => ({
  default: ({ onSelect }: { onSelect: (id: string) => void }) => (
    <div>
      <p>HospitalsDirectory</p>
      <button onClick={() => onSelect('hosp-1')}>Select hosp-1</button>
    </div>
  ),
}))
vi.mock('@/components/tabs/AboutYourHospital', () => ({
  default: ({ hospitalName }: { hospitalName: string }) => <p>AboutYourHospital: {hospitalName}</p>,
}))
vi.mock('@/components/resources/EruvInfo', () => ({ default: () => <p>EruvInfo</p> }))
vi.mock('@/components/ZmanimCard', () => ({ default: () => <p>ZmanimCard</p> }))
vi.mock('@/components/resources/ResourceLoader', () => ({
  default: ({ onAdd }: { onAdd: () => void }) => (
    <div>
      <p>ResourceLoader</p>
      <button onClick={onAdd}>Add listing</button>
    </div>
  ),
}))
vi.mock('@/components/resources/ListingForm', () => ({
  default: ({ mode }: { mode: string }) => <p>ListingForm: {mode}</p>,
}))
vi.mock('@/components/resources/ReportListing', () => ({ default: () => <p>ReportListing</p> }))
vi.mock('@/components/TurnstileWidget', () => ({ default: () => null }))

afterEach(() => {
  cleanup()
  resetMockRouter()
  setMockSearchParams({})
})

const anchor = { coords: null, label: '' }

function listing(overrides: Partial<DirectoryResource> = {}): DirectoryResource {
  return { id: 'l1', category: 'grocery', name: 'Acme Grocery', anchorId: 'community', distance: 1, address: '1 Main St', ...overrides }
}

describe('FindResources — curated (non-category) views', () => {
  it('shows the hospitals list, and selecting one pushes ?hospital=<id>', async () => {
    const user = userEvent.setup()
    renderWithProviders(<FindResources view="hospitals" listings={null} anchor={anchor} onUp={vi.fn()} />)

    expect(screen.getByText('HospitalsDirectory')).toBeInTheDocument()
    await user.click(screen.getByText('Select hosp-1'))

    expect(mockRouter.push).toHaveBeenCalledWith('/philly/grocery?hospital=hosp-1')
  })

  it('shows a hospital’s About page once ?hospital= is set', () => {
    setMockSearchParams({ hospital: 'hosp-1' })
    renderWithProviders(<FindResources view="hospitals" listings={null} anchor={anchor} onUp={vi.fn()} />, {
      content: { hospitals: [{ id: 'hosp-1', name: 'General Hospital' } as Hospital] },
    })

    expect(screen.getByText('AboutYourHospital: General Hospital')).toBeInTheDocument()
  })

  it('shows the Eruv view for view="eruv"', () => {
    renderWithProviders(<FindResources view="eruv" listings={null} anchor={anchor} onUp={vi.fn()} />)
    expect(screen.getByText('EruvInfo')).toBeInTheDocument()
  })

  it('shows the Zmanim view for view="zmanim"', () => {
    renderWithProviders(<FindResources view="zmanim" listings={null} anchor={anchor} onUp={vi.fn()} />)
    expect(screen.getByText('ZmanimCard')).toBeInTheDocument()
  })
})

describe('FindResources — a real listing category', () => {
  it('shows the category’s listings by default', () => {
    const grocery = makeCategory({ id: 'grocery', kind: 'listing' })
    renderWithProviders(<FindResources view="grocery" listings={[listing()]} anchor={anchor} onUp={vi.fn()} />, {
      content: { categories: [grocery] },
    })

    expect(screen.getByText('ResourceLoader')).toBeInTheDocument()
  })

  it('opening Add pushes ?form=create onto the URL and opens the form immediately', async () => {
    // Unlike edit/report, create has no listing id to deep-link from — see
    // FindResources' own `deepLinkListing` comment — so a bare ?form=create
    // in the URL with no in-memory actionSubject does NOT reopen the create
    // form (confirmed the hard way: an earlier version of this test asserted
    // exactly that and failed against the real component). The create form
    // only ever opens through this click, which sets local state in the same
    // render Add was clicked in.
    const user = userEvent.setup()
    const grocery = makeCategory({ id: 'grocery', kind: 'listing' })
    renderWithProviders(<FindResources view="grocery" listings={[]} anchor={anchor} onUp={vi.fn()} />, {
      content: { categories: [grocery] },
    })

    await user.click(screen.getByText('Add listing'))

    expect(mockRouter.push).toHaveBeenCalledWith('/philly/grocery?form=create')
    expect(screen.getByText('ListingForm: create')).toBeInTheDocument()
  })

  it('resolves a deep-linked edit (?form=edit&item=<id>) to the matching listing, with no explicit openAction call', () => {
    setMockSearchParams({ form: 'edit', item: 'l1' })
    const grocery = makeCategory({ id: 'grocery', kind: 'listing' })
    renderWithProviders(<FindResources view="grocery" listings={[listing({ id: 'l1' })]} anchor={anchor} onUp={vi.fn()} />, {
      content: { categories: [grocery] },
    })

    expect(screen.getByText('ListingForm: edit')).toBeInTheDocument()
  })

  it('shows the report form once ?form=report&item=<id> is set', () => {
    setMockSearchParams({ form: 'report', item: 'l1' })
    const grocery = makeCategory({ id: 'grocery', kind: 'listing' })
    renderWithProviders(<FindResources view="grocery" listings={[listing({ id: 'l1' })]} anchor={anchor} onUp={vi.fn()} />, {
      content: { categories: [grocery] },
    })

    expect(screen.getByText('ReportListing')).toBeInTheDocument()
  })
})

describe('FindResources — unknown/loading views', () => {
  it('shows a "not available" message with a way back, for a view matching nothing', () => {
    renderWithProviders(<FindResources view="not-a-real-view" listings={null} anchor={anchor} onUp={vi.fn()} />, {
      content: { categories: [makeCategory({ id: 'grocery' })] },
    })

    expect(screen.getByText(/isn.t available/)).toBeInTheDocument()
  })

  it('calls onUp from the unknown-view Home button', async () => {
    const user = userEvent.setup()
    const onUp = vi.fn()
    renderWithProviders(<FindResources view="not-a-real-view" listings={null} anchor={anchor} onUp={onUp} />, {
      content: { categories: [makeCategory({ id: 'grocery' })] },
    })

    await user.click(screen.getByRole('button', { name: 'Home' }))

    expect(onUp).toHaveBeenCalledTimes(1)
  })
})
