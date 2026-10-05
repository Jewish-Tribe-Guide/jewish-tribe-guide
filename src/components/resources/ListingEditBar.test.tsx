// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import ListingEditBar from './ListingEditBar'
import { TellAboutContext } from './tellAbout'

afterEach(() => cleanup())

// Agreed Oct 5: Add stays on a listing, as a "+" in its own row beside
// "Suggest an edit", where a category page offers the box. The Map
// doesn't, as it has no Add.
describe('ListingEditBar', () => {
  const item = makeListing({ name: 'Trader Joe’s' })
  const bar = (tell: ((i: typeof item) => void) | null) =>
    renderWithProviders(
      <TellAboutContext.Provider value={tell}>
        <ListingEditBar onEdit={() => {}} item={item} category={makeCategory()} path="/philly/grocery/tj" />
      </TellAboutContext.Provider>,
    )

  it('has a “+” for the box about the listing, where the page offers one', () => {
    const tell = vi.fn()
    bar(tell)
    fireEvent.click(screen.getByRole('button', { name: 'Add or update Trader Joe’s' }))
    expect(tell).toHaveBeenCalledWith(item)
    expect(screen.getByRole('button', { name: /Suggest an edit/ })).toBeInTheDocument()
  })

  it('has none where it isn’t offered (the Map)', () => {
    bar(null)
    expect(screen.queryByRole('button', { name: /Add or update/ })).not.toBeInTheDocument()
  })
})
