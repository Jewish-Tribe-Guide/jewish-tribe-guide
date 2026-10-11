// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
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
  it('heads the screen with the open row, and Back closes the row before it leaves', async () => {
    const u = userEvent.setup()
    const onClose = vi.fn()
    const item = makeListing({ id: 'sweet-box', category: 'restaurant', name: 'Sweet Box Bakery', website: 'https://shopsweetbox.com' })
    renderWithProviders(<ListingEditorScreen heading="Suggest an edit" item={item} category={FOOD} onClose={onClose} onPreviewSend={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Suggest an edit' })).toBeInTheDocument()

    await u.click(screen.getByTestId('editor-row-name'))
    expect(screen.getByRole('heading', { name: 'Sweet Box Bakery' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('heading', { name: 'Suggest an edit' })).toBeInTheDocument()
    expect(screen.getByTestId('editor-list')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    await u.click(screen.getByRole('button', { name: 'Back' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
