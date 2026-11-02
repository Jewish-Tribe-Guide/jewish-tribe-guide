// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeListing } from '@/test/providerFixtures'
import { FOOD } from '@/test/editorFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import ListingEditorScreen from './ListingEditorScreen'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(cleanup)

describe('ListingEditorScreen', () => {
  it('heads the screen with a row open on its own screen, and Back closes an open row before it leaves', async () => {
    const u = userEvent.setup()
    const onClose = vi.fn()
    const item = makeListing({ id: 'sweet-box', category: 'restaurant', name: 'Sweet Box Bakery', website: 'https://shopsweetbox.com' })
    renderWithProviders(<ListingEditorScreen heading="Edit listing" item={item} category={FOOD} onClose={onClose} />)
    expect(screen.getByRole('heading', { name: 'Edit listing' })).toBeInTheDocument()

    // Open where it is: the heading stays, Back closes it.
    await u.click(screen.getByTestId('editor-row-name'))
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Edit listing' })).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: '‹ Back' }))
    expect(screen.queryByTestId('editor-open-name')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    // The dishes are a list of their own: their own screen, and the
    // heading says so.
    await u.click(within(screen.getByTestId('editor-empty')).getByRole('button', { name: 'Main dishes' }))
    expect(screen.getByRole('heading', { name: 'Main dishes' })).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: '‹ Back' }))
    expect(screen.getByRole('heading', { name: 'Edit listing' })).toBeInTheDocument()
    expect(screen.getByTestId('editor-list')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    await u.click(screen.getByRole('button', { name: '‹ Back' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('an open row is an entry in the history, so a swipe back closes it and not the page', async () => {
    // The user, Nov 2: "I use the trackpad to go back and it goes back two
    // screens". A swipe is the browser's Back: the entry before, then popstate.
    const u = userEvent.setup()
    const onClose = vi.fn()
    window.history.replaceState({ placeOpen: 'sweet-box' }, '')
    const item = makeListing({ id: 'sweet-box', category: 'restaurant', name: 'Sweet Box Bakery' })
    renderWithProviders(<ListingEditorScreen heading="Edit listing" item={item} category={FOOD} onClose={onClose} />)

    await u.click(within(screen.getByTestId('editor-empty')).getByRole('button', { name: 'Main dishes' }))
    expect(screen.getByRole('heading', { name: 'Main dishes' })).toBeInTheDocument()
    // Its own entry, on top of the place's (not a count of entries: the
    // first test's Backs move jsdom's history after the fact).
    expect(window.history.state).toEqual({ placeOpen: 'sweet-box', editorStep: 1 })

    act(() => {
      window.history.replaceState({ placeOpen: 'sweet-box' }, '')
      window.dispatchEvent(new PopStateEvent('popstate', { state: { placeOpen: 'sweet-box' } }))
    })
    expect(screen.getByRole('heading', { name: 'Edit listing' })).toBeInTheDocument()
    expect(screen.getByTestId('editor-list')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
