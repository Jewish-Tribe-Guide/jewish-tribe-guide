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
function setup(props: Partial<React.ComponentProps<typeof RemovalRequest>> = {}) {
  const handlers = { onDone: vi.fn(), resetTurnstile: vi.fn() }
  renderWithProviders(
    <RemovalRequest listing={listing} turnstileToken="tok" canSubmit honeypot="" {...handlers} {...props} />,
  )
  return handlers
}
const open = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /closed or shouldn.t be listed/i }))

describe('RemovalRequest', () => {
  it('starts as one quiet line, nothing else', () => {
    setup()
    expect(screen.getByRole('button', { name: /closed or shouldn.t be listed/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Request removal' })).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('opens a reason and details, worded as a request (not "Delete")', async () => {
    const user = userEvent.setup()
    setup()
    await open(user)
    expect(screen.getByText('Request removal of Kosher Mart')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Request removal' })).toBeTruthy()
    expect(screen.queryByText(/delete/i)).toBeNull()
    expect(screen.getByRole('combobox', { name: /why should it be removed/i })).toBeTruthy()
  })

  it('Cancel puts it back to the quiet line', async () => {
    const user = userEvent.setup()
    setup()
    await open(user)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('button', { name: 'Request removal' })).toBeNull()
    expect(screen.getByRole('button', { name: /closed or shouldn.t be listed/i })).toBeTruthy()
  })

  it('files a reviewed removal (operation delete) for this listing, with the reason and details in the note', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch({ ok: true })
    const { onDone } = setup({ submittedBy: { name: 'Dana' }, honeypot: '' })
    await open(user)
    await user.selectOptions(screen.getByRole('combobox'), 'Duplicate listing')
    await user.type(screen.getByRole('textbox', { name: /details/i }), 'Same as Kosher Market')
    await user.click(screen.getByRole('button', { name: 'Request removal' }))

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
    await open(user)
    await user.click(screen.getByRole('button', { name: 'Request removal' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).note).toBe('Permanently closed')
  })

  it('waits for the Turnstile challenge instead of submitting without a token', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch({ ok: true })
    setup({ canSubmit: false, turnstileToken: '' })
    await open(user)
    const button = screen.getByRole('button', { name: 'Verifying…' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    await user.click(button)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the server’s reason and does not report done when the request is refused', async () => {
    const user = userEvent.setup()
    stubFetch({ ok: false, errors: ['This action is not available for this category.'] }, false)
    const { onDone } = setup()
    await open(user)
    await user.click(screen.getByRole('button', { name: 'Request removal' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This action is not available for this category.')
    expect(onDone).not.toHaveBeenCalled()
  })

  it('refreshes an expired challenge once, then stops promising a retry will work', async () => {
    const user = userEvent.setup()
    stubFetch({ ok: false, code: 'turnstile', errors: ['Verification failed.'] }, false)
    const { resetTurnstile } = setup()
    await open(user)
    await user.click(screen.getByRole('button', { name: 'Request removal' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/refreshed it/)
    expect(resetTurnstile).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Request removal' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/keeps failing/))
    expect(resetTurnstile).toHaveBeenCalledTimes(1)
  })

  it('reports a network failure', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    setup()
    await open(user)
    await user.click(screen.getByRole('button', { name: 'Request removal' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Network error/)
  })
})
