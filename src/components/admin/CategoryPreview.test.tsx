// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactNode } from 'react'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { PREVIEW_READ_ERROR } from '@/lib/previewSend'
import { makeListing } from '@/test/providerFixtures'
import { FOOD } from '@/test/editorFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import TellUsSheet from '@/components/TellUsSheet'
import BoxEditSheet from '@/components/resources/BoxEditSheet'
import CategoryPreview from './CategoryPreview'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// The bot check configured, as on the live site, and a challenge that never
// finishes, as in the preview's about:blank frame: nothing here may wait for
// one (a send that did sat on "Sending…" for good).
vi.hoisted(() => vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'test-site-key'))
vi.mock('@/components/TurnstileWidget', () => ({ default: () => null }))
vi.mock('@/lib/useIsMobile', () => ({ useIsMobile: () => true }))
vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))

// The frame is an iframe portal and the header/footer are the site's own;
// none of that is what's under test here. The directory is a stub listing
// each item with an Edit, so what's tested is the preview's own wiring:
// which editor Edit opens, and where its Send goes. Beside it, the two
// things on the real page that open their own senders, the real ones: the
// page's "+" (the "+ Add" box, TellUsSheet) and a box's own Edit on an
// opened listing (BoxEditSheet), here the Website box.
vi.mock('./DevicePreviewFrame', () => ({ default: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock('@/components/SiteHeader', () => ({ default: () => null }))
vi.mock('@/components/SiteFooter', () => ({ default: () => null }))
vi.mock('@/components/resources/GenericDirectory', () => ({
  default: function Directory({ category, items, onEdit }: { category: CategoryConfig; items: DirectoryResource[]; onEdit: (item: DirectoryResource) => void }) {
    const [adding, setAdding] = useState(false)
    const [boxOf, setBoxOf] = useState<DirectoryResource | null>(null)
    const website = category.detailFields.find((f) => f.key === 'website')!
    return (
      <>
        <ul data-testid="directory">
          {items.map((item) => (
            <li key={item.id}>
              {item.name} · {item.phone} · {String(item.website ?? '')}
              <button type="button" onClick={() => onEdit(item)}>
                Edit {item.name}
              </button>
              <button type="button" onClick={() => setBoxOf(item)}>
                Edit {item.name}’s website
              </button>
            </li>
          ))}
        </ul>
        <button type="button" aria-label="Add" onClick={() => setAdding(true)} />
        {adding && <TellUsSheet isOpen onClose={() => setAdding(false)} category={category} />}
        {boxOf && <BoxEditSheet item={boxOf} category={category} edit={{ title: 'Website', fields: [website] }} onClose={() => setBoxOf(null)} />}
      </>
    )
  },
}))

const bakery = makeListing({ id: 'sweet-box', category: 'restaurant', name: 'Sweet Box Bakery', address: '339 S 13th St', phone: '(267) 975-1711', website: 'https://shopsweetbox.com' })

/** Every request the preview made, by URL and method. Reads of the guide's
 *  listings answer with the bakery; anything else answers `{ ok: true }`,
 *  so a send that slipped through would look like it worked. */
function stubFetch() {
  const calls: { url: string; method: string }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET' })
      const body = String(url).includes('/api/resources') ? { ok: true, resources: [bakery] } : { ok: true, ids: [] }
      return new Response(JSON.stringify(body), { status: 200 })
    }),
  )
  return calls
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CategoryPreview', () => {
  it('Edit opens the visitors’ editor, and its Send shows the change in the preview without sending it', async () => {
    const u = userEvent.setup()
    const calls = stubFetch()
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
    expect(calls).toEqual([{ url: expect.stringContaining('/api/resources?category=restaurant'), method: 'GET' }])
  })

  it('a box’s own Edit on an opened listing shows the change in the preview, with nothing in the queue', async () => {
    const u = userEvent.setup()
    const calls = stubFetch()
    renderWithProviders(<CategoryPreview category={FOOD} onClose={() => {}} />)

    await u.click(await screen.findByRole('button', { name: 'Edit Sweet Box Bakery’s website' }))
    const website = screen.getByRole('textbox', { name: 'Website' })
    await u.clear(website)
    await u.type(website, 'https://sweetboxbakery.com')
    await u.click(screen.getByRole('button', { name: 'Send' }))

    // The visitor's own "Sent", and the listing behind it already changed.
    expect(await screen.findByTestId('box-edit-sent')).toHaveTextContent('Sent')
    expect(screen.getByTestId('directory')).toHaveTextContent('Sweet Box Bakery · (267) 975-1711 · https://sweetboxbakery.com')
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([])
  })

  it('the page’s “+” opens the box, which reads nothing, and filling it in yourself adds the place to the preview only', async () => {
    const u = userEvent.setup()
    const calls = stubFetch()
    renderWithProviders(<CategoryPreview category={FOOD} onClose={() => {}} />)

    await u.click(await screen.findByRole('button', { name: 'Add' }))
    // The box as a visitor sees it, but its reader isn't asked (an AI
    // read is paid for): it says it's the preview, and keeps what was written.
    await u.type(screen.getByLabelText('Your message'), 'Sweet Box has a new phone number')
    await u.click(screen.getByRole('button', { name: 'See what changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(PREVIEW_READ_ERROR)
    expect(screen.getByLabelText('Your message')).toHaveValue('Sweet Box has a new phone number')

    // The other path: the by-hand editor, a new place.
    await u.click(screen.getByRole('button', { name: 'Fill it in yourself' }))
    await u.click(screen.getByRole('button', { name: 'Not on Google? Fill it in yourself' }))
    await u.click(screen.getByTestId('editor-row-name'))
    await u.type(screen.getByRole('textbox', { name: 'Name' }), 'Kosher Corner')
    await u.click(screen.getByRole('button', { name: 'Done' }))
    await u.click(screen.getByTestId('editor-row-contact'))
    await u.type(screen.getByLabelText('Address'), '1500 Walnut St')
    await u.click(screen.getByRole('button', { name: 'Done' }))
    await u.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByTestId('editor-sent')).toBeInTheDocument()
    expect(screen.getByTestId('directory')).toHaveTextContent('Kosher Corner')
    // Reads of the guide's listings only: no read of the message, nothing sent.
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([])
    expect(calls.every((c) => c.url.includes('/api/resources'))).toBe(true)
  })
})
