// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import {
  mockRouter,
  pushSyncingSearchParams,
  resetMockRouter,
  setMockSearchParams,
  useMockSearchParams,
} from '@/test/nextNavigationMock'
import type { DirectoryResource } from '@/types'
import FindResourcesConnected from './FindResourcesConnected'

// The wiring FindResources.test.tsx used to cover directly, before
// FindResources itself stopped calling useSearchParams()/useRouter() (see
// its own doc comment on searchItem etc.) — this is what actually reads the
// URL and turns FindResources' onParamsChange calls into router.push, so a
// plain FindResources render can stay Dynamic-API-free and prerender.
//
// useMockSearchParams, not the plain mockSearchParams() reader: this
// component's only job is reading search params and handing them to
// FindResources as props, so nothing here independently re-renders on a
// param change the way FindResources' own local state used to piggyback on
// — it needs the real subscription.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ ...mockRouter, push: pushSyncingSearchParams }),
  usePathname: () => '/philly/grocery',
  useSearchParams: () => useMockSearchParams(),
}))

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

describe('FindResourcesConnected', () => {
  it('reads ?form=/?item= off the real URL and passes them through as props', () => {
    setMockSearchParams({ form: 'edit', item: 'l1' })
    const grocery = makeCategory({ id: 'grocery', kind: 'listing' })
    renderWithProviders(
      <FindResourcesConnected view="grocery" listings={[listing({ id: 'l1' })]} anchor={anchor} onUp={vi.fn()} />,
      { content: { categories: [grocery] } },
    )

    expect(screen.getByText('ListingForm: edit')).toBeInTheDocument()
  })

  it('turns a param change (e.g. opening Add) into a real router.push, and opens the form immediately', async () => {
    // Unlike edit/report, create has no listing id to deep-link from — see
    // FindResources' own `deepLinkListing` comment — so this only works
    // because router.push (pushSyncingSearchParams) updates the mocked
    // useSearchParams() in the same render the click's local actionSubject
    // state updates in — a real router does the same via React's batching.
    const user = userEvent.setup()
    const grocery = makeCategory({ id: 'grocery', kind: 'listing' })
    renderWithProviders(<FindResourcesConnected view="grocery" listings={[]} anchor={anchor} onUp={vi.fn()} />, {
      content: { categories: [grocery] },
    })

    await user.click(screen.getByText('Add listing'))

    expect(mockRouter.push).toHaveBeenCalledWith('/philly/grocery?form=create')
    expect(screen.getByText('ListingForm: create')).toBeInTheDocument()
  })
})
