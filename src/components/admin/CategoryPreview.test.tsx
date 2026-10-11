// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import type { DirectoryResource } from '@/types'
import { makeListing } from '@/test/providerFixtures'
import { FOOD } from '@/test/editorFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import CategoryPreview from './CategoryPreview'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// The frame is an iframe portal and the header/footer are the site's own;
// none of that is what's under test here. The directory is a stub listing
// each item with an Edit, so what's tested is the preview's own wiring:
// which editor Edit opens, and where its Send goes.
vi.mock('./DevicePreviewFrame', () => ({ default: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock('@/components/SiteHeader', () => ({ default: () => null }))
vi.mock('@/components/SiteFooter', () => ({ default: () => null }))
vi.mock('@/components/resources/GenericDirectory', () => ({
  default: ({ items, onEdit }: { items: DirectoryResource[]; onEdit: (item: DirectoryResource) => void }) => (
    <ul data-testid="directory">
      {items.map((item) => (
        <li key={item.id}>
          {item.name} · {item.phone}
          <button type="button" onClick={() => onEdit(item)}>
            Edit {item.name}
          </button>
        </li>
      ))}
    </ul>
  ),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CategoryPreview', () => {
  it('Edit opens the visitors’ editor, and its Send shows the change in the preview without sending it', async () => {
    const u = userEvent.setup()
    const bakery = makeListing({ id: 'sweet-box', category: 'restaurant', name: 'Sweet Box Bakery', address: '339 S 13th St', phone: '(267) 975-1711' })
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, resources: [bakery] }) }))
    vi.stubGlobal('fetch', fetchMock)
    renderWithProviders(<CategoryPreview category={FOOD} onClose={() => {}} />)

    await u.click(await screen.findByRole('button', { name: 'Edit Sweet Box Bakery' }))
    expect(screen.getByRole('heading', { name: 'Suggest an edit' })).toBeInTheDocument()
    await u.click(screen.getByTestId('editor-row-contact'))
    const phone = screen.getByLabelText('Phone')
    await u.clear(phone)
    await u.type(phone, '2676066613')
    await u.click(screen.getByRole('button', { name: 'Done' }))
    await u.click(screen.getByRole('button', { name: 'Send 1 change' }))

    expect(screen.getByTestId('directory')).toHaveTextContent('Sweet Box Bakery · (267) 606-6613')
    // The one read of the category's listings, and nothing sent.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('/api/resources?category=restaurant')
  })
})
