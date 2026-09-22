// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import type { CategoryField } from '@/lib/categories'
import type { DirectoryResource } from '@/types'
import ListingForm from './ListingForm'
import { ui } from '@/lib/uiConfig'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// AddressInput loads the real Google Maps SDK on mount (see loadGoogleMaps.ts)
// — no equivalent under jsdom, same reasoning ResourceMap gets stubbed in
// ResourceMapView.test.tsx. The stub exposes a plain controlled input plus a
// button that fires onPlaceSelect/onCoords with a fixed payload, enough to
// exercise handlePlaceSelect's autofill logic without the real widget.
vi.mock('@/components/intake/AddressInput', () => ({
  default: ({
    value,
    onChange,
    onCoords,
    onPlaceSelect,
  }: {
    value: string
    onChange: (v: string) => void
    onCoords?: (c: { lat: number; lng: number } | null) => void
    onPlaceSelect?: (r: {
      placeId: string
      name?: string
      phone?: string
      hours?: unknown
      website?: string
      description?: string
    }) => void
  }) => (
    <div>
      <label htmlFor="address-stub">Address</label>
      <input id="address-stub" value={value} onChange={(e) => onChange(e.target.value)} />
      <button
        type="button"
        onClick={() => {
          onCoords?.({ lat: 40, lng: -75 })
          onPlaceSelect?.({ placeId: 'place-1', name: 'Autofilled Name', phone: '2155559999' })
        }}
      >
        simulate place select
      </button>
    </div>
  ),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function booleanField(overrides: Partial<CategoryField> = {}): CategoryField {
  return { key: 'isKosher', label: 'Kosher', type: 'boolean', ...overrides }
}

function textField(overrides: Partial<CategoryField> = {}): CategoryField {
  return { key: 'kosherItems', label: 'Kosher items', type: 'text', ...overrides }
}

function imageField(overrides: Partial<CategoryField> = {}): CategoryField {
  return { key: 'photoOverride', label: 'Photo', type: 'image', ...overrides }
}

function selectField(overrides: Partial<CategoryField> = {}): CategoryField {
  return {
    key: 'cuisine',
    label: 'Cuisine',
    type: 'select',
    options: [
      { value: 'italian', label: 'Italian' },
      { value: 'deli', label: 'Deli' },
    ],
    ...overrides,
  }
}

function stubFetchOk(body: Record<string, unknown> = { ok: true }) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => body })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const handlers = { onUp: vi.fn(), onSubmitted: vi.fn() }

describe('ListingForm', () => {
  it('shows the create heading and submit label in create mode', () => {
    const category = makeCategory({ label: 'Grocery Store', pluralLabel: 'Grocery Stores' })
    renderWithProviders(<ListingForm category={category} mode="create" {...handlers} />)

    expect(screen.getByRole('heading', { name: 'Add a Grocery Store' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit for review' })).toBeInTheDocument()
  })

  it('shows the edit heading, submit label, and pre-fills from the existing listing', () => {
    const category = makeCategory()
    const existing = makeListing({ id: 'listing-1', name: 'Kosher Mart', phone: '(215) 555-0100', address: '1 Main St' })
    renderWithProviders(<ListingForm category={category} mode="edit" existing={existing} {...handlers} />)

    expect(screen.getByRole('heading', { name: 'Suggest an edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit edit for review' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Kosher Mart')).toBeInTheDocument()
    expect(screen.getByDisplayValue('(215) 555-0100')).toBeInTheDocument()
  })

  // Removal used to be a separate Report action in the kebab. It now lives at
  // the foot of the edit form, since "this listing is wrong" is one thing.
  describe('removal request', () => {
    const existing = () => makeListing({ id: 'listing-1', name: 'Kosher Mart' })
    const removalLine = 'Request removal'

    it('is offered at the bottom of an edit', () => {
      renderWithProviders(<ListingForm category={makeCategory()} mode="edit" existing={existing()} {...handlers} />)
      expect(screen.getByRole('button', { name: removalLine })).toBeInTheDocument()
    })

    it('is not offered when adding a new listing', () => {
      renderWithProviders(<ListingForm category={makeCategory()} mode="create" {...handlers} />)
      expect(screen.queryByRole('button', { name: removalLine })).not.toBeInTheDocument()
    })

    it('is not offered when the category has reporting turned off', () => {
      const category = makeCategory({ capabilities: { add: true, edit: true, report: false, directorySearch: true, map: true } })
      renderWithProviders(<ListingForm category={category} mode="edit" existing={existing()} {...handlers} />)
      expect(screen.queryByRole('button', { name: removalLine })).not.toBeInTheDocument()
    })

    it('is not offered when the community turned reporting off site-wide', () => {
      ui.contributions.report = false
      try {
        renderWithProviders(<ListingForm category={makeCategory()} mode="edit" existing={existing()} {...handlers} />)
        expect(screen.queryByRole('button', { name: removalLine })).not.toBeInTheDocument()
      } finally {
        ui.contributions.report = true
      }
    })

    it('is not offered in the admin preview', () => {
      renderWithProviders(
        <ListingForm category={makeCategory()} mode="edit" existing={existing()} onPreviewSubmit={vi.fn()} {...handlers} />,
      )
      expect(screen.queryByRole('button', { name: removalLine })).not.toBeInTheDocument()
    })

    it('filing one shows its own thank-you, and never submits the edit', async () => {
      const user = userEvent.setup()
      const fetchMock = stubFetchOk({ ok: true })
      renderWithProviders(<ListingForm category={makeCategory()} mode="edit" existing={existing()} {...handlers} />)

      await user.click(screen.getByRole('button', { name: removalLine }))
      await user.click(screen.getByRole('button', { name: 'Confirm removal request' }))

      expect(await screen.findByText(/removal request was received/i)).toBeInTheDocument()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).operation).toBe('delete')
    })

    // Swaps the whole panel — the fields disappear, not an accordion grown
    // underneath them — the same in-place pattern Edit itself already uses.
    // jsdom doesn't apply Tailwind's stylesheet, so an element's own computed
    // visibility can't tell "hidden" (display:none via the `hidden` class)
    // from a plain rendered element the way a browser would — asserted on
    // the class directly instead. Fields/buttons stay mounted either way
    // (see the component's own doc on why), so `toBeInTheDocument` alone
    // wouldn't catch a regression back to an accordion.
    const isHidden = (el: HTMLElement) => el.closest('.hidden') !== null

    it('clicking it swaps out the edit fields for the removal panel, and Cancel swaps them back', async () => {
      const user = userEvent.setup()
      const listing = existing()
      const onRemovalOpenChange = vi.fn()
      renderWithProviders(
        <ListingForm category={makeCategory()} mode="edit" existing={listing} onRemovalOpenChange={onRemovalOpenChange} {...handlers} />,
      )

      expect(isHidden(screen.getByDisplayValue(listing.name))).toBe(false)
      expect(isHidden(screen.getByRole('button', { name: 'Submit edit for review' }))).toBe(false)
      // Called on mount too (false) — see the component's own doc on why.
      expect(onRemovalOpenChange).toHaveBeenLastCalledWith(false)

      await user.click(screen.getByRole('button', { name: removalLine }))

      // No title of its own any more (the embedding caller shows one instead
      // — see onRemovalOpenChange below and each caller's own test); the
      // reason picker is what proves the panel itself is now showing.
      expect(isHidden(screen.getByRole('combobox', { name: /why should .* be removed/i }))).toBe(false)
      expect(isHidden(screen.getByDisplayValue(listing.name))).toBe(true)
      expect(isHidden(screen.getByRole('button', { name: 'Submit edit for review' }))).toBe(true)
      expect(isHidden(screen.getByRole('button', { name: removalLine }))).toBe(true)
      expect(onRemovalOpenChange).toHaveBeenLastCalledWith(true)

      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(isHidden(screen.getByDisplayValue(listing.name))).toBe(false)
      expect(isHidden(screen.getByRole('button', { name: 'Submit edit for review' }))).toBe(false)
      expect(isHidden(screen.getByRole('combobox', { name: /why should .* be removed/i }))).toBe(true)
      expect(onRemovalOpenChange).toHaveBeenLastCalledWith(false)
    })

    it('keeps a reason already picked if Cancel is clicked, then Request removal opened again', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ListingForm category={makeCategory()} mode="edit" existing={existing()} {...handlers} />)

      await user.click(screen.getByRole('button', { name: removalLine }))
      await user.selectOptions(screen.getByRole('combobox'), 'Duplicate listing')
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      await user.click(screen.getByRole('button', { name: removalLine }))

      expect(screen.getByRole('combobox')).toHaveValue('Duplicate listing')
    })
  })

  // `embedded` — rendered inside a caller-owned overlay (desktop's Edit
  // dialog) instead of as this screen's own top-level content. Same
  // reasoning, and same treatment, as ReportListing's own `embedded` prop.
  describe('embedded', () => {
    it('renders no Back button or heading of its own', () => {
      const category = makeCategory()
      const existing = makeListing({ id: 'listing-1', name: 'Kosher Mart' })
      renderWithProviders(<ListingForm category={category} mode="edit" existing={existing} {...handlers} embedded />)

      expect(screen.queryByRole('heading', { name: 'Suggest an edit' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
      // The form itself is unaffected.
      expect(screen.getByRole('button', { name: 'Submit edit for review' })).toBeInTheDocument()
    })

    it('still submits the same edit the non-embedded form does', async () => {
      const user = userEvent.setup()
      const fetchMock = stubFetchOk({ ok: true })
      const category = makeCategory()
      const existing = makeListing({ id: 'listing-1', name: 'Old Name' })
      renderWithProviders(<ListingForm category={category} mode="edit" existing={existing} {...handlers} embedded />)

      await user.type(screen.getByDisplayValue('Old Name'), ' & Deli')
      await user.click(screen.getByRole('button', { name: 'Submit edit for review' }))

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.operation).toBe('update')
      expect(body.targetId).toBe('listing-1')
    })

    it('renders no Back button on the done state either', async () => {
      const user = userEvent.setup()
      stubFetchOk({ ok: true })
      const category = makeCategory()
      const existing = makeListing({ id: 'listing-1', name: 'Old Name' })
      renderWithProviders(<ListingForm category={category} mode="edit" existing={existing} {...handlers} embedded />)

      await user.type(screen.getByDisplayValue('Old Name'), ' & Deli')
      await user.click(screen.getByRole('button', { name: 'Submit edit for review' }))

      expect(await screen.findByText('Thank you!')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
    })
  })

  // Non-embedded only — every real Add/Edit already lives inside a
  // dialog/sheet with its own close chrome. This is the only in-content way
  // to leave the form without submitting it (or, once done, to leave the
  // confirmation), now that the old Breadcrumb — which did this AND
  // redundantly named the destination the heading right below it already
  // named — is gone.
  describe('non-embedded Back button', () => {
    it('calls onUp from the form, not onSubmitted', async () => {
      const user = userEvent.setup()
      const onUp = vi.fn()
      const onSubmitted = vi.fn()
      const category = makeCategory()
      renderWithProviders(<ListingForm category={category} mode="create" onUp={onUp} onSubmitted={onSubmitted} />)

      await user.click(screen.getByRole('button', { name: 'Back' }))
      expect(onUp).toHaveBeenCalledTimes(1)
      expect(onSubmitted).not.toHaveBeenCalled()
    })

    it('calls onSubmitted from the done state, not onUp', async () => {
      const user = userEvent.setup()
      stubFetchOk({ ok: true })
      const onUp = vi.fn()
      const onSubmitted = vi.fn()
      const category = makeCategory()
      renderWithProviders(<ListingForm category={category} mode="create" onUp={onUp} onSubmitted={onSubmitted} />)

      await user.type(screen.getByLabelText(/Name/), 'Kosher Mart')
      await user.click(screen.getByRole('button', { name: 'Submit for review' }))
      await screen.findByText('Thank you!')

      await user.click(screen.getByRole('button', { name: 'Back' }))
      expect(onSubmitted).toHaveBeenCalledTimes(1)
      expect(onUp).not.toHaveBeenCalled()
    })
  })

  it('hides the Address field when the category has no address, and Phone when it has none', () => {
    const category = makeCategory({ hasAddress: false, hasPhone: false })
    renderWithProviders(<ListingForm category={category} mode="create" {...handlers} />)

    expect(screen.queryByLabelText('Address')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Phone')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Name/)).toBeInTheDocument()
  })

  // ImageUploadField's "Click the preview to reposition/re-zoom it" hint is
  // opt-out (showRepositionHint) — admin's own logo/hero/category-icon
  // editors keep it (see SiteSettingsEditor's tests), but a visitor filling
  // out one form field at a time doesn't need it spelled out.
  it('never shows the "reposition/re-zoom" hint on a photo field, even once a photo is set', () => {
    const category = makeCategory({ detailFields: [imageField()] })
    const existing = makeListing({ id: 'listing-1', photoOverride: 'https://example.com/photo.jpg' })
    renderWithProviders(<ListingForm category={category} mode="edit" existing={existing} {...handlers} />)

    expect(screen.queryByText('Click the preview to reposition/re-zoom it')).not.toBeInTheDocument()
  })

  it('a showIf-gated field only appears once its trigger field is checked', async () => {
    const user = userEvent.setup()
    const category = makeCategory({
      detailFields: [booleanField(), textField({ showIf: { field: 'isKosher', equals: true } })],
    })
    renderWithProviders(<ListingForm category={category} mode="create" {...handlers} />)

    expect(screen.queryByLabelText('Kosher items')).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Kosher' }))
    expect(screen.getByLabelText('Kosher items')).toBeInTheDocument()
  })

  it('groups an audience-scoped field under its own section, using the short label', async () => {
    const user = userEvent.setup()
    const category = makeCategory({
      hasPhone: false, // avoid colliding with the always-present top-level Phone field
      detailFields: [
        { key: 'womens', label: "Women's Tevillah", type: 'boolean', filterLabel: "Women's" },
        { key: 'womensPhone', label: "Women's Phone", type: 'text', audienceKey: 'womens', shortLabel: 'Phone' },
      ],
    })
    renderWithProviders(<ListingForm category={category} mode="create" {...handlers} />)

    expect(screen.queryByRole('button', { name: "Women's" })).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: "Women's Tevillah" }))

    const sectionToggle = screen.getByRole('button', { name: "Women's" })
    expect(sectionToggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Phone')).toBeInTheDocument()
  })

  it('submits a create with the entered fields and the right operation/category', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetchOk({ ok: true })
    const category = makeCategory({ id: 'grocery' })
    renderWithProviders(<ListingForm category={category} mode="create" {...handlers} />)

    await user.type(screen.getByLabelText(/Name/), 'Kosher Mart')
    await user.type(screen.getByLabelText('Address'), '1 Main St')
    await user.type(screen.getByLabelText('Phone'), '2155550100')
    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/submissions?community=test-community')
    const body = JSON.parse(init.body)
    expect(body.operation).toBe('create')
    expect(body.targetType).toBe('listing')
    expect(body.targetId).toBeUndefined()
    expect(body.payload.category).toBe('grocery')
    expect(body.payload.name).toBe('Kosher Mart')
    expect(body.payload.address).toBe('1 Main St')

    expect(await screen.findByText('Thank you!')).toBeInTheDocument()
  })

  it('submits an edit as an update against the existing listing id', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetchOk({ ok: true })
    const category = makeCategory()
    const existing = makeListing({ id: 'listing-42', name: 'Old Name' })
    renderWithProviders(<ListingForm category={category} mode="edit" existing={existing} {...handlers} />)

    await user.type(screen.getByDisplayValue('Old Name'), ' & Deli')
    await user.click(screen.getByRole('button', { name: 'Submit edit for review' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.operation).toBe('update')
    expect(body.targetId).toBe('listing-42')
  })

  it('refuses to submit an edit where nothing about the listing actually changed', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetchOk({ ok: true })
    const category = makeCategory()
    const existing = makeListing({ id: 'listing-42', name: 'Old Name' })
    renderWithProviders(<ListingForm category={category} mode="edit" existing={existing} {...handlers} />)

    // Only filling in contact info — no listing field touched at all. Two
    // "Your name" fields exist once removal is offered (this one, and
    // RemovalRequest's own mirror of the same shared state) — index 0 is
    // this component's, which renders first in the DOM.
    await user.type(screen.getAllByLabelText(/Your name/)[0], 'A Neighbor')
    await user.click(screen.getByRole('button', { name: 'Submit edit for review' }))

    expect(await screen.findByText(/haven.t changed anything yet/)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses to submit an edit where a field was changed and then changed right back', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetchOk({ ok: true })
    const category = makeCategory()
    const existing = makeListing({ id: 'listing-42', name: 'Old Name' })
    renderWithProviders(<ListingForm category={category} mode="edit" existing={existing} {...handlers} />)

    const nameInput = screen.getByDisplayValue('Old Name')
    await user.type(nameInput, 'x')
    await user.type(nameInput, '{backspace}')
    await user.click(screen.getByRole('button', { name: 'Submit edit for review' }))

    expect(await screen.findByText(/haven.t changed anything yet/)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the server-provided errors and stays on the form when the submission is rejected', async () => {
    const user = userEvent.setup()
    stubFetchOk({ ok: false, errors: ['Name is required.'] })
    const category = makeCategory()
    renderWithProviders(<ListingForm category={category} mode="create" {...handlers} />)

    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    expect(await screen.findByText('Name is required.')).toBeInTheDocument()
    expect(screen.queryByText('Thank you!')).not.toBeInTheDocument()
  })

  it('re-verifies and asks for a resubmit, rather than losing the form, on an expired-token response', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ ok: false, code: 'turnstile', errors: ['Verification failed.'] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const category = makeCategory()
    renderWithProviders(<ListingForm category={category} mode="create" {...handlers} />)

    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    expect(await screen.findByText(/We’ve refreshed it — please tap Submit again/)).toBeInTheDocument()
    expect(screen.queryByText('Thank you!')).not.toBeInTheDocument()
  })

  // /api/submissions answers 403 for several unrelated refusals — a
  // contribution type disabled site-wide, a category with edits turned off.
  // Treating those as a stale challenge produced an endless "we've refreshed
  // it, tap Submit again" that no amount of tapping could clear, and hid the
  // reason the server actually gave.
  it('shows the server’s own message for a 403 that is not about verification', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ ok: false, errors: ['This action is not available for this category.'] }),
    }))
    renderWithProviders(<ListingForm category={makeCategory()} mode="create" {...handlers} />)

    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    expect(await screen.findByText('This action is not available for this category.')).toBeInTheDocument()
    expect(screen.queryByText(/tap Submit again/)).not.toBeInTheDocument()
  })

  // A fresh token failing too means staleness was never the problem, and
  // repeating the same hopeful message is the loop being reported.
  it('stops promising a retry once a refreshed challenge fails as well', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ ok: false, code: 'turnstile', errors: ['Verification failed.'] }),
    }))
    renderWithProviders(<ListingForm category={makeCategory()} mode="create" {...handlers} />)

    const submit = screen.getByRole('button', { name: 'Submit for review' })
    await user.click(submit)
    expect(await screen.findByText(/tap Submit again/)).toBeInTheDocument()

    await user.click(submit)
    expect(await screen.findByText(/Verification keeps failing/)).toBeInTheDocument()
    expect(screen.queryByText(/tap Submit again/)).not.toBeInTheDocument()
  })

  it('calls onPreviewSubmit with a built resource instead of posting, when provided', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetchOk()
    const onPreviewSubmit = vi.fn()
    const category = makeCategory({ id: 'grocery' })
    renderWithProviders(<ListingForm category={category} mode="create" {...handlers} onPreviewSubmit={onPreviewSubmit} />)

    await user.type(screen.getByLabelText(/Name/), 'Preview Mart')
    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    expect(onPreviewSubmit).toHaveBeenCalledTimes(1)
    expect(onPreviewSubmit.mock.calls[0][0]).toMatchObject({ category: 'grocery', name: 'Preview Mart' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('autofills name and phone from a selected address, live-formatting the phone', async () => {
    const user = userEvent.setup()
    const category = makeCategory()
    renderWithProviders(<ListingForm category={category} mode="create" {...handlers} />)

    await user.click(screen.getByRole('button', { name: 'simulate place select' }))

    expect(screen.getByDisplayValue('Autofilled Name')).toBeInTheDocument()
    expect(screen.getByDisplayValue('(215) 555-9999')).toBeInTheDocument()
  })

  describe('a multi-select detail field', () => {
    it('lets more than one option be chosen, and shows a summary of what is picked', async () => {
      const user = userEvent.setup()
      const category = makeCategory({ detailFields: [selectField({ multiSelect: true })] })
      renderWithProviders(<ListingForm category={category} mode="create" {...handlers} />)

      await user.click(screen.getByLabelText('Cuisine'))
      await user.click(screen.getByRole('checkbox', { name: 'Italian' }))
      await user.click(screen.getByRole('checkbox', { name: 'Deli' }))

      expect(screen.getByText('Italian, Deli')).toBeInTheDocument()
    })
  })

  describe('a single-select detail field with "Other…"', () => {
    it('reveals a free-text box, whose value becomes the field value', async () => {
      const user = userEvent.setup()
      const category = makeCategory({ detailFields: [selectField({ allowOther: true })] })
      renderWithProviders(<ListingForm category={category} mode="create" {...handlers} />)

      await user.selectOptions(screen.getByLabelText('Cuisine'), 'Other…')
      const otherInput = screen.getByPlaceholderText('Please specify')
      await user.type(otherInput, 'Fusion')

      expect(otherInput).toHaveValue('Fusion')
    })

    it('reopens with the free-text box already showing an unrecognized saved value', () => {
      const category = makeCategory({ detailFields: [selectField({ allowOther: true })] })
      const existing = { ...makeListing(), cuisine: 'Fusion' } as unknown as DirectoryResource
      renderWithProviders(<ListingForm category={category} mode="edit" existing={existing} {...handlers} />)

      expect(screen.getByDisplayValue('Fusion')).toBeInTheDocument()
    })
  })

  // Address/Name/Phone (plus any coreSection field) are grouped under one
  // "Basics" heading, open by default; every other field lands in exactly
  // one named, independently-collapsible group — its formSection if the
  // category defines one, else the generic "More details" catch-all — so a
  // category with no sections configured yet still declutters instead of
  // showing everything flat.
  describe('field grouping', () => {
    it('groups Address, Name and Phone under an open "Basics" section', () => {
      renderWithProviders(<ListingForm category={makeCategory()} mode="create" {...handlers} />)

      const basicsToggle = screen.getByRole('button', { name: 'Basics' })
      expect(basicsToggle).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByLabelText('Address')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('e.g. Kosher Mart')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('(215) 555-0100')).toBeInTheDocument()
    })

    it('collapses Basics on click without dropping what was already typed', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ListingForm category={makeCategory()} mode="create" {...handlers} />)

      await user.type(screen.getByPlaceholderText('e.g. Kosher Mart'), 'Kosher Mart')
      await user.click(screen.getByRole('button', { name: 'Basics' }))

      expect(screen.getByRole('button', { name: 'Basics' })).toHaveAttribute('aria-expanded', 'false')
      // Hidden, not unmounted — the typed value survives the collapse.
      expect(screen.getByPlaceholderText('e.g. Kosher Mart')).toHaveValue('Kosher Mart')
    })

    it('puts fields with no formSection into a collapsed "More details" group, once there are 3+', () => {
      const category = makeCategory({
        detailFields: [
          textField({ key: 'notes', label: 'Notes' }),
          textField({ key: 'notes2', label: 'Notes 2' }),
          textField({ key: 'notes3', label: 'Notes 3' }),
        ],
      })
      renderWithProviders(<ListingForm category={category} mode="create" {...handlers} />)

      const toggle = screen.getByRole('button', { name: /More details/ })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      expect(screen.getByLabelText('Notes')).toBeInTheDocument()
    })

    // A one- or two-field "More details" is nothing an admin bothered
    // naming a section for — the full label-and-collapse treatment (a
    // header, a chevron, a click just to see the one field) is more
    // machinery than the content justifies. Below 3 fields it's a plain
    // box instead: no label, no collapse, always visible — the same
    // treatment RemovalRequest's own reason/details box already uses for
    // the same reason.
    it('renders a "More details" catch-all under 3 fields as a plain, unlabeled, non-collapsible box', () => {
      const category = makeCategory({
        detailFields: [textField({ key: 'notes', label: 'Notes' }), textField({ key: 'notes2', label: 'Notes 2' })],
      })
      renderWithProviders(<ListingForm category={category} mode="create" {...handlers} />)

      expect(screen.queryByText(/more details/i)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Notes/ })).not.toBeInTheDocument()
      // Both fields already visible, no click needed.
      expect(screen.getByLabelText('Notes')).toBeInTheDocument()
      expect(screen.getByLabelText('Notes 2')).toBeInTheDocument()
    })

    it('still gives a single "More details" field the plain box treatment', () => {
      const category = makeCategory({ detailFields: [textField({ key: 'notes', label: 'Notes' })] })
      renderWithProviders(<ListingForm category={category} mode="create" {...handlers} />)

      expect(screen.queryByText(/more details/i)).not.toBeInTheDocument()
      expect(screen.getByLabelText('Notes')).toBeInTheDocument()
    })

    // When "More details" would be the ONLY group a category ever shows at
    // all (no admin has defined any real section), splitting it into its
    // own box below Basics — even an unlabeled one — is a distinction
    // without a difference: the entire optional part of the form already IS
    // that one small set of fields. It folds straight into Basics instead,
    // so the form is genuinely one box, confirmed here by collapsing Basics
    // and checking the "extra" field disappears with it.
    it('folds a lone small "More details" catch-all into Basics, not a separate box', async () => {
      const user = userEvent.setup()
      const category = makeCategory({ detailFields: [textField({ key: 'notes', label: 'Notes' })] })
      renderWithProviders(<ListingForm category={category} mode="create" {...handlers} />)

      // Only one group box (Basics) in the whole form.
      expect(screen.getAllByRole('button', { name: 'Basics' })).toHaveLength(1)
      expect(screen.getByLabelText('Notes')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Basics' }))
      expect(screen.getByLabelText('Notes').closest('.hidden')).not.toBeNull()
    })

    // The size gate still applies even when it's the only block: a lone
    // bucket of several fields is exactly the "wall of fields in one box"
    // this whole redesign exists to avoid, so it keeps its own collapsible
    // box rather than ballooning Basics — confirmed by checking Basics
    // itself doesn't contain the extra fields.
    it('does not fold a lone "More details" catch-all into Basics once it has 3+ fields', () => {
      const category = makeCategory({
        detailFields: [
          textField({ key: 'notes', label: 'Notes' }),
          textField({ key: 'notes2', label: 'Notes 2' }),
          textField({ key: 'notes3', label: 'Notes 3' }),
        ],
      })
      renderWithProviders(<ListingForm category={category} mode="create" {...handlers} />)

      const basicsBox = screen.getByRole('button', { name: 'Basics' }).closest('div')
      expect(basicsBox?.textContent).not.toContain('Notes')
      expect(screen.getByRole('button', { name: /More details/ })).toBeInTheDocument()
    })

    // A small "More details" alongside a real named section is a different
    // case from being the form's only content — it still reads as one
    // bucket among several, so it keeps the plain-box treatment (no merge).
    it('keeps a small "More details" as its own box when a real section also exists', () => {
      const category = makeCategory({
        formSections: [{ key: 'kosher', label: 'Kosher details' }],
        detailFields: [
          textField({ key: 'certification', label: 'Certification', formSection: 'kosher' }),
          textField({ key: 'notes', label: 'Notes' }),
        ],
      })
      renderWithProviders(<ListingForm category={category} mode="create" {...handlers} />)

      const basicsBox = screen.getByRole('button', { name: 'Basics' }).closest('div')
      expect(basicsBox?.textContent).not.toContain('Notes')
      expect(screen.getByLabelText('Notes')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Kosher details/ })).toBeInTheDocument()
    })

    // A photo is consistently the field least likely to be filled in at
    // submission time (same reasoning "More details" itself sorts last) —
    // so it renders after every other field in its own group, regardless of
    // where the category happens to list it among its other fields.
    it('renders the photo field last within whatever group it lands in', () => {
      const category = makeCategory({
        formSections: [{ key: 'kosher', label: 'Kosher details' }],
        detailFields: [
          // key must be PHOTO_FIELD_KEY ('photo') — that's what the
          // ordering rule actually keys off, not the field's label.
          imageField({ key: 'photo', formSection: 'kosher' }),
          textField({ key: 'certification', label: 'Certification', formSection: 'kosher' }),
        ],
      })
      renderWithProviders(<ListingForm category={category} mode="create" {...handlers} />)

      const photoLabel = screen.getByText('Photo')
      const certification = screen.getByLabelText('Certification')
      // DOCUMENT_POSITION_FOLLOWING (4) means the photo field comes after
      // Certification, the reverse of the category's own field order above.
      expect(certification.compareDocumentPosition(photoLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('gives a real admin-named formSection its header even with just one field (the <3 rule is "More details"-only)', () => {
      const category = makeCategory({
        formSections: [{ key: 'kosher', label: 'Kosher details' }],
        detailFields: [textField({ key: 'certification', label: 'Certification', formSection: 'kosher' })],
      })
      renderWithProviders(<ListingForm category={category} mode="create" {...handlers} />)

      expect(screen.getByRole('button', { name: /Kosher details/ })).toBeInTheDocument()
    })

    it('groups fields sharing a formSection under its admin-defined label and description', () => {
      const category = makeCategory({
        formSections: [{ key: 'kosher', label: 'Kosher details', description: 'certification, dairy/meat' }],
        detailFields: [
          textField({ key: 'certification', label: 'Certification', formSection: 'kosher' }),
          textField({ key: 'dietType', label: 'Dairy / meat / pareve', formSection: 'kosher' }),
        ],
      })
      renderWithProviders(<ListingForm category={category} mode="create" {...handlers} />)

      expect(screen.getByRole('button', { name: /Kosher details/ })).toBeInTheDocument()
      expect(screen.getByText('certification, dairy/meat')).toBeInTheDocument()
      expect(screen.getByLabelText('Certification')).toBeInTheDocument()
      expect(screen.getByLabelText('Dairy / meat / pareve')).toBeInTheDocument()
      // Not also duplicated into the generic catch-all.
      expect(screen.queryByRole('button', { name: /More details/ })).not.toBeInTheDocument()
    })

    it('auto-opens a group that already has a value in edit mode, without an empty hint', () => {
      const category = makeCategory({
        formSections: [{ key: 'kosher', label: 'Kosher details' }],
        detailFields: [textField({ key: 'certification', label: 'Certification', formSection: 'kosher' })],
      })
      const existing = { ...makeListing(), certification: 'OU' } as unknown as DirectoryResource
      renderWithProviders(<ListingForm category={category} mode="edit" existing={existing} {...handlers} />)

      const toggle = screen.getByRole('button', { name: /Kosher details/ })
      expect(toggle).toHaveAttribute('aria-expanded', 'true')
      expect(toggle).not.toHaveTextContent('not added')
    })

    it('leaves an empty group collapsed in edit mode and labels it "not added"', () => {
      const category = makeCategory({
        formSections: [{ key: 'kosher', label: 'Kosher details' }],
        detailFields: [textField({ key: 'certification', label: 'Certification', formSection: 'kosher' })],
      })
      renderWithProviders(<ListingForm category={category} mode="edit" existing={makeListing()} {...handlers} />)

      const toggle = screen.getByRole('button', { name: /Kosher details/ })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      expect(toggle).toHaveTextContent('not added')
    })

    it('does not label an empty group in create mode, where nothing has data yet', () => {
      const category = makeCategory({
        formSections: [{ key: 'kosher', label: 'Kosher details' }],
        detailFields: [textField({ key: 'certification', label: 'Certification', formSection: 'kosher' })],
      })
      renderWithProviders(<ListingForm category={category} mode="create" {...handlers} />)

      expect(screen.getByRole('button', { name: /Kosher details/ })).not.toHaveTextContent('not added')
    })

    it('places Submit after every field group, including a collapsed one', () => {
      const category = makeCategory({
        detailFields: [
          textField({ key: 'notes', label: 'Notes' }),
          textField({ key: 'notes2', label: 'Notes 2' }),
          textField({ key: 'notes3', label: 'Notes 3' }),
        ],
      })
      const { container } = renderWithProviders(<ListingForm category={category} mode="create" {...handlers} />)

      const moreDetails = screen.getByRole('button', { name: /More details/ })
      const submit = screen.getByRole('button', { name: 'Submit for review' })
      // DOCUMENT_POSITION_FOLLOWING (4) means `submit` comes after `moreDetails`.
      expect(moreDetails.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(container).toBeInTheDocument()
    })

    // "More details" is whatever's left over once an admin has named real
    // sections — usually the fields least likely to matter to whoever's
    // submitting (a photo, a short blurb) — and shouldn't out-rank a group
    // someone actually curated just because its fields happen to sit
    // earlier in the category's own field order.
    it('renders "More details" last, even when its fields come first in the category\'s field order', () => {
      const category = makeCategory({
        formSections: [{ key: 'kosher', label: 'Kosher details' }],
        detailFields: [
          // 3 fields, no section → "More details" keeps its collapsible
          // header (below 3, it'd be a plain box with no button to query).
          textField({ key: 'notes', label: 'Notes' }),
          textField({ key: 'notes2', label: 'Notes 2' }),
          textField({ key: 'notes3', label: 'Notes 3' }),
          textField({ key: 'certification', label: 'Certification', formSection: 'kosher' }),
        ],
      })
      renderWithProviders(<ListingForm category={category} mode="create" {...handlers} />)

      const moreDetails = screen.getByRole('button', { name: /More details/ })
      const kosher = screen.getByRole('button', { name: /Kosher details/ })
      // DOCUMENT_POSITION_FOLLOWING (4) means `moreDetails` comes after `kosher`,
      // the reverse of the category's own field order above.
      expect(kosher.compareDocumentPosition(moreDetails) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    // A field group used to clip a multi-select field's own dropdown to the
    // group's box (overflow-hidden, meant only to keep the header's rounded
    // corners tidy, clipped the popover too since it's position: absolute
    // and meant to render outside the box). jsdom doesn't lay out or clip
    // anything, so this can't observe the visual bug directly — it instead
    // asserts the specific class that caused it is gone, which is what
    // actually fixed it.
    it('does not clip a field group\'s contents (no overflow-hidden on the box)', () => {
      const category = makeCategory({
        detailFields: [
          textField({ key: 'notes', label: 'Notes' }),
          textField({ key: 'notes2', label: 'Notes 2' }),
          textField({ key: 'notes3', label: 'Notes 3' }),
        ],
      })
      renderWithProviders(<ListingForm category={category} mode="create" {...handlers} />)

      const basicsBox = screen.getByRole('button', { name: 'Basics' }).closest('div')
      const moreDetailsBox = screen.getByRole('button', { name: /More details/ }).closest('div')
      expect(basicsBox?.className).not.toContain('overflow-hidden')
      expect(moreDetailsBox?.className).not.toContain('overflow-hidden')
    })
  })
})
