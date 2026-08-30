// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import type { CategoryField } from '@/lib/categories'
import type { DirectoryResource } from '@/types'
import ListingForm from './ListingForm'

// AddressInput loads the real Google Maps SDK on mount (see loadGoogleMaps.ts)
// — no equivalent under jsdom, same reasoning ResourceMap gets stubbed in
// ResourceMapView.test.tsx/Landing.test.tsx's HomeMap. The stub exposes a
// plain controlled input plus a button that fires onPlaceSelect/onCoords with
// a fixed payload, enough to exercise handlePlaceSelect's autofill logic
// without the real widget.
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
    render(<ListingForm category={category} mode="create" {...handlers} />)

    expect(screen.getByRole('heading', { name: 'Add a Grocery Store' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit for review' })).toBeInTheDocument()
  })

  it('shows the edit heading, submit label, and pre-fills from the existing listing', () => {
    const category = makeCategory()
    const existing = makeListing({ id: 'listing-1', name: 'Kosher Mart', phone: '(215) 555-0100', address: '1 Main St' })
    render(<ListingForm category={category} mode="edit" existing={existing} {...handlers} />)

    expect(screen.getByRole('heading', { name: 'Suggest an edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit edit for review' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Kosher Mart')).toBeInTheDocument()
    expect(screen.getByDisplayValue('(215) 555-0100')).toBeInTheDocument()
  })

  it('hides the Address field when the category has no address, and Phone when it has none', () => {
    const category = makeCategory({ hasAddress: false, hasPhone: false })
    render(<ListingForm category={category} mode="create" {...handlers} />)

    expect(screen.queryByLabelText('Address')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Phone')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Name/)).toBeInTheDocument()
  })

  it('a showIf-gated field only appears once its trigger field is checked', async () => {
    const user = userEvent.setup()
    const category = makeCategory({
      detailFields: [booleanField(), textField({ showIf: { field: 'isKosher', equals: true } })],
    })
    render(<ListingForm category={category} mode="create" {...handlers} />)

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
    render(<ListingForm category={category} mode="create" {...handlers} />)

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
    render(<ListingForm category={category} mode="create" {...handlers} />)

    await user.type(screen.getByLabelText(/Name/), 'Kosher Mart')
    await user.type(screen.getByLabelText('Address'), '1 Main St')
    await user.type(screen.getByLabelText('Phone'), '2155550100')
    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/submissions')
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
    render(<ListingForm category={category} mode="edit" existing={existing} {...handlers} />)

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
    render(<ListingForm category={category} mode="edit" existing={existing} {...handlers} />)

    // Only filling in contact info — no listing field touched at all.
    await user.type(screen.getByLabelText(/Your name/), 'A Neighbor')
    await user.click(screen.getByRole('button', { name: 'Submit edit for review' }))

    expect(await screen.findByText(/haven.t changed anything yet/)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses to submit an edit where a field was changed and then changed right back', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetchOk({ ok: true })
    const category = makeCategory()
    const existing = makeListing({ id: 'listing-42', name: 'Old Name' })
    render(<ListingForm category={category} mode="edit" existing={existing} {...handlers} />)

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
    render(<ListingForm category={category} mode="create" {...handlers} />)

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
    render(<ListingForm category={category} mode="create" {...handlers} />)

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
    render(<ListingForm category={makeCategory()} mode="create" {...handlers} />)

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
    render(<ListingForm category={makeCategory()} mode="create" {...handlers} />)

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
    render(<ListingForm category={category} mode="create" {...handlers} onPreviewSubmit={onPreviewSubmit} />)

    await user.type(screen.getByLabelText(/Name/), 'Preview Mart')
    await user.click(screen.getByRole('button', { name: 'Submit for review' }))

    expect(onPreviewSubmit).toHaveBeenCalledTimes(1)
    expect(onPreviewSubmit.mock.calls[0][0]).toMatchObject({ category: 'grocery', name: 'Preview Mart' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('autofills name and phone from a selected address, live-formatting the phone', async () => {
    const user = userEvent.setup()
    const category = makeCategory()
    render(<ListingForm category={category} mode="create" {...handlers} />)

    await user.click(screen.getByRole('button', { name: 'simulate place select' }))

    expect(screen.getByDisplayValue('Autofilled Name')).toBeInTheDocument()
    expect(screen.getByDisplayValue('(215) 555-9999')).toBeInTheDocument()
  })

  describe('a multi-select detail field', () => {
    it('lets more than one option be chosen, and shows a summary of what is picked', async () => {
      const user = userEvent.setup()
      const category = makeCategory({ detailFields: [selectField({ multiSelect: true })] })
      render(<ListingForm category={category} mode="create" {...handlers} />)

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
      render(<ListingForm category={category} mode="create" {...handlers} />)

      await user.selectOptions(screen.getByLabelText('Cuisine'), 'Other…')
      const otherInput = screen.getByPlaceholderText('Please specify')
      await user.type(otherInput, 'Fusion')

      expect(otherInput).toHaveValue('Fusion')
    })

    it('reopens with the free-text box already showing an unrecognized saved value', () => {
      const category = makeCategory({ detailFields: [selectField({ allowOther: true })] })
      const existing = { ...makeListing(), cuisine: 'Fusion' } as unknown as DirectoryResource
      render(<ListingForm category={category} mode="edit" existing={existing} {...handlers} />)

      expect(screen.getByDisplayValue('Fusion')).toBeInTheDocument()
    })
  })
})
