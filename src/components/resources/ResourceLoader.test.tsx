// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import type { DirectoryResource } from '@/types'
import ResourceLoader from './ResourceLoader'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// The directory itself has its own tests; this is only about the distances
// the loader stamps on the listings it hands over.
vi.mock('./GenericDirectory', () => ({
  default: ({ items }: { items: DirectoryResource[] }) => (
    <ul>
      {items.map((i) => (
        <li key={i.id}>
          {i.name}: from address {i.milesFromAddress?.toFixed(1) ?? '-'}, from centre {i.milesFromCenter?.toFixed(1) ?? '-'}
        </li>
      ))}
    </ul>
  ),
}))

afterEach(() => cleanup())

const handlers = { onUp: vi.fn(), onAdd: vi.fn(), onEdit: vi.fn() }
// One degree of longitude on the equator: about 69 miles.
const listing = makeListing({ id: 'a', name: 'Acme', geo: { lat: 0, lng: 1 } })
const center = { lat: 0, lng: 0 }

describe('ResourceLoader — distances', () => {
  it('measures from the community’s centre when the visitor hasn’t set a location', () => {
    renderWithProviders(
      <ResourceLoader category={makeCategory()} items={[listing]} anchor={{ coords: null, label: '' }} {...handlers} />,
      { community: { mapCenter: center } },
    )
    expect(screen.getByText('Acme: from address -, from centre 69.1')).toBeInTheDocument()
  })

  it('measures from the visitor’s location once there is one, and not from the centre', () => {
    renderWithProviders(
      <ResourceLoader category={makeCategory()} items={[listing]} anchor={{ coords: { lat: 0, lng: 0.5 }, label: '19103' }} {...handlers} />,
      { community: { mapCenter: center } },
    )
    expect(screen.getByText('Acme: from address 34.5, from centre -')).toBeInTheDocument()
  })

  it('measures nothing for a category with no addresses', () => {
    renderWithProviders(
      <ResourceLoader category={makeCategory({ hasAddress: false })} items={[listing]} anchor={{ coords: null, label: '' }} {...handlers} />,
      { community: { mapCenter: center } },
    )
    expect(screen.getByText('Acme: from address -, from centre -')).toBeInTheDocument()
  })
})
