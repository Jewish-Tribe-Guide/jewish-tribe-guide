// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import RemovalRequest from './RemovalRequest'

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

const listing = { id: 'listing-1', name: 'Kosher Mart' }
// ListingForm now owns the trigger button and mounting/showing this panel —
// this suite exercises the panel on its own, so it's always "open" as far as
// this component is concerned.
function setup(props: Partial<React.ComponentProps<typeof RemovalRequest>> = {}) {
  const handlers = { onDone: vi.fn(), onCancel: vi.fn(), resetTurnstile: vi.fn() }
  renderWithProviders(
    <RemovalRequest listing={listing} turnstileToken="tok" canSubmit honeypot="" {...handlers} {...props} />,
  )
  return handlers
}

describe('RemovalRequest', () => {
  // No title or explanatory copy of its own any more — the embedding caller
  // (ListingDetailModal/MapPlaceDetail/FindResources) shows "Request removal
  // of {name}" as its own dialog title via onRemovalOpenChange, instead of a
  // second, smaller one repeated here. Covered by each of those components'
  // own tests, not this one, which has no such caller to report to.
  it('shows the reason picker, details and a request worded as a request (not "Delete")', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Confirm removal request' })).toBeTruthy()
    expect(screen.queryByText(/delete/i)).toBeNull()
    expect(screen.getByRole('combobox', { name: /why should .* be removed/i })).toBeTruthy()
  })

  it('calls onCancel from Cancel, without submitting anything', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch({ ok: true })
    const { onCancel } = setup()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('files a reviewed removal (operation delete) for this listing, with the reason and details in the note', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch({ ok: true })
    const { onDone } = setup({ submittedBy: { name: 'Dana' }, honeypot: '' })
    await user.selectOptions(screen.getByRole('combobox'), 'Duplicate listing')
    await user.type(screen.getByRole('textbox', { name: /details/i }), 'Same as Kosher Market')
    await user.click(screen.getByRole('button', { name: 'Confirm removal request' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/submissions')
    expect(JSON.parse(init.body)).toEqual({
      operation: 'delete',
      targetType: 'listing',
      targetId: 'listing-1',
      note: 'Duplicate listing: Same as Kosher Market',
      submittedBy: { name: 'Dana' },
      company: '',
      turnstileToken: 'tok',
    })
  })

  it('sends just the reason when no details are given', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch({ ok: true })
    setup()
    await user.click(screen.getByRole('button', { name: 'Confirm removal request' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).note).toBe('Permanently closed')
  })

  it('waits for the Turnstile challenge instead of submitting without a token', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch({ ok: true })
    setup({ canSubmit: false, turnstileToken: '' })
    const button = screen.getByRole('button', { name: 'Verifying…' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    await user.click(button)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the server’s reason and does not report done when the request is refused', async () => {
    const user = userEvent.setup()
    stubFetch({ ok: false, errors: ['This action is not available for this category.'] }, false)
    const { onDone } = setup()
    await user.click(screen.getByRole('button', { name: 'Confirm removal request' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This action is not available for this category.')
    expect(onDone).not.toHaveBeenCalled()
  })

  it('refreshes an expired challenge once, then stops promising a retry will work', async () => {
    const user = userEvent.setup()
    stubFetch({ ok: false, code: 'turnstile', errors: ['Verification failed.'] }, false)
    const { resetTurnstile } = setup()
    await user.click(screen.getByRole('button', { name: 'Confirm removal request' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/refreshed it/)
    expect(resetTurnstile).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Confirm removal request' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/keeps failing/))
    expect(resetTurnstile).toHaveBeenCalledTimes(1)
  })

  it('reports a network failure', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    setup()
    await user.click(screen.getByRole('button', { name: 'Confirm removal request' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Network error/)
  })
})
