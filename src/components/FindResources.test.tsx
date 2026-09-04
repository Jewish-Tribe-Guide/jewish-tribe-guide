// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import type { DirectoryResource, Hospital } from '@/types'
import FindResources from './FindResources'

// FindResources is a router — which sub-screen renders for a given `view`,
// and how the searchItem/searchQuery/searchHospital/searchForm props drive
// it — not a renderer of any one of those screens itself. Every real
// sub-screen (HospitalsDirectory, AboutYourHospital, EruvInfo, ZmanimCard,
// ResourceLoader, ListingForm, ReportListing) is its own component with its
// own concerns and gets mocked out to a stub that surfaces just enough props
// to assert the routing decision was right — same approach as Landing.test.tsx.
//
// No next/navigation mock here, deliberately: FindResources doesn't call
// useSearchParams()/useRouter() itself any more — FindResourcesConnected
// does (see its own test file), and hands the resolved values down as
// plain props. That split is what lets a plain URL (no query string at all)
// render this component with zero Dynamic API calls, so it can actually be
// prerendered — see the comment on FindResources' own searchItem prop.

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

afterEach(() => cleanup())

const anchor = { coords: null, label: '' }

function listing(overrides: Partial<DirectoryResource> = {}): DirectoryResource {
  return { id: 'l1', category: 'grocery', name: 'Acme Grocery', anchorId: 'community', distance: 1, address: '1 Main St', ...overrides }
}

describe('FindResources — curated (non-category) views', () => {
  it('shows the hospitals list, and selecting one reports ?hospital=<id> via onParamsChange', async () => {
    const user = userEvent.setup()
    const onParamsChange = vi.fn()
    renderWithProviders(<FindResources view="hospitals" listings={null} anchor={anchor} onUp={vi.fn()} onParamsChange={onParamsChange} />)

    expect(screen.getByText('HospitalsDirectory')).toBeInTheDocument()
    await user.click(screen.getByText('Select hosp-1'))

    expect(onParamsChange).toHaveBeenCalledWith({ hospital: 'hosp-1' })
  })

  it('shows a hospital’s About page once searchHospital is set', () => {
    renderWithProviders(<FindResources view="hospitals" listings={null} anchor={anchor} onUp={vi.fn()} searchHospital="hosp-1" />, {
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

  it('opening Add reports ?form=create via onParamsChange', async () => {
    // `action`'s own derivation (below in this file) gates on searchForm !==
    // null AND actionSubject — so this click alone can't show ListingForm in
    // isolation, since a bare onParamsChange spy never feeds an updated
    // searchForm prop back in the way a real caller does. That full
    // round-trip (click → onParamsChange → router.push → real
    // useSearchParams update → searchForm prop updates → form opens, all in
    // one render thanks to React batching) is FindResourcesConnected's own
    // job — see its test for "opens the form immediately".
    const user = userEvent.setup()
    const onParamsChange = vi.fn()
    const grocery = makeCategory({ id: 'grocery', kind: 'listing' })
    renderWithProviders(<FindResources view="grocery" listings={[]} anchor={anchor} onUp={vi.fn()} onParamsChange={onParamsChange} />, {
      content: { categories: [grocery] },
    })

    await user.click(screen.getByText('Add listing'))

    expect(onParamsChange).toHaveBeenCalledWith({ form: 'create' })
  })

  // Unlike edit/report, 'create' has no listing to resolve — HomeBreak's
  // Add/Edit/Report picker (ContributePicker) links straight to
  // `?form=create` with no `?item=`, expecting the create form to just be
  // there on arrival, the same way a deep-linked edit/report already is.
  it('resolves a deep-linked create (searchForm="create", no searchItem) straight to the Add form', () => {
    const grocery = makeCategory({ id: 'grocery', kind: 'listing' })
    renderWithProviders(
      <FindResources view="grocery" listings={[]} anchor={anchor} onUp={vi.fn()} searchForm="create" />,
      { content: { categories: [grocery] } },
    )

    expect(screen.getByText('ListingForm: create')).toBeInTheDocument()
  })

  it('resolves a deep-linked edit (searchForm="edit", searchItem=<id>) to the matching listing, with no explicit openAction call', () => {
    const grocery = makeCategory({ id: 'grocery', kind: 'listing' })
    renderWithProviders(
      <FindResources view="grocery" listings={[listing({ id: 'l1' })]} anchor={anchor} onUp={vi.fn()} searchForm="edit" searchItem="l1" />,
      { content: { categories: [grocery] } },
    )

    expect(screen.getByText('ListingForm: edit')).toBeInTheDocument()
  })

  it('shows the report form once searchForm="report"/searchItem=<id> are set', () => {
    const grocery = makeCategory({ id: 'grocery', kind: 'listing' })
    renderWithProviders(
      <FindResources view="grocery" listings={[listing({ id: 'l1' })]} anchor={anchor} onUp={vi.fn()} searchForm="report" searchItem="l1" />,
      { content: { categories: [grocery] } },
    )

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
