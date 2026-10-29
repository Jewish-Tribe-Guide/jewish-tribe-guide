// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import { fetchJson } from '@/lib/fetchJson'
import type { AdminPlace } from '@/lib/adminPlaces'
import type ListingEditorScreen from './ListingEditorScreen'
import PlacesList from './PlacesList'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/places',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))
// The editor is the site's own (ListingEditor's tests cover it); here, what
// Places hands it.
const editor = vi.hoisted(() => ({ props: null as null | ComponentProps<typeof ListingEditorScreen> }))
vi.mock('./ListingEditorScreen', () => ({
  default: (props: ComponentProps<typeof ListingEditorScreen>) => {
    editor.props = props
    return <h2>{props.heading}</h2>
  },
}))

const day = new Date(2026, 9, 17, 12).toISOString()
const place = (name: string, over: Partial<AdminPlace> = {}): AdminPlace => ({
  id: name.toLowerCase().replace(/\W+/g, '-'),
  name,
  category: 'food',
  status: 'approved',
  hasAddress: true,
  changedAt: day,
  listing: { id: name, category: 'food', name, anchorId: 'all', distance: 0, address: '1 Main St' },
  ...over,
})
const categories = [makeCategory({ id: 'food', label: 'Food', pluralLabel: 'Food' }), makeCategory({ id: 'networking', label: 'Networking', pluralLabel: 'Networking' })]
const places = [
  place('Goldie'),
  place('Base Philadelphia', { category: 'networking', hasAddress: false }),
  place('Old Deli', { status: 'archived' }),
]

function renderPlaces(list = places) {
  vi.mocked(fetchJson).mockImplementation(async (_url, init) => (init?.method ? { ok: true } : { ok: true, places: list, categories }))
  renderWithProviders(<PlacesList token="tok" />, { community: { slug: 'philly' } })
}
const sent = (method: string) =>
  vi
    .mocked(fetchJson)
    .mock.calls.filter(([, init]) => init?.method === method)
    .map(([url]) => url)

beforeEach(() => window.history.replaceState(null, '', '/philly/admin/places'))
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  editor.props = null
})

describe('Places', () => {
  it('lists what’s on the site, by name, with what’s wrong first and its category', async () => {
    renderPlaces()
    const list = await screen.findByRole('region', { name: 'Places' })
    expect(within(list).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Open Base Philadelphia', 'Open Goldie'])
    expect(screen.getByRole('button', { name: 'Open Base Philadelphia' })).toHaveTextContent('No address · changed Oct 17Networking')
    expect(screen.getByRole('button', { name: 'Open Goldie' })).toHaveTextContent('Changed Oct 17Food')
    expect(screen.getByText('2 on the site')).toBeInTheDocument()
    expect(screen.getByText('2 of 2')).toBeInTheDocument()
  })

  it('Archived is a pill with the others, and says so in the address', async () => {
    const user = userEvent.setup()
    renderPlaces()
    await user.click(await screen.findByRole('button', { name: 'Archived · 1' }))
    expect(screen.getByRole('button', { name: 'Archived · 1' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Open Old Deli' })).toHaveTextContent('Archived Oct 17')
    expect(screen.queryByRole('button', { name: 'Open Goldie' })).toBeNull()
    expect(window.location.search).toBe('?show=archived')
    await user.click(screen.getByRole('button', { name: 'No address · 1' }))
    expect(screen.getByRole('button', { name: 'Open Base Philadelphia' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open Goldie' })).toBeNull()
  })

  it('opens on Archived from the old tab’s address', async () => {
    window.history.replaceState(null, '', '/philly/admin/places?show=archived')
    renderPlaces()
    expect(await screen.findByRole('button', { name: 'Open Old Deli' })).toBeInTheDocument()
  })

  it('finds by name and narrows by category', async () => {
    const user = userEvent.setup()
    renderPlaces()
    await user.type(await screen.findByLabelText('Find a place by name'), 'gold')
    expect(screen.getByRole('button', { name: 'Open Goldie' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open Base Philadelphia' })).toBeNull()
    await user.selectOptions(screen.getByLabelText('Category'), 'networking')
    expect(screen.getByText('No places match.')).toBeInTheDocument()
    expect(window.location.search).toBe('?category=networking')
  })

  it('opens narrowed to the category a category page’s count names', async () => {
    window.history.replaceState(null, '', '/philly/admin/places?category=networking')
    renderPlaces()
    expect(await screen.findByRole('button', { name: 'Open Base Philadelphia' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open Goldie' })).toBeNull()
    expect(screen.getByLabelText('Category')).toHaveValue('networking')
  })

  it('opens a place in its editor, which updates the listing directly', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}')))
    renderPlaces()
    await user.click(await screen.findByRole('button', { name: 'Open Goldie' }))
    expect(screen.getByRole('heading', { name: 'Goldie' })).toBeInTheDocument()
    expect(editor.props?.adminSave?.label).toBe('Update the listing')
    expect(editor.props?.item?.name).toBe('Goldie')
    await editor.props!.adminSave!.via({ payload: { name: 'Goldie’s' } as never, submittedBy: undefined, company: '', turnstileToken: '' })
    expect(fetch).toHaveBeenCalledWith('/api/admin/listings/goldie?community=philly', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ payload: { name: 'Goldie’s' } }) }))
    vi.unstubAllGlobals()
  })

  it('Archive it asks once, then takes it off the site', async () => {
    const user = userEvent.setup()
    renderPlaces()
    await user.click(await screen.findByRole('button', { name: 'Open Goldie' }))
    await user.click(screen.getByRole('button', { name: 'Archive it' }))
    expect(sent('DELETE')).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Leave it' }))
    expect(sent('DELETE')).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Archive it' }))
    await user.click(screen.getByRole('button', { name: 'Archive it' }))
    await waitFor(() => expect(sent('DELETE')).toEqual(['/api/admin/listings/goldie?community=philly']))
    // Back on the list, read afresh.
    expect(await screen.findByRole('region', { name: 'Places' })).toBeInTheDocument()
  })

  it('brings an archived place back, or deletes it for good after asking', async () => {
    const user = userEvent.setup()
    renderPlaces()
    await user.click(await screen.findByRole('button', { name: 'Archived · 1' }))
    await user.click(screen.getByRole('button', { name: 'Open Old Deli' }))
    await user.click(screen.getByRole('button', { name: 'Delete for good' }))
    expect(screen.getByText('Delete Old Deli for good? This can’t be undone.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Leave it' }))
    await user.click(screen.getByRole('button', { name: 'Bring it back' }))
    await waitFor(() => expect(sent('PATCH')).toEqual(['/api/admin/archived-listings/old-deli?community=philly']))
    expect(sent('DELETE')).toEqual([])
  })

  it('adds a place to the category picked, or asks which', async () => {
    const user = userEvent.setup()
    renderPlaces()
    await user.click(await screen.findByRole('button', { name: 'Add a place' }))
    await user.selectOptions(screen.getByLabelText('Which category'), 'food')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: 'Add a place' })).toBeInTheDocument()
    expect(editor.props?.category.id).toBe('food')
    expect(editor.props?.adminSubmit).toEqual({ token: 'tok' })
    editor.props!.onClose()

    await user.selectOptions(await screen.findByLabelText('Category'), 'networking')
    await user.click(screen.getByRole('button', { name: 'Add a place' }))
    expect(editor.props?.category.id).toBe('networking')
  })
})
