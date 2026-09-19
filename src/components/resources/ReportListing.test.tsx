// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeListing } from '@/test/providerFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import ReportListing from './ReportListing'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function stubFetch(body: Record<string, unknown>, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, json: async () => body })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const handlers = { onUp: vi.fn(), onSubmitted: vi.fn() }

describe('ReportListing', () => {
  // The only way to leave the form without submitting it, now that the
  // Breadcrumb that used to do this (and also, redundantly, name the
  // destination) is gone — see the component's own doc on the Back button
  // right above the form.
  it('the form\'s own Back button calls onUp, not onSubmitted', async () => {
    const user = userEvent.setup()
    const onUp = vi.fn()
    const onSubmitted = vi.fn()
    renderWithProviders(<ReportListing listing={makeListing()} onUp={onUp} onSubmitted={onSubmitted} />)

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(onUp).toHaveBeenCalledTimes(1)
    expect(onSubmitted).not.toHaveBeenCalled()
  })

  it('names the listing and shows the labeled note/name fields', () => {
    const listing = makeListing({ id: 'listing-1', name: 'Kosher Mart' })
    renderWithProviders(<ReportListing listing={listing} {...handlers} />)

    expect(screen.getByText('Kosher Mart')).toBeInTheDocument()
    expect(screen.getByLabelText("What's the issue?")).toBeInTheDocument()
    expect(screen.getByLabelText('Your name (optional)')).toBeInTheDocument()
  })

  it('submits a delete-operation report with the note and target listing id', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch({ ok: true })
    const listing = makeListing({ id: 'listing-1', name: 'Kosher Mart' })
    renderWithProviders(<ReportListing listing={listing} {...handlers} />)

    await user.type(screen.getByLabelText("What's the issue?"), 'Closed permanently.')
    await user.type(screen.getByLabelText('Your name (optional)'), 'A Neighbor')
    await user.click(screen.getByRole('button', { name: 'Submit report' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/submissions?community=test-community')
    const body = JSON.parse(init.body)
    expect(body.operation).toBe('delete')
    expect(body.targetType).toBe('listing')
    expect(body.targetId).toBe('listing-1')
    expect(body.note).toBe('Closed permanently.')
    expect(body.submittedBy).toEqual({ name: 'A Neighbor' })

    expect(await screen.findByRole('heading', { name: 'Thanks for the heads-up' })).toBeInTheDocument()
  })

  it('omits note and submittedBy when left blank, rather than sending empty strings', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch({ ok: true })
    renderWithProviders(<ReportListing listing={makeListing()} {...handlers} />)

    await user.click(screen.getByRole('button', { name: 'Submit report' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.note).toBeUndefined()
    expect(body.submittedBy).toBeUndefined()
  })

  it('shows the server errors and stays on the form when the report is rejected', async () => {
    const user = userEvent.setup()
    stubFetch({ ok: false, errors: ['Please slow down and try again.'] })
    renderWithProviders(<ReportListing listing={makeListing()} {...handlers} />)

    await user.click(screen.getByRole('button', { name: 'Submit report' }))

    expect(await screen.findByText('Please slow down and try again.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Thanks for the heads-up' })).not.toBeInTheDocument()
  })

  it('shows a network-error fallback message', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    renderWithProviders(<ReportListing listing={makeListing()} {...handlers} />)

    await user.click(screen.getByRole('button', { name: 'Submit report' }))

    expect(await screen.findByText(/Network error/)).toBeInTheDocument()
  })

  it('in preview mode, shows the confirmation without ever calling fetch', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch({ ok: true })
    renderWithProviders(<ReportListing listing={makeListing()} preview {...handlers} />)

    await user.click(screen.getByRole('button', { name: 'Submit report' }))

    expect(await screen.findByRole('heading', { name: 'Thanks for the heads-up' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("the confirmation screen's Back button calls onSubmitted, not onUp", async () => {
    const user = userEvent.setup()
    const onUp = vi.fn()
    const onSubmitted = vi.fn()
    renderWithProviders(
      <ReportListing listing={makeListing()} onUp={onUp} onSubmitted={onSubmitted} preview />,
    )

    await user.click(screen.getByRole('button', { name: 'Submit report' }))
    await screen.findByRole('heading', { name: 'Thanks for the heads-up' })

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(onSubmitted).toHaveBeenCalledTimes(1)
    expect(onUp).not.toHaveBeenCalled()
  })

  // `embedded` — rendered inside a caller-owned overlay (mobile's Report
  // sheet) instead of as this screen's own top-level content. See the
  // prop's own doc for why: claiming the shared mobile header here would
  // rename it out from under whatever screen is actually current, since
  // the sheet is layered on top of it rather than replacing it.
  describe('embedded', () => {
    it('renders no Back control or heading of its own — the sheet has its own title/close, not this form\'s navigation', async () => {
      const user = userEvent.setup()
      stubFetch({ ok: true })
      renderWithProviders(
        <ReportListing listing={makeListing()} {...handlers} embedded />,
      )

      expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Report a problem' })).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Submit report' }))
      expect(await screen.findByText(/review this and update the listing/i)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
    })

    it('still submits the same report the non-embedded form does', async () => {
      const user = userEvent.setup()
      const fetchMock = stubFetch({ ok: true })
      const listing = makeListing({ id: 'listing-1', name: 'Kosher Mart' })
      renderWithProviders(
        <ReportListing listing={listing} {...handlers} embedded />,
      )

      await user.type(screen.getByLabelText("What's the issue?"), 'Closed permanently.')
      await user.click(screen.getByRole('button', { name: 'Submit report' }))

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.targetId).toBe('listing-1')
      expect(body.note).toBe('Closed permanently.')
    })
  })
})
