// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import ListingEditBar from './ListingEditBar'
import { TellAboutContext } from './tellAbout'

afterEach(() => cleanup())

// Oct 6: one door. Where a category page offers the "+ Add" box, Suggest
// an edit opens it about the listing (its "Edit the details myself" is the
// editor); the "+" that sat beside it, doing the same, is gone. Where the
// page has no box (the Map), Suggest an edit opens the editor itself.
describe('ListingEditBar', () => {
  const item = makeListing({ name: 'Trader Joe’s' })
  const bar = (tell: ((i: typeof item) => void) | null, onEdit = vi.fn()) => {
    renderWithProviders(
      <TellAboutContext.Provider value={tell}>
        <ListingEditBar onEdit={onEdit} item={item} category={makeCategory()} path="/philly/grocery/tj" />
      </TellAboutContext.Provider>,
    )
    return onEdit
  }

  it('opens the box about the listing from Suggest an edit, where the page offers one, with no “+” beside it', () => {
    const tell = vi.fn()
    const onEdit = bar(tell)
    fireEvent.click(screen.getByRole('button', { name: /Suggest an edit/ }))
    // With its own editor, for the box's "Edit the details myself".
    expect(tell).toHaveBeenCalledWith(item, onEdit)
    expect(onEdit).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Add or update/ })).not.toBeInTheDocument()
  })

  it('opens the editor itself where there’s no box (the Map)', () => {
    const onEdit = bar(null)
    fireEvent.click(screen.getByRole('button', { name: /Suggest an edit/ }))
    expect(onEdit).toHaveBeenCalled()
  })
})
