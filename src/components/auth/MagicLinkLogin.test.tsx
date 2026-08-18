// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MagicLinkLogin from './MagicLinkLogin'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function stubFetch(body: Record<string, unknown>, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, json: async () => body })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const props = {
  requestLinkUrl: '/api/admin/request-link',
  emailLabel: 'Admin email',
  sentMessage: 'an authorized admin',
}

describe('MagicLinkLogin', () => {
  it('renders the given email label, associated with the input', () => {
    render(<MagicLinkLogin {...props} />)
    expect(screen.getByLabelText('Admin email')).toBeInTheDocument()
  })

  it('posts the trimmed email to requestLinkUrl on submit', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch({ ok: true })
    render(<MagicLinkLogin {...props} />)

    await user.type(screen.getByLabelText('Admin email'), '  admin@example.com  ')
    await user.click(screen.getByRole('button', { name: 'Send magic link' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/request-link')
    expect(JSON.parse(init.body)).toEqual({ email: 'admin@example.com' })
  })

  it('shows the sentMessage confirmation after a successful send, replacing the form', async () => {
    const user = userEvent.setup()
    stubFetch({ ok: true })
    render(<MagicLinkLogin {...props} />)

    await user.type(screen.getByLabelText('Admin email'), 'admin@example.com')
    await user.click(screen.getByRole('button', { name: 'Send magic link' }))

    expect(await screen.findByText(/an authorized admin/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Admin email')).not.toBeInTheDocument()
  })

  it('shows the button as sending while the request is in flight', async () => {
    const user = userEvent.setup()
    let resolveFetch: (v: unknown) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(new Promise((resolve) => { resolveFetch = resolve })),
    )
    render(<MagicLinkLogin {...props} />)

    await user.type(screen.getByLabelText('Admin email'), 'admin@example.com')
    await user.click(screen.getByRole('button', { name: 'Send magic link' }))

    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled()

    resolveFetch({ ok: true, json: async () => ({ ok: true }) })
    await screen.findByText(/an authorized admin/)
  })

  it('shows the server error message and stays on the form when the request fails', async () => {
    const user = userEvent.setup()
    stubFetch({ ok: false, error: 'Rate limited. Try again later.' })
    render(<MagicLinkLogin {...props} />)

    await user.type(screen.getByLabelText('Admin email'), 'admin@example.com')
    await user.click(screen.getByRole('button', { name: 'Send magic link' }))

    expect(await screen.findByText('Rate limited. Try again later.')).toBeInTheDocument()
    expect(screen.getByLabelText('Admin email')).toBeInTheDocument()
  })

  it('shows a fallback message on a network error', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    render(<MagicLinkLogin {...props} />)

    await user.type(screen.getByLabelText('Admin email'), 'admin@example.com')
    await user.click(screen.getByRole('button', { name: 'Send magic link' }))

    expect(await screen.findByText('network down')).toBeInTheDocument()
  })
})
