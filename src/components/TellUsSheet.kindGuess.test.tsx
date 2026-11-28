// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { makeCategory } from '@/test/providerFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import type { PlaceSelectResult } from '@/components/intake/AddressInput'
import TellUsSheet from './TellUsSheet'

// Tracker 101: a place picked from Google search, on a screen with no
// category, asks "What kind of place?". Google's type picks which kind
// comes first; the person still taps it. Google can't be searched here, so
// the search is a button that hands back a place with the given types.
const types = vi.hoisted(() => ({ current: [] as string[] }))
vi.mock('@/components/FindPlace', () => ({
  default: ({ onPlace }: { onPlace: (p: PlaceSelectResult, a: string, c: null) => void }) => (
    <button
      type="button"
      data-testid="find-place"
      onClick={() => onPlace({ placeId: 'g1', name: 'Kosher Corner', phone: null, hours: null, website: null, description: null, businessStatus: null, types: types.current }, '1 Main St', null)}
    >
      Pick Kosher Corner
    </button>
  ),
}))
vi.mock('@/components/resources/useListingSubmit', async (original) => ({ ...(await original<object>()), TURNSTILE_ACTIVE: false }))
vi.mock('@/lib/useIsMobile', () => ({ useIsMobile: () => true, useMeasuredIsMobile: () => true }))
vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => mockRouter, usePathname: () => '/philly', useSearchParams: () => new URLSearchParams() }))
afterEach(cleanup)

const grocery = makeCategory({ id: 'grocery', label: 'Grocery', pluralLabel: 'Groceries' })
const food = makeCategory({ id: 'restaurant', label: 'Food', pluralLabel: 'Food' })
const shuls = makeCategory({ id: 'synagogue', label: 'Synagogue', pluralLabel: 'Synagogues' })

const pick = (googleTypes: string[]) => {
  types.current = googleTypes
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, resources: [] }))))
  renderWithProviders(<TellUsSheet isOpen onClose={() => {}} />, { community: { slug: 'philly' }, content: { categories: [grocery, shuls, food] } })
  fireEvent.click(screen.getByRole('button', { name: 'Find the place' }))
  fireEvent.click(screen.getByTestId('find-place'))
  return within(screen.getByTestId('pick-kind')).getAllByRole('button')
}

describe('What kind of place? after a Google pick', () => {
  it('puts the kind Google’s type points to first, filled, and the person still picks', () => {
    const buttons = pick(['restaurant', 'food', 'point_of_interest', 'establishment'])
    expect(buttons.map((b) => b.textContent)).toEqual(['Food', 'Grocery', 'Synagogue'])
    expect(buttons[0]).toHaveAttribute('data-guessed')
    expect(buttons[1]).not.toHaveAttribute('data-guessed')
    fireEvent.click(buttons[0])
    expect(screen.getByRole('dialog', { name: 'Add to Food' })).toBeInTheDocument()
  })

  it('keeps the list as it is when Google’s type points to none of the kinds', () => {
    const buttons = pick(['point_of_interest', 'establishment'])
    expect(buttons.map((b) => b.textContent)).toEqual(['Grocery', 'Synagogue', 'Food'])
    expect(buttons.some((b) => b.hasAttribute('data-guessed'))).toBe(false)
  })
})
