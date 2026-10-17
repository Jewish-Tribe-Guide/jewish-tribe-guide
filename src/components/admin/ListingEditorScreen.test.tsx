// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
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
    await u.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.queryByTestId('editor-open-name')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    // The dishes are a list of their own: their own screen, and the
    // heading says so.
    await u.click(within(screen.getByTestId('editor-empty')).getByRole('button', { name: 'Main dishes' }))
    expect(screen.getByRole('heading', { name: 'Main dishes' })).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('heading', { name: 'Edit listing' })).toBeInTheDocument()
    expect(screen.getByTestId('editor-list')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    await u.click(screen.getByRole('button', { name: 'Back' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
