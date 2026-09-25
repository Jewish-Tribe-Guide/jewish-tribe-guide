// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import type { PlaceSelectResult } from '@/components/intake/AddressInput'
import ListingAdd from './ListingAdd'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// The real search loads the Maps SDK. This one types like it, and "picks"
// a place the way it does: the address text, its coordinates, then the
// place's details. It also shows what suggestionNote says about a place
// the guide already has (id "place-known").
const googlePick: PlaceSelectResult = {
  placeId: 'place-new',
  name: 'Shalom Bagels',
  phone: '2155550134',
  hours: null,
  website: 'https://shalombagels.example',
  description: 'Neighborhood bagel shop.',
  businessStatus: 'OPERATIONAL',
}
vi.mock('@/components/intake/AddressInput', () => ({
  default: ({
    id,
    value,
    onChange,
    onCoords,
    onPlaceSelect,
    suggestionNote,
  }: {
    id?: string
    value: string
    onChange: (v: string) => void
    onCoords?: (c: { lat: number; lng: number } | null) => void
    onPlaceSelect?: (r: PlaceSelectResult) => void
    suggestionNote?: (placeId: string) => string | null
  }) => (
    <div>
      <input id={id} aria-label={id ? undefined : 'Address'} value={value} onChange={(e) => onChange(e.target.value)} />
      {onPlaceSelect && (
        <button
          type="button"
          onClick={() => {
            onChange('1200 Example Ave, Philadelphia, PA')
            onCoords?.({ lat: 39.95, lng: -75.16 })
            onPlaceSelect(pickOverride ?? googlePick)
          }}
        >
          pick the place
        </button>
      )}
      {suggestionNote && <span data-testid="known-note">{suggestionNote('place-known') ?? ''}</span>}
      {suggestionNote && <span data-testid="new-note">{suggestionNote('place-new') ?? ''}</span>}
    </div>
  ),
}))
let pickOverride: PlaceSelectResult | null = null

beforeEach(() => {
  pickOverride = null
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const food = makeCategory({
  id: 'restaurant',
  label: 'Food',
  detailFields: [
    { key: 'website', label: 'Website', type: 'url' },
    { key: 't', label: 'Food Type', type: 'select', renderAs: 'badge', multiSelect: true, options: [{ value: 'dairy', label: 'Dairy' }, { value: 'meat', label: 'Meat' }] },
    { key: 'kosherCert', label: 'Kosher Certification', type: 'select', renderAs: 'badge', multiSelect: true, allowOther: true, options: [{ value: 'OU', label: 'OU' }] },
    { key: 'shabbat', label: 'Shabbat friendly', type: 'boolean' },
  ],
})

// No address, so nothing to look up on Google: a WhatsApp group.
const whatsapp = makeCategory({
  id: 'whatsapp',
  label: 'WhatsApp Group',
  hasAddress: false,
  hasPhone: false,
  detailFields: [
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'join', label: 'Join group', type: 'url', required: true },
  ],
})

const known = makeListing({ id: 'known', category: 'restaurant', name: 'Kosher Mart', placeId: 'place-known' })

function renderAdd(props: Partial<Parameters<typeof ListingAdd>[0]> = {}) {
  const onClose = vi.fn()
  renderWithProviders(<ListingAdd category={food} listings={[known]} isMobile={false} isOpen onClose={onClose} {...props} />)
  return { onClose }
}

const send = () => screen.getByRole('button', { name: /^(Send for review|Still needed: .*|Verifying…|Sending…)$/ })

describe('ListingAdd — find it first', () => {
  it('opens on the Google search, in a dialog titled for the category', () => {
    renderAdd()
    expect(screen.getByRole('dialog', { name: 'Add a Food' })).toBeInTheDocument()
    expect(screen.getByLabelText('Find the place')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument()
  })

  // Picking the place is most of the listing: it lands in the editor with
  // Google's name, phone, website and description already there.
  it('lands in the listing, filled in from Google, ready to send', async () => {
    const u = userEvent.setup()
    renderAdd()
    await u.click(screen.getByRole('button', { name: 'pick the place' }))

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Shalom Bagels')
    expect(screen.getByRole('textbox', { name: 'Phone' })).toHaveValue('(215) 555-0134')
    expect(screen.getByText(/Filled in from Google\./)).toBeInTheDocument()
    // Name and address are all this category requires, and Google gave both.
    expect(send()).toHaveTextContent('Send for review')
    expect(send()).toBeEnabled()
  })

  it('marks a place the guide already has, right in the search results', () => {
    renderAdd()
    expect(screen.getByTestId('known-note')).toHaveTextContent('Already in the guide')
    expect(screen.getByTestId('new-note')).toHaveTextContent('')
  })

  // Picked anyway, it says so again, with the way to the existing one.
  it('says a picked place is already in the guide, with a link to it', async () => {
    const u = userEvent.setup()
    pickOverride = { ...googlePick, placeId: 'place-known', name: 'Kosher Mart' }
    renderAdd()
    await u.click(screen.getByRole('button', { name: 'pick the place' }))
    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent('Kosher Mart is already in the guide. It’s the same place on Google.')
    expect(within(notice).getByRole('link', { name: 'View it' })).toHaveAttribute('href', expect.stringContaining('kosher-mart'))
  })

  it('steps Back from the listing to the search', async () => {
    const u = userEvent.setup()
    renderAdd()
    await u.click(screen.getByRole('button', { name: 'pick the place' }))
    await u.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByLabelText('Find the place')).toHaveValue('1200 Example Ave, Philadelphia, PA')
  })

  // Desktop floats Send under the dialog, as Edit does.
  it('floats Send under the desktop dialog, outside the scrolling card', async () => {
    const u = userEvent.setup()
    renderAdd()
    await u.click(screen.getByRole('button', { name: 'pick the place' }))
    expect(send().closest('.dialog-in')).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Add a Food' })).toContainElement(send())
  })

  it('sends a new listing, then says it’s being reviewed', async () => {
    const u = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)
    const { onClose } = renderAdd()
    await u.click(screen.getByRole('button', { name: 'pick the place' }))
    await u.click(send())

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.operation).toBe('create')
    expect(body.targetId).toBeUndefined()
    expect(body.payload).toMatchObject({ category: 'restaurant', name: 'Shalom Bagels', address: '1200 Example Ave, Philadelphia, PA' })
    // The Google place and what autofill put in, for the sync afterwards.
    expect(body.payload.details.placeId).toBe('place-new')
    expect(body.payload.details.googleAutofill.name).toBe('Shalom Bagels')

    expect(await screen.findByText('Sent for review. A moderator checks it before it goes live.')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Back to the list' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('ListingAdd — entered by hand', () => {
  it('opens the same listing, empty, naming what it still needs on Send', async () => {
    const u = userEvent.setup()
    renderAdd()
    await u.click(screen.getByRole('button', { name: 'Not on Google? Enter it yourself' }))

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('')
    expect(screen.queryByText(/Filled in from Google/)).not.toBeInTheDocument()
    expect(send()).toHaveTextContent('Still needed: Name, Address')
    expect(send()).toBeDisabled()

    await u.type(screen.getByRole('textbox', { name: 'Name' }), 'Shalom Bagels')
    expect(send()).toHaveTextContent('Still needed: Address')
  })

  // A new listing has no badges to tap, so each empty group is its own
  // named chip rather than a lone "+".
  it('shows each empty badge group as a named chip that opens its choices', async () => {
    const u = userEvent.setup()
    renderAdd()
    await u.click(screen.getByRole('button', { name: 'Not on Google? Enter it yourself' }))
    expect(screen.queryByRole('button', { name: 'Add a badge' })).not.toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: '+ Food Type' }))
    await u.click(within(screen.getByRole('group', { name: 'Food Type' })).getByRole('button', { name: 'Dairy' }))
    expect(screen.getByRole('button', { name: 'Remove Dairy' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Food Type' })).not.toBeInTheDocument()
    // With a badge in the row, the "+" is back for adding more to it.
    expect(screen.getByRole('button', { name: 'Add a badge' })).toBeInTheDocument()

    // A yes/no turns on straight from its chip.
    await u.click(screen.getByRole('button', { name: '+ Shabbat friendly' }))
    expect(screen.getByRole('button', { name: 'Remove Shabbat friendly' })).toBeInTheDocument()
  })

  it('says when the name matches a listing already in the guide', async () => {
    const u = userEvent.setup()
    renderAdd()
    await u.click(screen.getByRole('button', { name: 'Not on Google? Enter it yourself' }))
    await u.type(screen.getByRole('textbox', { name: 'Name' }), 'kosher mart')
    expect(screen.getByRole('status')).toHaveTextContent('Kosher Mart is already in the guide. It has the same name.')
  })
})

describe('ListingAdd — a category with no address', () => {
  // Nothing to look up, so no search step: straight to the listing.
  it('opens straight on the listing, with no search and no Back', () => {
    renderAdd({ category: whatsapp, listings: [] })
    expect(screen.queryByLabelText('Find the place')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument()
    // No address to ask for; the admin's required link is.
    expect(send()).toHaveTextContent('Still needed: Name, Join group')
  })

  // The invite link is the surest sign a group is already listed.
  it('says when the group’s link is one the guide already has', async () => {
    const u = userEvent.setup()
    const group = makeListing({ id: 'g1', category: 'whatsapp', name: 'Philly Shabbos Meals', join: 'https://chat.whatsapp.com/AbC123' })
    renderAdd({ category: whatsapp, listings: [group] })
    await u.click(screen.getByRole('button', { name: 'Add Join group link' }))
    await u.type(screen.getByRole('textbox', { name: 'Join group link' }), 'chat.whatsapp.com/AbC123')
    expect(screen.getByRole('status')).toHaveTextContent('Philly Shabbos Meals is already in the guide. It has the same join group link.')
  })

  it('uses the phone sheet, with the title in its own row, on mobile', () => {
    renderAdd({ category: whatsapp, listings: [], isMobile: true })
    const sheet = screen.getByRole('dialog', { name: 'Add a WhatsApp Group' })
    expect(within(sheet).getByRole('heading', { name: 'Add a WhatsApp Group' })).toBeInTheDocument()
  })
})
