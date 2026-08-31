// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FeedbackForm from './FeedbackForm'
import { submitRequest } from '@/lib/submitRequest'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'

vi.mock('@/lib/submitRequest', () => ({ submitRequest: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => cleanup())

describe('FeedbackForm — inline variant (the mobile Feedback tab)', () => {
  it('lets the visitor send a second message after the first succeeds', async () => {
    vi.mocked(submitRequest).mockResolvedValue({ ok: true, requestId: 'r1' })
    const user = userEvent.setup()
    renderWithProviders(<FeedbackForm heading="Feedback" successMessage="Thanks!" variant="inline" />)

    await user.type(screen.getByLabelText('Your feedback'), 'First note')
    await user.click(screen.getByRole('button', { name: 'Send feedback' }))

    expect(await screen.findByText('Thanks for your note!')).toBeInTheDocument()
    // The bug this guards: the inline variant (no onClose to fall back on,
    // unlike the modal) used to leave the visitor stranded on the success
    // screen with no way back to a blank form for a second message.
    const again = screen.getByRole('button', { name: 'Send another message' })

    await user.click(again)

    const input = screen.getByLabelText('Your feedback') as HTMLTextAreaElement
    expect(input.value).toBe('')
    expect(screen.getByRole('button', { name: 'Send feedback' })).toBeInTheDocument()
  })

  it('does not offer "Send another message" in the modal variant, which closes instead', async () => {
    vi.mocked(submitRequest).mockResolvedValue({ ok: true, requestId: 'r1' })
    const user = userEvent.setup()
    renderWithProviders(<FeedbackForm heading="Feedback" successMessage="Thanks!" onClose={vi.fn()} />)

    await user.type(screen.getByLabelText('Your feedback'), 'A note')
    await user.click(screen.getByRole('button', { name: 'Send feedback' }))

    expect(await screen.findByText('Thanks for your note!')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send another message' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })
})
