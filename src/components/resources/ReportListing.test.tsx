// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeListing } from '@/test/providerFixtures'
import ReportListing from './ReportListing'

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
  it('names the listing and shows the labeled note/name fields', () => {
    const listing = makeListing({ id: 'listing-1', name: 'Kosher Mart' })
    render(<ReportListing listing={listing} upLabel="Grocery Stores" {...handlers} />)

    expect(screen.getByText('Kosher Mart')).toBeInTheDocument()
    expect(screen.getByLabelText("What's the issue?")).toBeInTheDocument()
    expect(screen.getByLabelText('Your name (optional)')).toBeInTheDocument()
  })

  it('submits a delete-operation report with the note and target listing id', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch({ ok: true })
    const listing = makeListing({ id: 'listing-1', name: 'Kosher Mart' })
    render(<ReportListing listing={listing} upLabel="Grocery Stores" {...handlers} />)

    await user.type(screen.getByLabelText("What's the issue?"), 'Closed permanently.')
    await user.type(screen.getByLabelText('Your name (optional)'), 'A Neighbor')
    await user.click(screen.getByRole('button', { name: 'Submit report' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/submissions')
    const body = JSON.parse(init.body)
    expect(body.operation).toBe('delete')
    expect(body.targetType).toBe('listing')
    expect(body.targetId).toBe('listing-1')
    expect(body.note).toBe('Closed permanently.')
    expect(body.submittedBy).toEqual({ name: 'A Neighbor' })

    expect(await screen.findByText('Thanks for the heads-up')).toBeInTheDocument()
  })

  it('omits note and submittedBy when left blank, rather than sending empty strings', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch({ ok: true })
    render(<ReportListing listing={makeListing()} upLabel="Grocery Stores" {...handlers} />)

    await user.click(screen.getByRole('button', { name: 'Submit report' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.note).toBeUndefined()
    expect(body.submittedBy).toBeUndefined()
  })

  it('shows the server errors and stays on the form when the report is rejected', async () => {
    const user = userEvent.setup()
    stubFetch({ ok: false, errors: ['Please slow down and try again.'] })
    render(<ReportListing listing={makeListing()} upLabel="Grocery Stores" {...handlers} />)

    await user.click(screen.getByRole('button', { name: 'Submit report' }))

    expect(await screen.findByText('Please slow down and try again.')).toBeInTheDocument()
    expect(screen.queryByText('Thanks for the heads-up')).not.toBeInTheDocument()
  })

  it('shows a network-error fallback message', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    render(<ReportListing listing={makeListing()} upLabel="Grocery Stores" {...handlers} />)

    await user.click(screen.getByRole('button', { name: 'Submit report' }))

    expect(await screen.findByText(/Network error/)).toBeInTheDocument()
  })

  it('in preview mode, shows the confirmation without ever calling fetch', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch({ ok: true })
    render(<ReportListing listing={makeListing()} upLabel="Grocery Stores" preview {...handlers} />)

    await user.click(screen.getByRole('button', { name: 'Submit report' }))

    expect(await screen.findByText('Thanks for the heads-up')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("the confirmation screen's Up button calls onSubmitted, not onUp", async () => {
    const user = userEvent.setup()
    const onUp = vi.fn()
    const onSubmitted = vi.fn()
    render(
      <ReportListing listing={makeListing()} upLabel="Grocery Stores" onUp={onUp} onSubmitted={onSubmitted} preview />,
    )

    await user.click(screen.getByRole('button', { name: 'Submit report' }))
    await screen.findByText('Thanks for the heads-up')

    await user.click(screen.getByRole('button', { name: /Grocery Stores/ }))
    expect(onSubmitted).toHaveBeenCalledTimes(1)
    expect(onUp).not.toHaveBeenCalled()
  })
})
