// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockRouter } from '@/test/nextNavigationMock'
import { makeCategory } from '@/test/providerFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import AddPlace from './AddPlace'

vi.mock('next/navigation', () => ({ useRouter: () => mockRouter, usePathname: () => '/philly/admin/places', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(async () => ({})), parseOkJson: vi.fn() }))
vi.mock('@/lib/useEditWeek', () => ({ useEditWeek: () => null }))
vi.mock('@/components/intake/AddressInput', () => ({
  default: ({ id, onPlaceSelect, suggestionNote }: { id: string; onPlaceSelect: (r: unknown) => void; suggestionNote?: (id: string) => string | null }) => (
    <div>
      <input id={id} aria-label="Find the place" />
      <span>{suggestionNote?.('in-guide')}</span>
      <button type="button" onClick={() => onPlaceSelect({ placeId: 'p1', name: 'Ohev Shalom', phone: '2155550142', website: 'https://ohev.org', businessStatus: 'OPERATIONAL', address: '2 Chester Rd' })}>
        Pick it
      </button>
    </div>
  ),
}))

const shul = makeCategory({
  id: 'synagogue',
  label: 'Synagogue',
  detailFields: [
    { key: 'website', label: 'Website', type: 'url' },
    { key: 'minyanim', label: 'Minyanim', type: 'minyanim' },
  ],
})

afterEach(() => {
  cleanup()
  vi.mocked(fetchJson).mockClear()
})

const posts = () => vi.mocked(fetchJson).mock.calls.filter(([, init]) => init?.method === 'POST').map(([url, init]) => [String(url).split('?')[0], JSON.parse(String(init?.body))])

function renderAdd(onClose = vi.fn()) {
  renderWithProviders(<AddPlace category={shul} listings={[{ id: 'x', category: 'synagogue', name: 'There', anchorId: 'all', distance: 0, address: '', placeId: 'in-guide' }]} token="tok" onClose={onClose} />, { community: { slug: 'philly' } })
  return onClose
}

describe('Add a place', () => {
  it('starts at Find the place, and marks what the guide has (AddFind8)', () => {
    renderAdd()
    expect(screen.getByLabelText('Find the place')).toBeInTheDocument()
    expect(screen.getByText('Already in the guide')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fill it in yourself' })).toBeInTheDocument()
  })

  it('picked on Google, its rows say Google and What’s not there has no word (AddRows11)', async () => {
    const user = userEvent.setup()
    renderAdd()
    await user.click(screen.getByRole('button', { name: 'Pick it' }))
    expect(screen.getByText('Goes live as soon as you add it, with no review.')).toBeInTheDocument()
    expect(screen.queryByText('Filled in from Google')).toBeNull()
    for (const row of ['editor-row-name', 'editor-row-contact:phone', 'editor-row-field:website']) {
      expect(within(screen.getByTestId(row)).getByTestId('row-job')).toHaveTextContent('Google')
    }
    expect(within(screen.getByTestId('editor-empty')).queryByTestId('row-job')).toBeNull()
    expect(screen.getByTestId('editor-empty')).toHaveTextContent('Usual weekday times')
  })

  it('filled in by hand: Nothing, a phone isn’t needed, and Find it on Google goes back (AddSelf11, AddSelfPhone8)', async () => {
    const user = userEvent.setup()
    renderAdd()
    await user.click(screen.getByRole('button', { name: 'Fill it in yourself' }))
    expect(within(screen.getByTestId('editor-row-name')).getByTestId('row-job')).toHaveTextContent('Nothing')
    expect(screen.getByTestId('editor-add-contact:phone')).toBeInTheDocument()
    await user.click(screen.getByTestId('editor-add-contact:phone'))
    expect(screen.getByTestId('row-source')).toHaveTextContent('Nothing reads this · Find it on Google')
    await user.click(screen.getByRole('button', { name: 'Find it on Google' }))
    expect(screen.getByLabelText('Find the place')).toBeInTheDocument()
  })

  it('a choice waits, its line says so, and it’s saved with the listing (AddChange8, GivenRead13)', async () => {
    const user = userEvent.setup()
    const onClose = renderAdd()
    await user.click(screen.getByRole('button', { name: 'Pick it' }))
    await user.click(screen.getByTestId('editor-add-minyans:weekday'))
    await user.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByLabelText('A web page, or the email it comes from')).toHaveAttribute('placeholder', 'ohev.org/…')
    await user.type(screen.getByLabelText('A web page, or the email it comes from'), 'https://ohev.org/davening')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('ohev.org/davening')).toBeInTheDocument()
    expect(posts()).toEqual([])
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Stop is kept till the listing’s saved (AddGoogle8)', async () => {
    const user = userEvent.setup()
    renderAdd()
    await user.click(screen.getByRole('button', { name: 'Pick it' }))
    await user.click(screen.getByTestId('editor-row-contact:phone'))
    await user.click(screen.getByRole('button', { name: 'Stop' }))
    expect(posts()).toEqual([])
    await waitFor(() => expect(screen.getByTestId('row-source')).toHaveTextContent('Nothing reads this · Use Google’s'))
  })
})
