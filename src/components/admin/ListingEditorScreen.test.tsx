// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
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

// Next's router as it behaves here: the entry written as it lands (at once).
beforeEach(() => {
  window.history.replaceState(null, '', '/philly/admin/places?place=sweet-box')
  mockRouter.push.mockImplementation((url: string) => window.history.pushState({}, '', url))
  mockRouter.replace.mockImplementation((url: string) => window.history.replaceState({}, '', url))
})
afterEach(() => {
  cleanup()
  mockRouter.push.mockReset()
  mockRouter.replace.mockReset()
})

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

  // The user, Nov 2: "I use the trackpad to go back and it goes back two
  // screens"; Nov 9: screens that don't "register as a new page". Each open
  // row has an address of its own, written through Next's router, so Back,
  // Forward and a reload all land on it.
  describe('an open row is in the address', () => {
    const here = () => window.location.pathname + window.location.search
    const item = makeListing({ id: 'sweet-box', category: 'restaurant', name: 'Sweet Box Bakery' })
    const pop = (url: string) =>
      act(() => {
        window.history.replaceState({}, '', url)
        window.dispatchEvent(new PopStateEvent('popstate', { state: {} }))
      })

    it('opening one writes its address, and Back to the place closes it and not the page', async () => {
      const u = userEvent.setup()
      const onClose = vi.fn()
      renderWithProviders(<ListingEditorScreen heading="Edit listing" item={item} category={FOOD} onClose={onClose} />)
      await u.click(within(screen.getByTestId('editor-empty')).getByRole('button', { name: 'Main dishes' }))
      expect(screen.getByRole('heading', { name: 'Main dishes' })).toBeInTheDocument()
      await waitFor(() => expect(here()).toMatch(/^\/philly\/admin\/places\?place=sweet-box&row=[^&]+$/))
      expect(mockRouter.push).toHaveBeenCalledTimes(1)

      pop('/philly/admin/places?place=sweet-box')
      expect(screen.getByRole('heading', { name: 'Edit listing' })).toBeInTheDocument()
      expect(screen.getByTestId('editor-list')).toBeInTheDocument()
      expect(onClose).not.toHaveBeenCalled()
    })

    it('Forward onto it, and a reload on it, open it again', async () => {
      const u = userEvent.setup()
      const first = renderWithProviders(<ListingEditorScreen heading="Edit listing" item={item} category={FOOD} onClose={() => {}} />)
      await u.click(within(screen.getByTestId('editor-empty')).getByRole('button', { name: 'Main dishes' }))
      await waitFor(() => expect(here()).toContain('&row='))
      const dishes = here()
      pop('/philly/admin/places?place=sweet-box')
      expect(screen.getByRole('heading', { name: 'Edit listing' })).toBeInTheDocument()
      // Forward.
      pop(dishes)
      expect(screen.getByRole('heading', { name: 'Main dishes' })).toBeInTheDocument()
      first.unmount()
      // A reload: the screen starts from its address.
      renderWithProviders(<ListingEditorScreen heading="Edit listing" item={item} category={FOOD} onClose={() => {}} />)
      expect(await screen.findByRole('heading', { name: 'Main dishes' })).toBeInTheDocument()
      expect(here()).toBe(dishes)
    })

    it('closing one on the screen steps back over its entry', async () => {
      const u = userEvent.setup()
      const go = vi.spyOn(window.history, 'go').mockImplementation(() => pop('/philly/admin/places?place=sweet-box'))
      renderWithProviders(<ListingEditorScreen heading="Edit listing" item={item} category={FOOD} onClose={() => {}} />)
      await u.click(within(screen.getByTestId('editor-empty')).getByRole('button', { name: 'Main dishes' }))
      await waitFor(() => expect(here()).toContain('&row='))
      await u.click(screen.getByRole('button', { name: '‹ Back' }))
      await waitFor(() => expect(go).toHaveBeenCalledWith(-1))
      expect(here()).toBe('/philly/admin/places?place=sweet-box')
      go.mockRestore()
    })
  })
})
