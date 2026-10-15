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
// page has no box (the Map), Edit listing opens the editor itself.
describe('ListingEditBar', () => {
  const item = makeListing({ name: 'Trader Joe’s' })
  const bar = (tell: ((i: typeof item) => void) | null, onEdit = vi.fn()) => {
    renderWithProviders(
      <TellAboutContext.Provider value={tell}>
        <ListingEditBar onEdit={onEdit} item={item} category={makeCategory()} />
      </TellAboutContext.Provider>,
    )
    return onEdit
  }

  // Oct 15: "when you click edit on a listing we should show actual edit.
  // Not AI." Even where the page has the "+ Add" box, Edit listing is the
  // editor, not that box.
  it('opens the editor itself even where the page offers the “+ Add” box, with no “+” beside it', () => {
    const tell = vi.fn()
    const onEdit = bar(tell)
    fireEvent.click(screen.getByRole('button', { name: 'Edit listing' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(tell).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Add or update/ })).not.toBeInTheDocument()
  })

  it('opens the editor itself where there’s no box (the Map)', () => {
    const onEdit = bar(null)
    fireEvent.click(screen.getByRole('button', { name: /Edit listing/ }))
    expect(onEdit).toHaveBeenCalled()
  })

  // Oct 6: on a listing that is one link, its own big button (Join) is right
  // above, so Edit listing is outlined rather than a second filled pill.
  it('is outlined on a listing that is one link (a WhatsApp group), filled everywhere else', () => {
    const link = { key: 'link', label: 'Join group', type: 'url' as const, renderAs: 'row' as const, showInHeader: true }
    const groups = makeCategory({ id: 'whatsapp', hasAddress: false, detailFields: [link] })
    renderWithProviders(<ListingEditBar onEdit={vi.fn()} item={makeListing({ address: '', link: 'https://chat.whatsapp.com/x' })} category={groups} />)
    expect(screen.getByRole('button', { name: /Edit listing/ })).toHaveAttribute('data-quiet', 'true')
    cleanup()
    bar(null)
    expect(screen.getByRole('button', { name: /Edit listing/ })).not.toHaveAttribute('data-quiet')
  })

  // Oct 15: Save, Share and Set as location all have buttons of their own on
  // an opened listing now, so the ••• fan held one unique thing — Request
  // removal. It sits beside Edit as a button of its own instead.
  it('puts Request removal beside Edit as a button of its own, with no ••• menu', () => {
    const onRequestRemoval = vi.fn()
    renderWithProviders(<ListingEditBar onEdit={vi.fn()} onRequestRemoval={onRequestRemoval} item={item} category={makeCategory()} />)
    const removal = screen.getByRole('button', { name: 'Request removal' })
    expect(removal.parentElement).toBe(screen.getByRole('button', { name: 'Edit listing' }).parentElement)
    fireEvent.click(removal)
    expect(onRequestRemoval).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument()
  })

  // Oct 15, later: not a text pill — the user wanted it "the same size
  // button as it was before and be a garbage can in red". So it's the old
  // ••• trigger's 46px circle with a red bin in it, named for screen readers
  // and on hover rather than by visible words.
  it('draws Request removal as a round red bin, the old ••• button’s size, with no words', () => {
    renderWithProviders(<ListingEditBar onEdit={vi.fn()} onRequestRemoval={vi.fn()} item={item} category={makeCategory()} />)
    const removal = screen.getByRole('button', { name: 'Request removal' })
    expect(removal.textContent).toBe('')
    expect(removal.querySelector('svg')).not.toBeNull()
    expect(removal).toHaveAttribute('title', 'Request removal')
    expect(removal.className).toMatch(/\bh-\[46px\]/)
    expect(removal.className).toMatch(/\bw-\[46px\]/)
    expect(removal.className).toMatch(/\brounded-full\b/)
    expect(removal.className).toMatch(/\btext-red-600\b/)
  })

  it('leaves Request removal out where the category takes no reports', () => {
    renderWithProviders(<ListingEditBar onEdit={vi.fn()} item={item} category={makeCategory()} />)
    expect(screen.getByRole('button', { name: 'Edit listing' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Request removal' })).not.toBeInTheDocument()
  })

  it('renders nothing where the listing can’t be edited', () => {
    const { container } = renderWithProviders(<ListingEditBar onRequestRemoval={vi.fn()} item={item} category={makeCategory()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
